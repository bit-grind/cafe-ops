import { NextResponse } from 'next/server'
import { requireAdmin, adminClient } from '@/lib/adminAuth'

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

  const db = adminClient()
  const [candidatesRes, selectedRes] = await Promise.all([
    db
      .from('kitchen_supplier_candidates')
      .select('contact_name, invoice_count, last_invoice_date')
      .order('invoice_count', { ascending: false }),
    db.from('kitchen_suppliers').select('contact_name'),
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
    const { error } = await db
      .from('kitchen_suppliers')
      .upsert(
        { contact_name: contactName, label: contactName },
        { onConflict: 'contact_name', ignoreDuplicates: true },
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await db
      .from('kitchen_suppliers')
      .delete()
      .eq('contact_name', contactName)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
