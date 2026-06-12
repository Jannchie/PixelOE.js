import { PixelImageData } from './imageData'
import { labToRgb255, rgbaToLabPlanes } from './planes'

/**
 * Contrast-based downscale.
 *
 * The image is converted to Lab planes once, then every output pixel is
 * computed directly from its source patch (proportional grid mapping) —
 * no full-resolution intermediate, no canvas resize.
 */

/**
 * In-place quickselect: after the call, scratch[k] holds the k-th order
 * statistic and everything left of k is <= scratch[k].
 */
function quickselect(scratch: Float32Array, n: number, k: number): number {
  let left = 0
  let right = n - 1

  while (right > left) {
    // Insertion sort for small partitions
    if (right - left < 12) {
      for (let i = left + 1; i <= right; i++) {
        const v = scratch[i]
        let j = i - 1
        while (j >= left && scratch[j] > v) {
          scratch[j + 1] = scratch[j]
          j--
        }
        scratch[j + 1] = v
      }
      return scratch[k]
    }

    // Median-of-three pivot
    const mid = (left + right) >> 1
    if (scratch[mid] < scratch[left]) {
      const t = scratch[mid]
      scratch[mid] = scratch[left]
      scratch[left] = t
    }
    if (scratch[right] < scratch[left]) {
      const t = scratch[right]
      scratch[right] = scratch[left]
      scratch[left] = t
    }
    if (scratch[right] < scratch[mid]) {
      const t = scratch[right]
      scratch[right] = scratch[mid]
      scratch[mid] = t
    }
    const pivot = scratch[mid]

    let i = left
    let j = right
    while (i <= j) {
      while (scratch[i] < pivot) {
        i++
      }
      while (scratch[j] > pivot) {
        j--
      }
      if (i <= j) {
        const t = scratch[i]
        scratch[i] = scratch[j]
        scratch[j] = t
        i++
        j--
      }
    }

    if (k <= j) {
      right = j
    }
    else if (k >= i) {
      left = i
    }
    else {
      return scratch[k]
    }
  }

  return scratch[k]
}

/** Median of the first `n` elements of a scratch buffer (reorders in place). */
function medianOfScratch(scratch: Float32Array, n: number): number {
  const mid = n >> 1
  const upper = quickselect(scratch, n, mid)
  if (n % 2 === 1) {
    return upper
  }
  // Even count: the lower middle is the max of the left partition
  let lower = scratch[0]
  for (let i = 1; i < mid; i++) {
    if (scratch[i] > lower) {
      lower = scratch[i]
    }
  }
  return (lower + upper) / 2
}

// Internal export for tests
export { medianOfScratch as _medianOfScratch }

export function contrastDownscale(
  imageData: PixelImageData,
  targetSize: number = 128,
): PixelImageData {
  const { width: w, height: h } = imageData
  const ratio = w / h
  const adjustedTargetSize = Math.sqrt((targetSize * targetSize) / ratio)
  const outW = Math.max(1, Math.floor(adjustedTargetSize * ratio))
  const outH = Math.max(1, Math.floor(adjustedTargetSize))

  const planes = rgbaToLabPlanes(imageData.data, w, h)
  const { l, a, b } = planes

  const result = new PixelImageData(outW, outH)
  const out = result.data

  // Scratch buffers sized for the largest possible patch
  const maxPatchW = Math.ceil(w / outW) + 1
  const maxPatchH = Math.ceil(h / outH) + 1
  const maxPatch = maxPatchW * maxPatchH
  const lScratch = new Float32Array(maxPatch)
  const aScratch = new Float32Array(maxPatch)
  const bScratch = new Float32Array(maxPatch)

  for (let oy = 0; oy < outH; oy++) {
    const y0 = Math.floor(oy * h / outH)
    const y1 = Math.max(y0 + 1, Math.floor((oy + 1) * h / outH))

    for (let ox = 0; ox < outW; ox++) {
      const x0 = Math.floor(ox * w / outW)
      const x1 = Math.max(x0 + 1, Math.floor((ox + 1) * w / outW))

      let n = 0
      let sum = 0
      let minL = Infinity
      let maxL = -Infinity

      for (let y = y0; y < y1; y++) {
        const row = y * w
        for (let x = x0; x < x1; x++) {
          const idx = row + x
          const lv = l[idx]
          lScratch[n] = lv
          aScratch[n] = a[idx]
          bScratch[n] = b[idx]
          n++
          sum += lv
          if (lv < minL) {
            minL = lv
          }
          if (lv > maxL) {
            maxL = lv
          }
        }
      }

      // Center pixel of the patch (flattened middle, matching the reference)
      const centerL = lScratch[n >> 1]
      const meanL = sum / n
      const medianA = medianOfScratch(aScratch, n)
      const medianB = medianOfScratch(bScratch, n)
      const medianL = medianOfScratch(lScratch, n) // sorts lScratch — read centerL first

      let selectedL = centerL
      if (medianL < meanL && (maxL - medianL) > (medianL - minL)) {
        selectedL = minL
      }
      else if (medianL > meanL && (maxL - medianL) < (medianL - minL)) {
        selectedL = maxL
      }

      const [
        r,
        g,
        bRgb,
      ] = labToRgb255(selectedL, medianA, medianB)
      const outIdx = (oy * outW + ox) * 4
      out[outIdx] = r
      out[outIdx + 1] = g
      out[outIdx + 2] = bRgb
      out[outIdx + 3] = 255
    }
  }

  return result
}

/**
 * Compatibility aliases. WebGL acceleration was removed: the CPU path now
 * computes each output pixel directly and is faster than the previous
 * GPU round-trip pipeline.
 */
export async function contrastDownscaleSmart(imageData: PixelImageData, targetSize: number = 128): Promise<PixelImageData> {
  return contrastDownscale(imageData, targetSize)
}

export function contrastDownscaleSmartSync(imageData: PixelImageData, targetSize: number = 128): PixelImageData {
  return contrastDownscale(imageData, targetSize)
}
