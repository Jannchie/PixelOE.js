import { PixelImageData } from './imageData'

/**
 * Deterministic, dependency-free image resizing.
 *
 * - nearest: exact nearest-neighbor sampling (pixel-art upscale).
 * - area: box (area-average) filter with fractional edge coverage —
 *   the correct filter for downscaling, no aliasing from skipped pixels.
 * - bilinear: center-aligned bilinear interpolation for upscaling.
 *
 * All functions run in plain TypeScript, so results are identical across
 * browsers and Node (no canvas / GPU involvement).
 */

export function resizeNearestSync(
  imageData: PixelImageData,
  newWidth: number,
  newHeight: number,
): PixelImageData {
  const { width: w, height: h, data: src } = imageData
  const result = new PixelImageData(newWidth, newHeight)
  const dst = result.data

  for (let oy = 0; oy < newHeight; oy++) {
    const sy = Math.min(h - 1, Math.floor((oy + 0.5) * h / newHeight))
    const srcRow = sy * w
    const dstRow = oy * newWidth
    for (let ox = 0; ox < newWidth; ox++) {
      const sx = Math.min(w - 1, Math.floor((ox + 0.5) * w / newWidth))
      const s = (srcRow + sx) * 4
      const d = (dstRow + ox) * 4
      dst[d] = src[s]
      dst[d + 1] = src[s + 1]
      dst[d + 2] = src[s + 2]
      dst[d + 3] = src[s + 3]
    }
  }

  return result
}

export function resizeAreaSync(
  imageData: PixelImageData,
  newWidth: number,
  newHeight: number,
): PixelImageData {
  const { width: w, height: h, data: src } = imageData
  const result = new PixelImageData(newWidth, newHeight)
  const dst = result.data

  const scaleX = w / newWidth
  const scaleY = h / newHeight

  for (let oy = 0; oy < newHeight; oy++) {
    const sy0 = oy * scaleY
    const sy1 = Math.min(h, (oy + 1) * scaleY)
    const yStart = Math.floor(sy0)
    const yEnd = Math.min(h - 1, Math.ceil(sy1) - 1)

    for (let ox = 0; ox < newWidth; ox++) {
      const sx0 = ox * scaleX
      const sx1 = Math.min(w, (ox + 1) * scaleX)
      const xStart = Math.floor(sx0)
      const xEnd = Math.min(w - 1, Math.ceil(sx1) - 1)

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let total = 0

      for (let y = yStart; y <= yEnd; y++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0)
        if (wy <= 0) {
          continue
        }
        const row = y * w
        for (let x = xStart; x <= xEnd; x++) {
          const wx = Math.min(x + 1, sx1) - Math.max(x, sx0)
          if (wx <= 0) {
            continue
          }
          const weight = wx * wy
          const s = (row + x) * 4
          r += src[s] * weight
          g += src[s + 1] * weight
          b += src[s + 2] * weight
          a += src[s + 3] * weight
          total += weight
        }
      }

      const d = (oy * newWidth + ox) * 4
      const inv = total > 0 ? 1 / total : 0
      dst[d] = r * inv
      dst[d + 1] = g * inv
      dst[d + 2] = b * inv
      dst[d + 3] = a * inv
    }
  }

  return result
}

export function resizeBilinearSync(
  imageData: PixelImageData,
  newWidth: number,
  newHeight: number,
): PixelImageData {
  const { width: w, height: h, data: src } = imageData
  const result = new PixelImageData(newWidth, newHeight)
  const dst = result.data

  // Precompute the horizontal sampling map once instead of per row
  const x0Map = new Int32Array(newWidth)
  const x1Map = new Int32Array(newWidth)
  const txMap = new Float32Array(newWidth)
  for (let ox = 0; ox < newWidth; ox++) {
    const fx = Math.min(w - 1, Math.max(0, (ox + 0.5) * w / newWidth - 0.5))
    const x0 = Math.floor(fx)
    x0Map[ox] = x0 * 4
    x1Map[ox] = Math.min(w - 1, x0 + 1) * 4
    txMap[ox] = fx - x0
  }

  for (let oy = 0; oy < newHeight; oy++) {
    const fy = Math.min(h - 1, Math.max(0, (oy + 0.5) * h / newHeight - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(h - 1, y0 + 1)
    const ty = fy - y0
    const ity = 1 - ty
    const row0 = y0 * w * 4
    const row1 = y1 * w * 4
    let d = oy * newWidth * 4

    for (let ox = 0; ox < newWidth; ox++, d += 4) {
      const tx = txMap[ox]
      const itx = 1 - tx
      const s00 = row0 + x0Map[ox]
      const s01 = row0 + x1Map[ox]
      const s10 = row1 + x0Map[ox]
      const s11 = row1 + x1Map[ox]

      dst[d] = (src[s00] * itx + src[s01] * tx) * ity + (src[s10] * itx + src[s11] * tx) * ty
      dst[d + 1] = (src[s00 + 1] * itx + src[s01 + 1] * tx) * ity + (src[s10 + 1] * itx + src[s11 + 1] * tx) * ty
      dst[d + 2] = (src[s00 + 2] * itx + src[s01 + 2] * tx) * ity + (src[s10 + 2] * itx + src[s11 + 2] * tx) * ty
      dst[d + 3] = (src[s00 + 3] * itx + src[s01 + 3] * tx) * ity + (src[s10 + 3] * itx + src[s11 + 3] * tx) * ty
    }
  }

  return result
}

/**
 * Synchronous resize. 'bilinear' uses an area-average filter when
 * downscaling (correct anti-aliasing) and bilinear interpolation when
 * upscaling; 'nearest' is exact nearest-neighbor.
 */
export function resizeImageSync(
  imageData: PixelImageData,
  newWidth: number,
  newHeight: number,
  algorithm: 'bilinear' | 'nearest' = 'bilinear',
): PixelImageData {
  if (newWidth === imageData.width && newHeight === imageData.height) {
    return imageData.clone()
  }

  if (algorithm === 'nearest') {
    return resizeNearestSync(imageData, newWidth, newHeight)
  }

  const isDownscale = newWidth <= imageData.width && newHeight <= imageData.height
  return isDownscale
    ? resizeAreaSync(imageData, newWidth, newHeight)
    : resizeBilinearSync(imageData, newWidth, newHeight)
}

/** Compatibility async wrappers (previously Pica-based). */
export async function resizeImageBilinear(imageData: PixelImageData, newWidth: number, newHeight: number): Promise<PixelImageData> {
  return resizeImageSync(imageData, newWidth, newHeight, 'bilinear')
}

export async function resizeImageNearest(imageData: PixelImageData, newWidth: number, newHeight: number): Promise<PixelImageData> {
  return resizeImageSync(imageData, newWidth, newHeight, 'nearest')
}

export async function resizeImageLanczos(imageData: PixelImageData, newWidth: number, newHeight: number): Promise<PixelImageData> {
  return resizeImageSync(imageData, newWidth, newHeight, 'bilinear')
}

export async function resizeImageSmart(
  imageData: PixelImageData,
  newWidth: number,
  newHeight: number,
  options: {
    quality?: 'low' | 'medium' | 'high'
    async?: boolean
  } = {},
): Promise<PixelImageData> {
  const { quality = 'high' } = options
  return resizeImageSync(imageData, newWidth, newHeight, quality === 'low' ? 'nearest' : 'bilinear')
}
