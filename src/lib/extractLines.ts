import { fetchBillAttachment, listBillAttachments } from './xero'

// ── Types ────────────────────────────────────────────────────────────────────

export type ExtractedItem = {
  description: string
  quantity: number | null
  unit: string | null
  unit_price: number | null
  total: number | null
  category: string | null
}

export type ExtractionResult = {
  items: ExtractedItem[]
  rawResponse: string
  model: string
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are an invoice line-item extractor for a cafe. You will receive the text content of a supplier invoice (or an image of one). Extract every individual line item into a JSON array.

For each line item return:
- "description": the product/item name exactly as written on the invoice
- "quantity": numeric quantity ordered (null if not listed)
- "unit": unit of measure e.g. "kg", "L", "each", "carton", "box" (null if not listed)
- "unit_price": price per unit as a number (null if not listed)
- "total": line total as a number (null if not listed)
- "category": classify into exactly one of: dairy, produce, meat, seafood, bakery, beverages, dry-goods, packaging, cleaning, equipment, other

Rules:
- Only extract actual purchased items — skip subtotals, tax lines, delivery fees, headers, and footers
- Strip currency symbols from numbers
- If quantity × unit_price ≠ total, trust the total on the invoice
- Return valid JSON: { "items": [ ... ] }
- If you cannot extract any items, return { "items": [] }
- Do NOT wrap in markdown code blocks, return raw JSON only`

const MODEL = 'gpt-4.1-mini'

// ── Text extraction from PDF ─────────────────────────────────────────────────

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  // pdf-parse expects a Buffer in Node.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
  const nodeBuffer = Buffer.from(buffer)
  const data = await pdfParse(nodeBuffer)
  return data.text
}

// ── OpenAI calls ─────────────────────────────────────────────────────────────

async function extractViaText(text: string): Promise<ExtractionResult> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: `Here is the text content of a supplier invoice. Extract all line items:\n\n${text}` },
      ],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`OpenAI API error: ${resp.status} ${err}`)
  }

  const json = await resp.json()
  const raw = json.choices?.[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw)

  return {
    items: (parsed.items ?? []).map(normaliseItem),
    rawResponse: raw,
    model: MODEL,
  }
}

async function extractViaVision(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all line items from this supplier invoice image.' },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' },
            },
          ],
        },
      ],
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`OpenAI Vision API error: ${resp.status} ${err}`)
  }

  const json = await resp.json()
  const raw = json.choices?.[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw)

  return {
    items: (parsed.items ?? []).map(normaliseItem),
    rawResponse: raw,
    model: MODEL,
  }
}

// ── Normalise an item from the AI response ──────────────────────────────────

function normaliseItem(raw: Record<string, unknown>): ExtractedItem {
  return {
    description: String(raw.description ?? '').trim(),
    quantity: raw.quantity != null ? Number(raw.quantity) || null : null,
    unit: raw.unit ? String(raw.unit).trim() : null,
    unit_price: raw.unit_price != null ? Number(raw.unit_price) || null : null,
    total: raw.total != null ? Number(raw.total) || null : null,
    category: raw.category ? String(raw.category).trim().toLowerCase() : null,
  }
}

// ── Main extraction function ─────────────────────────────────────────────────

/**
 * Fetch an invoice attachment from Xero and extract line items using AI.
 *
 * For PDFs: extracts text first, then sends text to LLM (cheapest/fastest).
 * For images: sends directly to OpenAI vision.
 *
 * If the PDF text extraction yields very little text (likely a scanned image),
 * falls back to vision by converting the first page to an image.
 */
export async function extractLinesFromInvoice(
  invoiceID: string,
  attachmentName?: string
): Promise<ExtractionResult & { attachmentName: string }> {
  // If no attachment name given, find the first one
  let attName = attachmentName
  if (!attName) {
    const atts = await listBillAttachments(invoiceID)
    if (atts.length === 0) throw new Error('No attachments found for this invoice')
    attName = atts[0].fileName
  }

  // Fetch the raw bytes from Xero
  const result = await fetchBillAttachment(invoiceID, attName)
  if (!result) throw new Error(`Attachment not found: ${attName}`)

  const { buffer, contentType } = result
  const ct = contentType.toLowerCase()

  let extraction: ExtractionResult

  if (ct.includes('pdf')) {
    // Try text extraction first (fast and cheap)
    const text = await extractTextFromPdf(buffer)

    if (text.trim().length > 50) {
      // Good text content — use text-based extraction
      extraction = await extractViaText(text)
    } else {
      // Very little text — likely a scanned image PDF
      // Send the entire PDF as a base64 image (OpenAI can handle some PDFs)
      const base64 = Buffer.from(buffer).toString('base64')
      extraction = await extractViaVision(base64, 'application/pdf')
    }
  } else if (ct.includes('image')) {
    // Direct image attachment — use vision
    const base64 = Buffer.from(buffer).toString('base64')
    extraction = await extractViaVision(base64, contentType)
  } else {
    throw new Error(`Unsupported attachment type: ${contentType}`)
  }

  return { ...extraction, attachmentName: attName }
}
