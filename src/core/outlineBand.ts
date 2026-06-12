import { PixelImageData } from './imageData'
import { dilateWithKernel, erodeWithKernel, getKernelRadius, MAX_KERNEL_INDEX } from './morphology'

/**
 * Band-local processing for the circle-kernel outline expansion.
 *
 * The morphology chain (erode/dilate -> blend -> open/close sequence) is a
 * purely local operation: an output row depends only on rows within a fixed
 * halo distance. That makes it splittable into horizontal bands processed
 * independently (e.g. on a Web Worker pool) — each band just needs `halo`
 * extra rows of context on each side, which are trimmed from the result.
 */

export function clampKernelIndex(value: number): number {
  return Math.max(1, Math.min(MAX_KERNEL_INDEX, Math.round(value)))
}

/**
 * Number of context rows an output row depends on: one erode/dilate pass
 * with the thickness kernel, then four passes (1+2+1) with the oc kernel.
 */
export function outlineHaloRows(erodeIters: number, dilateIters: number): number {
  const stageRadius = Math.max(
    getKernelRadius(clampKernelIndex(erodeIters)),
    getKernelRadius(clampKernelIndex(dilateIters)),
  )
  const ocIter = clampKernelIndex(Math.max(erodeIters - 1, dilateIters - 1, 1))
  return stageRadius + 4 * getKernelRadius(ocIter)
}

/**
 * Two-way weighted blend (eroded * w + dilated * (1 - w)), matching the
 * PyTorch pipeline which has no original-image term.
 */
export function twowayBlend(
  eroded: PixelImageData,
  dilated: PixelImageData,
  weights: Float32Array,
): PixelImageData {
  const e = eroded.data
  const d = dilated.data
  const out = new Uint8ClampedArray(e.length)

  for (let i = 0, p = 0; i < weights.length; i++, p += 4) {
    const w = weights[i]
    const iw = 1 - w
    out[p] = e[p] * w + d[p] * iw
    out[p + 1] = e[p + 1] * w + d[p + 1] * iw
    out[p + 2] = e[p + 2] * w + d[p + 2] * iw
    out[p + 3] = e[p + 3] * w + d[p + 3] * iw
  }

  return new PixelImageData(eroded.width, eroded.height, out)
}

/**
 * Run the full circle-kernel outline morphology chain on a horizontal band
 * (including halo rows) and return the band trimmed to its inner rows.
 *
 * `src` holds RGBA data of `rows` rows (band plus halo context), `weights`
 * the expansion weights for the same rows; `trimTop`/`trimBottom` rows are
 * dropped from the result.
 */
export function processOutlineBand(
  src: Uint8ClampedArray,
  width: number,
  rows: number,
  weights: Float32Array,
  erodeIters: number,
  dilateIters: number,
  trimTop: number,
  trimBottom: number,
): Uint8ClampedArray {
  const band = new PixelImageData(width, rows, src)

  const eroded = erodeWithKernel(band, clampKernelIndex(erodeIters), 1)
  const dilated = dilateWithKernel(band, clampKernelIndex(dilateIters), 1)

  let result = twowayBlend(eroded, dilated, weights)

  const ocIter = clampKernelIndex(Math.max(erodeIters - 1, dilateIters - 1, 1))
  result = erodeWithKernel(result, ocIter, 1)
  result = dilateWithKernel(result, ocIter, 2)
  result = erodeWithKernel(result, ocIter, 1)

  if (trimTop === 0 && trimBottom === 0) {
    return result.data
  }
  return result.data.slice(trimTop * width * 4, (rows - trimBottom) * width * 4)
}
