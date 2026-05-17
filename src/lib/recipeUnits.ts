export type MeasureKind = 'weight' | 'volume' | 'count'

export type NormalizedUnit = {
  kind: MeasureKind
  unit: 'g' | 'mL' | CountUnit
  factor: number
  label: string
}

export type PackSize = {
  kind: 'weight' | 'volume'
  unit: 'g' | 'mL'
  amount: number
  label: string
  confidence: 'high' | 'medium'
}

export type ConvertResult = {
  price: number
  from: string
  exact: boolean
  canApply: boolean
}

type CountUnit = 'each' | 'bunch' | 'tray' | 'box' | 'pack' | 'bag' | 'tub' | 'bottle' | 'jar' | 'tin' | 'can' | 'drum'

const UNIT_ALIASES: Record<string, NormalizedUnit> = {
  g: { kind: 'weight', unit: 'g', factor: 1, label: 'g' },
  gm: { kind: 'weight', unit: 'g', factor: 1, label: 'g' },
  gms: { kind: 'weight', unit: 'g', factor: 1, label: 'g' },
  gram: { kind: 'weight', unit: 'g', factor: 1, label: 'g' },
  grams: { kind: 'weight', unit: 'g', factor: 1, label: 'g' },
  kg: { kind: 'weight', unit: 'g', factor: 1000, label: 'kg' },
  kgs: { kind: 'weight', unit: 'g', factor: 1000, label: 'kg' },
  kilogram: { kind: 'weight', unit: 'g', factor: 1000, label: 'kg' },
  kilograms: { kind: 'weight', unit: 'g', factor: 1000, label: 'kg' },

  ml: { kind: 'volume', unit: 'mL', factor: 1, label: 'mL' },
  millilitre: { kind: 'volume', unit: 'mL', factor: 1, label: 'mL' },
  milliliter: { kind: 'volume', unit: 'mL', factor: 1, label: 'mL' },
  millilitres: { kind: 'volume', unit: 'mL', factor: 1, label: 'mL' },
  milliliters: { kind: 'volume', unit: 'mL', factor: 1, label: 'mL' },
  l: { kind: 'volume', unit: 'mL', factor: 1000, label: 'L' },
  lt: { kind: 'volume', unit: 'mL', factor: 1000, label: 'L' },
  ltr: { kind: 'volume', unit: 'mL', factor: 1000, label: 'L' },
  litre: { kind: 'volume', unit: 'mL', factor: 1000, label: 'L' },
  liter: { kind: 'volume', unit: 'mL', factor: 1000, label: 'L' },
  litres: { kind: 'volume', unit: 'mL', factor: 1000, label: 'L' },
  liters: { kind: 'volume', unit: 'mL', factor: 1000, label: 'L' },
  cup: { kind: 'volume', unit: 'mL', factor: 250, label: 'cup' },
  cups: { kind: 'volume', unit: 'mL', factor: 250, label: 'cup' },
  tbsp: { kind: 'volume', unit: 'mL', factor: 15, label: 'tbsp' },
  tbs: { kind: 'volume', unit: 'mL', factor: 15, label: 'tbsp' },
  tbl: { kind: 'volume', unit: 'mL', factor: 15, label: 'tbsp' },
  tablespoon: { kind: 'volume', unit: 'mL', factor: 15, label: 'tbsp' },
  tablespoons: { kind: 'volume', unit: 'mL', factor: 15, label: 'tbsp' },
  tsp: { kind: 'volume', unit: 'mL', factor: 5, label: 'tsp' },
  teaspoon: { kind: 'volume', unit: 'mL', factor: 5, label: 'tsp' },
  teaspoons: { kind: 'volume', unit: 'mL', factor: 5, label: 'tsp' },

  each: { kind: 'count', unit: 'each', factor: 1, label: 'each' },
  ea: { kind: 'count', unit: 'each', factor: 1, label: 'each' },
  unit: { kind: 'count', unit: 'each', factor: 1, label: 'each' },
  units: { kind: 'count', unit: 'each', factor: 1, label: 'each' },
  pc: { kind: 'count', unit: 'each', factor: 1, label: 'each' },
  pcs: { kind: 'count', unit: 'each', factor: 1, label: 'each' },
  bunch: { kind: 'count', unit: 'bunch', factor: 1, label: 'bunch' },
  bunches: { kind: 'count', unit: 'bunch', factor: 1, label: 'bunch' },
  tray: { kind: 'count', unit: 'tray', factor: 1, label: 'tray' },
  trays: { kind: 'count', unit: 'tray', factor: 1, label: 'tray' },
  box: { kind: 'count', unit: 'box', factor: 1, label: 'box' },
  boxes: { kind: 'count', unit: 'box', factor: 1, label: 'box' },
  ctn: { kind: 'count', unit: 'box', factor: 1, label: 'box' },
  carton: { kind: 'count', unit: 'box', factor: 1, label: 'box' },
  cartons: { kind: 'count', unit: 'box', factor: 1, label: 'box' },
  case: { kind: 'count', unit: 'box', factor: 1, label: 'box' },
  cases: { kind: 'count', unit: 'box', factor: 1, label: 'box' },
  pack: { kind: 'count', unit: 'pack', factor: 1, label: 'pack' },
  packs: { kind: 'count', unit: 'pack', factor: 1, label: 'pack' },
  pkt: { kind: 'count', unit: 'pack', factor: 1, label: 'pack' },
  bag: { kind: 'count', unit: 'bag', factor: 1, label: 'bag' },
  bags: { kind: 'count', unit: 'bag', factor: 1, label: 'bag' },
  tub: { kind: 'count', unit: 'tub', factor: 1, label: 'tub' },
  tubs: { kind: 'count', unit: 'tub', factor: 1, label: 'tub' },
  btl: { kind: 'count', unit: 'bottle', factor: 1, label: 'bottle' },
  bottle: { kind: 'count', unit: 'bottle', factor: 1, label: 'bottle' },
  bottles: { kind: 'count', unit: 'bottle', factor: 1, label: 'bottle' },
  jar: { kind: 'count', unit: 'jar', factor: 1, label: 'jar' },
  jars: { kind: 'count', unit: 'jar', factor: 1, label: 'jar' },
  tin: { kind: 'count', unit: 'tin', factor: 1, label: 'tin' },
  tins: { kind: 'count', unit: 'tin', factor: 1, label: 'tin' },
  can: { kind: 'count', unit: 'can', factor: 1, label: 'can' },
  cans: { kind: 'count', unit: 'can', factor: 1, label: 'can' },
  drum: { kind: 'count', unit: 'drum', factor: 1, label: 'drum' },
  drums: { kind: 'count', unit: 'drum', factor: 1, label: 'drum' },
}

