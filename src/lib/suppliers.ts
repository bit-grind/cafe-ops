// Canonical list of kitchen suppliers. Shared between the Bills page
// (where users filter by supplier chip) and the Kitchen dashboard (where
// we exclude non-supplier bills like ATO, utilities, software, etc. from
// the weekly cost total).

export type SupplierDef = {
  label: string
  keywords: string[]
  // Optional case-insensitive invoice-number prefixes to drop even when
  // the contact name matches — used for Southside 'RB' rebate notes.
  excludeInvoicePrefixes?: string[]
}

export const SUPPLIERS: SupplierDef[] = [
  { label: 'Brasserie',        keywords: ['brasserie'] },
  { label: 'Superior',         keywords: ['superior'] },
  { label: "Big Michael's",    keywords: ['big michael'] },
  { label: "Michael's Meats",  keywords: ['michaels meats', 'michael meats'] },
  { label: 'A La Carte',       keywords: ['a la carte'] },
  { label: 'Breadtop',         keywords: ['breadtop', 'quality factory'] },
  { label: 'Filla',            keywords: ['filla'] },
  { label: 'Southside Milk',   keywords: ['southside milk', 'southside'], excludeInvoicePrefixes: ['RB'] },
  { label: 'APAK',             keywords: ['apak'] },
  { label: 'Bagel Boys',       keywords: ['bagel boys', 'bagel boy'] },
  { label: 'Cravve Chocolate', keywords: ['cravve'] },
  { label: 'Providore',        keywords: ['providore'] },
  { label: 'Bask & Co',        keywords: ['bask'] },
]

export function normalise(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/\s+/g, ' ').trim()
}

function matchSupplier(contactName: string | null | undefined): SupplierDef | null {
  if (!contactName) return null
  const norm = normalise(contactName)
  for (const s of SUPPLIERS) {
    if (s.keywords.some(k => norm.includes(normalise(k)))) return s
  }
  return null
}

export function matchSupplierLabel(contactName: string | null | undefined): string | null {
  return matchSupplier(contactName)?.label ?? null
}

/**
 * True when a bill belongs to one of the kitchen suppliers and isn't
 * excluded by invoice-number prefix (e.g. Southside 'RB' rebates).
 */
export function isKitchenSupplierBill(
  contactName: string | null | undefined,
  invoiceNumber: string | null | undefined,
): boolean {
  const def = matchSupplier(contactName)
  if (!def) return false
  if (!def.excludeInvoicePrefixes?.length) return true
  const num = (invoiceNumber ?? '').toUpperCase()
  return !def.excludeInvoicePrefixes.some(p => num.startsWith(p.toUpperCase()))
}
