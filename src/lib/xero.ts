import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Xero OAuth 2.0 helpers ────────────────────────────────────────────────────
// One-shot admin connect flow. Tokens stored in the singleton xero_connection
// row (id = 1). Access tokens live 30 minutes, refresh tokens rotate on every
// refresh and live 60 days.

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections'
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

// Granular scopes (required for Xero apps created on or after 2 March 2026).
// - accounting.invoices.read covers invoices, credit notes, purchase orders, etc.
// - accounting.contacts.read covers suppliers/customers (unchanged scope name).
// - accounting.attachments.read is required to fetch the original supplier
//   invoice files attached to bills in Xero.
// - offline_access is required for refresh tokens.
export const XERO_SCOPES = [
  'offline_access',
  'accounting.invoices.read',
  'accounting.contacts.read',
  'accounting.attachments.read',
].join(' ')

export type XeroConnectionRow = {
  id: number
  tenant_id: string
  tenant_name: string | null
  access_token: string
  refresh_token: string
  expires_at: string // ISO
  updated_at: string
}

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export function xeroRedirectUri(): string {
  const base = process.env.XERO_REDIRECT_URI
  if (!base) throw new Error('XERO_REDIRECT_URI is not set')
  return base
}

export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.XERO_CLIENT_ID
  if (!clientId) throw new Error('XERO_CLIENT_ID is not set')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: xeroRedirectUri(),
    scope: XERO_SCOPES,
    state,
  })
  return `${XERO_AUTH_URL}?${params.toString()}`
}

function basicAuthHeader(): string {
  const id = process.env.XERO_CLIENT_ID
  const secret = process.env.XERO_CLIENT_SECRET
  if (!id || !secret) throw new Error('XERO_CLIENT_ID / XERO_CLIENT_SECRET not set')
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number // seconds
  token_type: string
  scope: string
}

async function exchangeAuthCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: xeroRedirectUri(),
  })
  const resp = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Xero token exchange failed: ${resp.status} ${text}`)
  }
  return (await resp.json()) as TokenResponse
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const resp = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Xero token refresh failed: ${resp.status} ${text}`)
  }
  return (await resp.json()) as TokenResponse
}

async function getTenantId(accessToken: string): Promise<{ tenantId: string; tenantName: string | null }> {
  const resp = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Xero connections lookup failed: ${resp.status} ${text}`)
  }
  const arr = (await resp.json()) as Array<{ tenantId: string; tenantName?: string }>
  if (!arr?.length) throw new Error('No Xero tenants returned')
  return { tenantId: arr[0].tenantId, tenantName: arr[0].tenantName ?? null }
}

/**
 * Called once from the OAuth callback. Exchanges the auth code, looks up the
 * tenant, and upserts the singleton connection row.
 */
export async function completeXeroAuth(code: string): Promise<void> {
  const tokens = await exchangeAuthCode(code)
  const { tenantId, tenantName } = await getTenantId(tokens.access_token)
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const supabase = serviceClient()
  const { error } = await supabase
    .from('xero_connection')
    .upsert({
      id: 1,
      tenant_id: tenantId,
      tenant_name: tenantName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
  if (error) throw new Error(`Failed to store Xero connection: ${error.message}`)
}

export async function getXeroConnection(): Promise<XeroConnectionRow | null> {
  const supabase = serviceClient()
  const { data } = await supabase
    .from('xero_connection')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  return (data as XeroConnectionRow) ?? null
}

/**
 * Returns a valid access token, refreshing if the current one expires within
 * the next 60 seconds. Also rotates and persists the new refresh token.
 */
export async function getValidAccessToken(): Promise<{ accessToken: string; tenantId: string } | null> {
  const conn = await getXeroConnection()
  if (!conn) return null

  const expiresAt = new Date(conn.expires_at).getTime()
  const needsRefresh = expiresAt - Date.now() < 60_000

  if (!needsRefresh) {
    return { accessToken: conn.access_token, tenantId: conn.tenant_id }
  }

  const tokens = await refreshTokens(conn.refresh_token)
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const supabase = serviceClient()
  const { error } = await supabase
    .from('xero_connection')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
  if (error) throw new Error(`Failed to persist refreshed Xero tokens: ${error.message}`)

  return { accessToken: tokens.access_token, tenantId: conn.tenant_id }
}

/**
 * Generic Xero GET — callers pass the path under /api.xro/2.0 (e.g. "Invoices")
 * plus an optional query object.
 */
export async function xeroGet(path: string, query?: Record<string, string | undefined>): Promise<unknown> {
  const creds = await getValidAccessToken()
  if (!creds) throw new Error('Xero is not connected')

  const url = new URL(`${XERO_API_BASE}/${path.replace(/^\//, '')}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v)
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'Xero-Tenant-Id': creds.tenantId,
      Accept: 'application/json',
    },
  })
  if (!resp.ok) {
    const text = await resp.text()
    const retryAfter = resp.headers.get('retry-after')
    throw new Error(`Xero GET ${path} failed: ${resp.status} ${text}${retryAfter ? ` (retry-after: ${retryAfter}s)` : ''}`)
  }
  return resp.json()
}