const MEASURE_UNITS = [
  'millilitres',
  'milliliters',
  'millilitre',
  'milliliter',
  'kilograms',
  'kilogram',
  'litres',
  'liters',
  'grams',
  'gram',
  'kgs',
  'kg',
  'gms',
  'gm',
  'ml',
  'ltr',
  'lt',
  'l',
  'g',
].join('|')

const PACK_UNIT_RE = /\b(ctn|carton|case|box|tray|pack|pkt|bag|tub|btl|bottle|jar|tin|can|drum|each|ea|unit|pc|pcs)\b/i
const CARTON_UNIT_RE = /\b(ctn|carton|case|box|tray|pack|pkt)\b/i
const DENSITY_G_PER_ML: Array<{ re: RegExp; gPerMl: number }> = [
  { re: /\b(condensed milk|sweetened condensed)\b/i, gPerMl: 1.3 },
  { re: /\b(evaporated milk)\b/i, gPerMl: 1.07 },
  { re: /\b(baking powder|baking soda|bicarb|bicarbonate|cream of tartar)\b/i, gPerMl: 0.9 },
  { re: /\b(yeast)\b/i, gPerMl: 0.95 },
  { re: /\b(flour|self raising|self-raising|plain flour|almond meal)\b/i, gPerMl: 0.53 },
  { re: /\b(brown sugar)\b/i, gPerMl: 0.72 },
  { re: /\b(caster sugar|castor sugar|icing sugar|white sugar|sugar)\b/i, gPerMl: 0.85 },
  { re: /\b(cocoa|cacao)\b/i, gPerMl: 0.45 },
  { re: /\b(cornflour|corn flour|cornstarch|corn starch|starch)\b/i, gPerMl: 0.55 },
  { re: /\b(salt)\b/i, gPerMl: 1.2 },
  { re: /\b(mustard|mayo|mayonnaise|aioli|sauce|paste|jam|honey|syrup)\b/i, gPerMl: 1 },
  { re: /\b(vinegar|juice|oil)\b/i, gPerMl: 0.92 },
]

export function normalizeMeasureUnit(unit: string | null | undefined): NormalizedUnit | null {
  if (!unit) return null
  const cleaned = cleanUnit(unit)
  return UNIT_ALIASES[cleaned] ?? cleaned.split(/\s+/).map(part => UNIT_ALIASES[part]).find(Boolean) ?? null
}

