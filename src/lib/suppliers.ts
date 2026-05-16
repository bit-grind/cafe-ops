// Supplier matching shared by the Bills page, the Kitchen dashboard, and
// the line-item extractor cron. The list of kitchen suppliers is admin-
// managed and lives in the `kitchen_suppliers` table; these are the pure
// matching helpers that operate on a list fetched from there (see
// `getKitchenSuppliers` in suppliers-db.ts for the server-side fetch).

export type KitchenSupplier = {
  // Exact Xero contact name this supplier is matched on.
  contactName: string
  // Display name shown on the Bills page chips and Kitchen dashboard.
  label: string
  // Case-insensitive invoice-number prefixes to drop even when the contact
  // matches — used for Southside 'RB' rebate notes.
  excludeInvoicePrefixes: string[] | null
}

export function normalise(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/\s+/g, ' ').trim()
}

/** The kitchen supplier whose Xero contact name matches `contactName`. */
export function matchSupplier(
  contactName: string | null | undefined,
  suppliers: KitchenSupplier[],
): KitchenSupplier | null {
  if (!contactName) return null
  const norm = normalise(contactName)
  return suppliers.find(s => normalise(s.contactName) === norm) ?? null
}

export function matchSupplierLabel(
  contactName: string | null | undefined,
  suppliers: KitchenSupplier[],
): string | null {
  return matchSupplier(contactName, suppliers)?.label ?? null
}

/**
 * True when a bill belongs to a kitchen supplier and isn't excluded by
 * invoice-number prefix (e.g. Southside 'RB' rebate notes).
 *
 * This is the canonical "should we care about this bill" predicate —
 * shared by the Bills page, the Kitchen dashboard, and the line-item
 * extractor cron, so all three agree on what counts as a supplier bill.
 */
export function isKitchenSupplierBill(
  contactName: string | null | undefined,
  invoiceNumber: string | null | undefined,
  suppliers: KitchenSupplier[],
): boolean {
  const def = matchSupplier(contactName, suppliers)
  if (!def) return false
  if (!def.excludeInvoicePrefixes?.length) return true
  const num = (invoiceNumber ?? '').toUpperCase()
  return !def.excludeInvoicePrefixes.some(p => num.startsWith(p.toUpperCase()))
}
