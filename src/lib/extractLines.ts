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

const EXTRACTION_PROMPT = `You are an invoice line-item extractor for a cafe. You will receive a supplier invoice (as a file or image). Extract every individual line item into a JSON array.

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

// ── OpenAI call ──────────────────────────────────────────────────────────────

/**
 * Send a file (PDF or image) directly to OpenAI using their file content
 * type for PDFs, or image_url for images. No server-side PDF parsing needed.
 */
/**
 * Upload a file to OpenAI's Files API and return the file_id.
 * Used for PDFs since Chat Completions requires a file_id reference.
 */
async function uploadToOpenAI(buffer: Buffer, fileName: string): Promise<string> {
  const formData = new FormData()
  formData.append('purpose', 'assistants')
  formData.append('file', new Blob([new Uint8Array(buffer)]), fileName)

  const resp = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`OpenAI file upload failed: ${resp.status} ${err}`)
  }

  const json = await resp.json()
  return json.id as string
}

async function deleteOpenAIFile(fileId: string): Promise<void> {
  await fetch(`https://api.openai.com/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  }).catch(() => { /* best-effort cleanup */ })
}

async function extractViaOpenAI(
  fileBuffer: Buffer,
  base64Data: string,
  contentType: string,
  fileName: string
): Promise<ExtractionResult> {
  const isPdf = contentType.toLowerCase().includes('pdf')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userContent: any[]
  let uploadedFileId: string | null = null

  if (isPdf) {
    // Upload PDF to OpenAI Files API, then reference by file_id
    uploadedFileId = await uploadToOpenAI(fileBuffer, fileName)
    userContent = [
      { type: 'text', text: 'Extract all line items from this supplier invoice.' },
      {
        type: 'file',
        file: { file_id: uploadedFileId },
      },
    ]
  } else {
    // Use image_url for image files (inline base64)
    userContent = [
      { type: 'text', text: 'Extract all line items from this supplier invoice image.' },
      {
        type: 'image_url',
        image_url: { url: `data:${contentType};base64,${base64Data}`, detail: 'high' },
      },
    ]
  }

  try {
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
          { role: 'user', content: userContent },
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
  } finally {
    // Clean up uploaded file
    if (uploadedFileId) void deleteOpenAIFile(uploadedFileId)
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
 * Sends the file directly to OpenAI — PDFs via file input, images via
 * image_url. No server-side PDF parsing needed, so this works reliably
 * in Vercel's serverless environment.
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
  const nodeBuffer = Buffer.from(buffer)
  const base64 = nodeBuffer.toString('base64')

  const extraction = await extractViaOpenAI(nodeBuffer, base64, contentType, attName)

  return { ...extraction, attachmentName: attName }
}