export function convertRecipePrice({
  invoicePrice,
  invoiceUnit,
  description,
  recipeUnit,
  ingredient,
}: {
  invoicePrice: number
  invoiceUnit: string | null
  description: string
  recipeUnit: string | null
  ingredient?: string | null
}): ConvertResult | null {
  const recipe = normalizeMeasureUnit(recipeUnit)
  if (!recipe || !Number.isFinite(invoicePrice) || invoicePrice <= 0) return null

  const invoice = normalizeMeasureUnit(invoiceUnit)
  if (invoice && invoice.kind === 'count' && recipe.kind === 'count' && invoice.unit === recipe.unit) {
    return {
      price: round6((invoicePrice / invoice.factor) * recipe.factor),
      from: `$${invoicePrice}/${invoice.label}`,
      exact: true,
      canApply: true,
    }
  }

  if (invoice && invoice.kind !== 'count' && invoice.kind === recipe.kind) {
    return {
      price: round6((invoicePrice / invoice.factor) * recipe.factor),
      from: `$${invoicePrice}/${invoice.label}`,
      exact: true,
      canApply: true,
    }
  }

  const pack = parsePackSize(description, invoiceUnit)
  if (pack && pack.kind === recipe.kind) {
    return {
      price: round6((invoicePrice / pack.amount) * recipe.factor),
      from: `$${invoicePrice}/${invoiceUnit || 'unit'} (${pack.label})`,
      exact: pack.confidence === 'high',
      canApply: pack.confidence === 'high',
    }
  }

  const density = densityFor(`${ingredient ?? ''} ${description}`)
  if (pack && density) {
    if (pack.kind === 'weight' && recipe.kind === 'volume') {
      const recipeG = recipe.factor * density.gPerMl
      return {
        price: round6((invoicePrice / pack.amount) * recipeG),
        from: `$${invoicePrice}/${invoiceUnit || 'unit'} (${pack.label}, ${density.label})`,
        exact: false,
        canApply: true,
      }
    }

    if (pack.kind === 'volume' && recipe.kind === 'weight') {
      const packG = pack.amount * density.gPerMl
      return {
        price: round6((invoicePrice / packG) * recipe.factor),
        from: `$${invoicePrice}/${invoiceUnit || 'unit'} (${pack.label}, ${density.label})`,
        exact: false,
        canApply: true,
      }
    }
  }

  return null
}

function densityFor(text: string): { gPerMl: number; label: string } | null {
  const match = DENSITY_G_PER_ML.find(entry => entry.re.test(text))
  if (!match) return null
  return { gPerMl: match.gPerMl, label: `${match.gPerMl}g/mL` }
}

export function parsePackSize(description: string, invoiceUnit?: string | null): PackSize | null {
  const normalized = description
    .replace(/[×✕]/g, 'x')
    .replace(/(\d),(\d)/g, '$1$2')
    .toLowerCase()

  const candidates: PackSize[] = []
  const countThenSize = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*(${MEASURE_UNITS})\\b`, 'gi')
  const sizeThenCount = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${MEASURE_UNITS})\\b\\s*x\\s*(\\d+(?:\\.\\d+)?)`, 'gi')
  const slashCount = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${MEASURE_UNITS})\\b\\s*/\\s*(\\d+)\\b`, 'gi')
  const bracketCount = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${MEASURE_UNITS})\\b\\s*\\((\\d+)\\)`, 'gi')
  const single = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${MEASURE_UNITS})\\b`, 'gi')

  collect(countThenSize, normalized, ([count, amount, unit]) => toPackSize(Number(count) * Number(amount), unit, 'high'))
  collect(sizeThenCount, normalized, ([amount, unit, count]) => toPackSize(Number(count) * Number(amount), unit, 'high'))
  collect(slashCount, normalized, ([amount, unit, count]) => toPackSize(Number(count) * Number(amount), unit, 'high'))

  const bracketIsCarton = CARTON_UNIT_RE.test(invoiceUnit ?? '') || CARTON_UNIT_RE.test(normalized)
  collect(bracketCount, normalized, ([amount, unit, count]) => {
    const multiplier = bracketIsCarton ? Number(count) : 1
    return toPackSize(multiplier * Number(amount), unit, bracketIsCarton ? 'high' : 'medium')
  })

  collect(single, normalized, ([amount, unit]) => toPackSize(Number(amount), unit, PACK_UNIT_RE.test(invoiceUnit ?? '') ? 'high' : 'medium'))

  return pickBest(candidates)

  function collect(
    regex: RegExp,
    text: string,
    build: (groups: string[]) => PackSize | null
  ) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const candidate = build(match.slice(1))
      if (candidate) candidates.push(candidate)
    }
  }
}

function toPackSize(amount: number, unit: string, confidence: PackSize['confidence']): PackSize | null {
  const normalized = normalizeMeasureUnit(unit)
  if (!normalized || !Number.isFinite(amount) || amount <= 0) return null
  if (normalized.kind === 'count') return null
  const baseUnit = normalized.unit === 'g' ? 'g' : 'mL'
  const baseAmount = amount * normalized.factor
  return {
    kind: normalized.kind,
    unit: baseUnit,
    amount: baseAmount,
    label: packLabel(baseUnit, baseAmount),
    confidence,
  }
}

function pickBest(candidates: PackSize[]): PackSize | null {
  return candidates
    .sort((a, b) => confidenceRank(b) - confidenceRank(a) || b.amount - a.amount)[0] ?? null
}

function confidenceRank(pack: PackSize) {
  return pack.confidence === 'high' ? 2 : 1
}

function packLabel(unit: PackSize['unit'], amount: number): string {
  if (unit === 'mL') return amount >= 1000 ? `${roundLabel(amount / 1000)}L` : `${roundLabel(amount)}mL`
  return amount >= 1000 ? `${roundLabel(amount / 1000)}kg` : `${roundLabel(amount)}g`
}

function roundLabel(n: number) {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(3)))
}

function cleanUnit(unit: string) {
  return unit.toLowerCase().replace(/\./g, '').trim()
}

function round6(n: number) {
  return parseFloat(n.toFixed(6))
}
