import { adminClient } from './adminAuth'
import type { KitchenSupplier } from './suppliers'

/**
 * Fetch the admin-managed kitchen supplier list from the database.
 *
 * Server-only — uses the service-role client because `kitchen_suppliers`
 * has RLS enabled with no read policy. The table holds well under 1,000
 * rows so no pagination is needed.
 */
export async function getKitchenSuppliers(organizationId?: string | null): Promise<KitchenSupplier[]> {
  let query = adminClient()
    .from('kitchen_suppliers')
    .select('contact_name, label, exclude_invoice_prefixes')
    .order('id', { ascending: true })

  if (organizationId) query = query.eq('organization_id', organizationId)

  const { data, error } = await query
  if (error || !data) return []
  return data.map(r => ({
    contactName: r.contact_name as string,
    label: r.label as string,
    excludeInvoicePrefixes: (r.exclude_invoice_prefixes as string[] | null) ?? null,
  }))
}
