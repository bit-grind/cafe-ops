import { describe, it, expect } from 'vitest'
import { buildQr, qrSvgPath, QR_QUIET_ZONE } from '@/lib/training/qr'

describe('qrSvgPath', () => {
  it('emits one square per dark module, offset by the quiet zone', () => {
    // A single dark module at row 1, col 2.
    const matrix = [
      [false, false, false],
      [false, false, true],
      [false, false, false],
    ]
    expect(qrSvgPath(matrix, 4)).toBe('M6 5h1v1h-1z')
  })

  it('emits nothing for an all-light matrix', () => {
    expect(qrSvgPath([[false, false], [false, false]])).toBe('')
  })

  it('covers every dark module exactly once', () => {
    const matrix = [
      [true, false, true],
      [true, true, false],
      [false, false, true],
    ]
    const dark = matrix.flat().filter(Boolean).length
    expect(qrSvgPath(matrix, 0).match(/M/g)).toHaveLength(dark)
  })

  it('places modules in the right spot with no quiet zone', () => {
    expect(qrSvgPath([[true]], 0)).toBe('M0 0h1v1h-1z')
  })
})

describe('buildQr', () => {
  const link = `https://ops.example.invalid/training#${'A'.repeat(43)}`

  it('encodes a real invite link', () => {
    const qr = buildQr(link)
    expect(qr.size).toBeGreaterThan(0)
    expect(qr.path.startsWith('M')).toBe(true)
  })

  it('reserves the quiet zone on both sides', () => {
    const qr = buildQr(link)
    expect(qr.viewBoxSize).toBe(qr.size + QR_QUIET_ZONE * 2)
  })

  it('keeps every module inside the viewBox', () => {
    const qr = buildQr(link)
    const coords = [...qr.path.matchAll(/M(\d+) (\d+)h/g)]
    expect(coords.length).toBeGreaterThan(0)
    for (const [, x, y] of coords) {
      // +1 because each module is a 1x1 square drawn from its top-left.
      expect(Number(x) + 1).toBeLessThanOrEqual(qr.viewBoxSize)
      expect(Number(y) + 1).toBeLessThanOrEqual(qr.viewBoxSize)
      expect(Number(x)).toBeGreaterThanOrEqual(QR_QUIET_ZONE)
      expect(Number(y)).toBeGreaterThanOrEqual(QR_QUIET_ZONE)
    }
  })

  it('is deterministic for the same input', () => {
    expect(buildQr(link)).toEqual(buildQr(link))
  })

  it('produces a different code for a different token', () => {
    const other = `https://ops.example.invalid/training#${'B'.repeat(43)}`
    expect(buildQr(link).path).not.toBe(buildQr(other).path)
  })
})
