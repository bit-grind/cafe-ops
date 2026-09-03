import { encode } from 'uqr'

/**
 * QR rendering for training invite links, so a new starter can scan the link
 * off a manager's screen instead of being sent it.
 *
 * The code is generated **in the browser, from the token we already hold** —
 * never by handing the URL to a QR web service. The link is a bearer
 * credential; posting it to a third party would leak it exactly the way the
 * course's original Google Apps Script reporting did.
 */

/** Spec-required clear margin. Scanners need it; without it, reads fail. */
export const QR_QUIET_ZONE = 4

export type QrRender = {
  /** Module count per side, excluding the quiet zone. */
  size: number
  /** Side length including the quiet zone, in module units. */
  viewBoxSize: number
  /** Single SVG path covering every dark module. */
  path: string
}

/**
 * Build an SVG path covering the dark modules of `matrix`, offset by the
 * quiet zone. One path for the whole code keeps it to a single DOM node.
 */
export function qrSvgPath(matrix: readonly (readonly boolean[])[], quietZone = QR_QUIET_ZONE): string {
  const parts: string[] = []
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      if (!matrix[row][col]) continue
      parts.push(`M${col + quietZone} ${row + quietZone}h1v1h-1z`)
    }
  }
  return parts.join('')
}

/** Encode `text` as a QR code and render it to an SVG path. */
export function buildQr(text: string, quietZone = QR_QUIET_ZONE): QrRender {
  const result = encode(text, { ecc: 'M' })
  return {
    size: result.size,
    viewBoxSize: result.size + quietZone * 2,
    path: qrSvgPath(result.data, quietZone),
  }
}
