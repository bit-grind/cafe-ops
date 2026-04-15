import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchBillAttachment, getXeroConnection } from '@/lib/xero'

/**
 * GET /api/xero/bills/:id/attachments/:fileName — proxies the actual
 * attachment bytes from Xero so the browser can render the original supplier
 * invoice (PDF / image / etc.) inline. Streams whatever content-type Xero
 * returns straight back to the client.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; fileName: string }> }
) {
  try {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const conn = await getXeroConnection()
    if (!conn) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

    const { id, fileName } = await params
    if (!id || !fileName) return NextResponse.json({ error: 'Missing id or fileName' }, { status: 400 })

    // Next.js URL-decodes route params, so fileName arrives in its original form.
    const result = await fetchBillAttachment(id, fileName)
    if (!result) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        // inline so PDFs/images render in <iframe>/<img> rather than downloading.
        'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