// ── Bills (ACCPAY invoices) ───────────────────────────────────────────────────

export type BillFilters = {
  status?: string // AUTHORISED | PAID | DRAFT | SUBMITTED | VOIDED | DELETED
  dateFrom?: string // YYYY-MM-DD
  dateTo?: string // YYYY-MM-DD
  contactName?: string
  page?: number
}

type XeroLineItemRaw = {
  LineItemID?: string
  Description?: string
  Quantity?: number | string
  UnitAmount?: number | string
  LineAmount?: number | string
  AccountCode?: string
  TaxType?: string
  TaxAmount?: number | string
  DiscountRate?: number | string
}

type XeroInvoiceRaw = {
  InvoiceID: string
  InvoiceNumber?: string | null
  Reference?: string | null
  Contact?: { Name?: string }
  Date?: string
  DateString?: string
  DueDate?: string
  DueDateString?: string
  Status?: string
  SubTotal?: number | string
  TotalTax?: number | string
  Total?: number | string
  AmountDue?: number | string
  AmountPaid?: number | string
  CurrencyCode?: string
  LineAmountTypes?: string
  LineItems?: XeroLineItemRaw[]
  HasAttachments?: boolean
}

export type LineItem = {
  description: string
  quantity: number
  unitAmount: number
  lineAmount: number
  accountCode: string | null
  taxType: string | null
  taxAmount: number
}

export type BillSummary = {
  invoiceID: string
  invoiceNumber: string | null
  reference: string | null
  contactName: string
  date: string // YYYY-MM-DD
  dueDate: string | null
  status: string
  total: number
  amountDue: number
  amountPaid: number
  currencyCode: string
  hasAttachments: boolean
  subTotal?: number
  totalTax?: number
  lineAmountTypes?: string
  lineItems?: LineItem[]
}

