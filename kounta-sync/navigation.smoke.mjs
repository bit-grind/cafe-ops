// Local-only regression: an indefinitely busy background request must not block exports.
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { navigateKounta } from './navigation.mjs'

const server = createServer((req, res) => {
  if (req.url === '/background') return // Deliberately never finishes.
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end('<title>Ready report</title><script>fetch("/background")</script>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const background = page.waitForRequest(req => req.url().endsWith('/background'))
  await navigateKounta(page, `http://127.0.0.1:${server.address().port}/`)
  await background
  assert.equal(await page.title(), 'Ready report')
  await assert.rejects(page.waitForLoadState('networkidle', { timeout: 1000 }), { name: 'TimeoutError' })
  console.log('Document navigation passed while background networking remained busy')
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
