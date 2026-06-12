import { processOutlineBand } from '../core/outlineBand'

/**
 * Worker wrapper around {@link processOutlineBand}. Buffers are passed as
 * Transferables in both directions, so no copies cross the thread boundary.
 */

interface OutlineBandRequest {
  id: number
  src: ArrayBuffer
  weights: ArrayBuffer
  width: number
  rows: number
  erodeIters: number
  dilateIters: number
  trimTop: number
  trimBottom: number
}

globalThis.addEventListener('message', (event: MessageEvent<OutlineBandRequest>) => {
  const { id, src, weights, width, rows, erodeIters, dilateIters, trimTop, trimBottom } = event.data

  const out = processOutlineBand(
    new Uint8ClampedArray(src),
    width,
    rows,
    new Float32Array(weights),
    erodeIters,
    dilateIters,
    trimTop,
    trimBottom,
  )

  globalThis.postMessage({ id, out: out.buffer }, { transfer: [out.buffer] })
})