function parseXeroDate(s: string | undefined | null): string | null {
  if (!s) return null
  // Modern Xero returns ISO strings on DateString/DueDateString
  // (e.g. "2024-03-15T00:00:00"). Legacy Xero returns the .NET JSON
  // format "/Date(1700000000000+0000)/" on Date/DueDate. Handle both.
  const msDate = s.match(/\/Date\((-?\d+)/)
  if (msDate) {
    return new Date(parseInt(msDate[1], 10)).toISOString().slice(0, 10)
  }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  // Last-resort parse — let the Date constructor try
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function mapLineItem(li: XeroLineItemRaw): LineItem {
  return {
    description: li.Description ?? '',
    quantity: Number(li.Quantity ?? 0),
    unitAmount: Number(li.UnitAmount ?? 0),
    lineAmount: Number(li.LineAmount ?? 0),
    accountCode: li.AccountCode ?? null,
    taxType: li.TaxType ?? null,
    taxAmount: Number(li.TaxAmount ?? 0),
  }
}

function mapBill(inv: XeroInvoiceRaw, opts: { includeLineItems?: boolean } = {}): BillSummary {
  const base: BillSummary = {
    invoiceID: inv.InvoiceID,
    invoiceNumber: inv.InvoiceNumber ?? null,
    reference: inv.Reference ?? null,
    contactName: inv.Contact?.Name ?? '(unknown)',
    date: parseXeroDate(inv.DateString ?? inv.Date) ?? '',
    dueDate: parseXeroDate(inv.DueDateString ?? inv.DueDate),
    status: inv.Status ?? '',
    total: Number(inv.Total ?? 0),
    amountDue: Number(inv.AmountDue ?? 0),
    amountPaid: Number(inv.AmountPaid ?? 0),
    currencyCode: inv.CurrencyCode ?? 'AUD',
    hasAttachments: Boolean(inv.HasAttachments),
    subTotal: inv.SubTotal !== undefined ? Number(inv.SubTotal) : undefined,
    totalTax: inv.TotalTax !== undefined ? Number(inv.TotalTax) : undefined,
    lineAmountTypes: inv.LineAmountTypes,
  }
  if (opts.includeLineItems && inv.LineItems) {
    base.lineItems = inv.LineItems.map(mapLineItem)
  }
  return base
}

export async function listBills(
  filters: BillFilters = {},
  opts: { includeLineItems?: boolean } = {}
): Promise<BillSummary[]> {
  // Build a Xero "where" clause. Bills = Type == "ACCPAY".
  const whereParts: string[] = ['Type=="ACCPAY"']
  if (filters.status) whereParts.push(`Status=="${filters.status}"`)
  if (filters.dateFrom) whereParts.push(`Date>=DateTime(${filters.dateFrom.replace(/-/g, ', ')})`)
  if (filters.dateTo) whereParts.push(`Date<=DateTime(${filters.dateTo.replace(/-/g, ', ')})`)
  if (filters.contactName) {
    // Xero's where supports Contact.Name equality; use contains via ToLower
    const safe = filters.contactName.replace(/"/g, '')
    whereParts.push(`Contact.Name!=null&&Contact.Name.ToLower().Contains("${safe.toLowerCase()}")`)
  }

  // Always request full invoice data (summaryOnly=false). The "summary" mode
  // Xero offers is a bandwidth optimisation but strips HasAttachments and
  // LineItems, both of which this app needs. If Xero adds new stripped fields
  // in future, this keeps us safe.
  const query: Record<string, string> = {
    where: whereParts.join('&&'),
    order: 'Date DESC',
    page: String(filters.page ?? 1),
    summaryOnly: 'false',
  }

  const data = (await xeroGet('Invoices', query)) as { Invoices?: XeroInvoiceRaw[] }
  const invoices: XeroInvoiceRaw[] = data?.Invoices ?? []

  return invoices.map((inv) => mapBill(inv, opts))
}

/**
 * Fetch all bills matching the given filters by walking through Xero's pages
 * (100 per page) until an empty page is returned or `maxPages` is hit.
 *
 * The default cap is 10 pages = 1000 bills, which is plenty for the Bills UI
 * default view. Callers wanting a smaller window should pass dateFrom/dateTo
 * filters instead of lowering the cap.
 */
export async function listAllBills(
  filters: BillFilters = {},
  opts: { includeLineItems?: boolean; maxPages?: number } = {}
): Promise<BillSummary[]> {
  const maxPages = opts.maxPages ?? 10
  const all: BillSummary[] = []
  for (let page = 1; page <= maxPages; page++) {
    const batch = await listBills({ ...filters, page }, { includeLineItems: opts.includeLineItems })
    all.push(...batch)
    // Xero returns at most 100 per page — anything less means we've hit the end.
    if (batch.length < 100) break
  }
  return all
}

/**
 * Fetch a single bill by its Xero InvoiceID. Returns full detail including
 * line items.
 */
export async function getBill(invoiceID: string): Promise<BillSummary | null> {
  const data = (await xeroGet(`Invoices/${encodeURIComponent(invoiceID)}`)) as { Invoices?: XeroInvoiceRaw[] }
  const inv = data?.Invoices?.[0]
  if (!inv) return null
  return mapBill(inv, { includeLineItems: true })
}

// ── Attachments ────────────────────────────────────────────────────────────────

export type AttachmentSummary = {
  attachmentID: string
  fileName: string
  mimeType: string
  contentLength: number
}

type XeroAttachmentRaw = {
  AttachmentID: string
  FileName: string
  MimeType: string
  ContentLength: number | string
  Url?: string
}

/**
 * List attachments on a bill (or any invoice). Returns the metadata Xero
 * stores; the actual file bytes have to be fetched separately via
 * fetchAttachment().
 */
export async function listBillAttachments(invoiceID: string): Promise<AttachmentSummary[]> {
  const data = (await xeroGet(
    `Invoices/${encodeURIComponent(invoiceID)}/Attachments`
  )) as { Attachments?: XeroAttachmentRaw[] }
  const items = data?.Attachments ?? []
  return items.map((a) => ({
    attachmentID: a.AttachmentID,
    fileName: a.FileName,
    mimeType: a.MimeType,
    contentLength: Number(a.ContentLength ?? 0),
  }))
}

/**
 * Download a single attachment as raw bytes plus its content type. The Xero
 * attachments endpoint streams the file directly when you Accept its mime
 * type (or a wildcard), so we use a slightly lower-level fetch than xeroGet().
 */
export async function fetchBillAttachment(
  invoiceID: string,
  fileName: string
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const creds = await getValidAccessToken()
  if (!creds) throw new Error('Xero is not connected')

  const url = `${XERO_API_BASE}/Invoices/${encodeURIComponent(invoiceID)}/Attachments/${encodeURIComponent(fileName)}`
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'Xero-Tenant-Id': creds.tenantId,
      Accept: '*/*',
    },
  })
  if (resp.status === 404) return null
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Xero attachment fetch failed: ${resp.status} ${text}`)
  }
  const buffer = await resp.arrayBuffer()
  const contentType = resp.headers.get('content-type') ?? 'application/octet-stream'
  return { buffer, contentType }
}
