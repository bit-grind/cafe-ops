import { NextResponse } from 'next/server'
import { requireAdmin, adminClient, getSessionUser } from '@/lib/adminAuth'
import { isOrganizationsEnabled } from '@/lib/tenant'

/**
 * GET /api/admin/suppliers
 *
 * Every Xero contact the business has received bills from, with invoice
 * counts and whether it's currently marked as a kitchen supplier. Backs
 * the admin "Suppliers" tab's checkbox list.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const session = await getSessionUser(req)
  const organizationId = isOrganizationsEnabled() ? session?.tenant?.organizationId : null
  if (isOrganizationsEnabled() && !organizationId) {
    return NextResponse.json({ error: 'Organization setup is required' }, { status: 400 })
  }

  const db = adminClient()
  let candidatesQuery = db
    .from('kitchen_supplier_candidates')
    .select('contact_name, invoice_count, last_invoice_date')
    .order('invoice_count', { ascending: false })
  let selectedQuery = db.from('kitchen_suppliers').select('contact_name')
  if (organizationId) {
    candidatesQuery = candidatesQuery.eq('organization_id', organizationId)
    selectedQuery = selectedQuery.eq('organization_id', organizationId)
  }

  const [candidatesRes, selectedRes] = await Promise.all([
    candidatesQuery,
    selectedQuery,
  ])
  if (candidatesRes.error) {
    return NextResponse.json({ error: candidatesRes.error.message }, { status: 500 })
  }
  if (selectedRes.error) {
    return NextResponse.json({ error: selectedRes.error.message }, { status: 500 })
  }

  const selected = new Set((selectedRes.data ?? []).map(r => r.contact_name))
  const contacts = (candidatesRes.data ?? []).map(c => ({
    contactName: c.contact_name,
    invoiceCount: c.invoice_count,
    lastInvoiceDate: c.last_invoice_date,
    selected: selected.has(c.contact_name),
  }))
  return NextResponse.json({ contacts })
}

/**
 * POST /api/admin/suppliers
 *
 * Toggle whether a Xero contact counts as a kitchen supplier.
 * Body: { contactName: string, selected: boolean }
 *
 * Selecting a contact adds it to every supplier-aware surface at once —
 * the Bills page chips, the Kitchen cost total, and the line-item
 * extractor cron. New rows take the contact name as their display label.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response
  const session = await getSessionUser(req)
  const organizationId = isOrganizationsEnabled() ? session?.tenant?.organizationId : null
  if (isOrganizationsEnabled() && !organizationId) {
    return NextResponse.json({ error: 'Organization setup is required' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    contactName?: string
    selected?: boolean
  }
  const contactName = body.contactName?.trim()
  if (!contactName) {
    return NextResponse.json({ error: 'contactName is required' }, { status: 400 })
  }

  const db = adminClient()
  if (body.selected) {
    const row = organizationId
      ? { organization_id: organizationId, contact_name: contactName, label: contactName }
      : { contact_name: contactName, label: contactName }
    const { data: existing, error: lookupError } = organizationId
      ? await db
          .from('kitchen_suppliers')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('contact_name', contactName)
          .maybeSingle()
      : { data: null, error: null }
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
    const { error } = existing
      ? { error: null }
      : await db
          .from('kitchen_suppliers')
          .upsert(row, { onConflict: organizationId ? 'organization_id,contact_name' : 'contact_name', ignoreDuplicates: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    let deleteQuery = db
      .from('kitchen_suppliers')
      .delete()
      .eq('contact_name', contactName)

    if (organizationId) deleteQuery = deleteQuery.eq('organization_id', organizationId)

    const { error } = await deleteQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
