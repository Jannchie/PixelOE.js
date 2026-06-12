/**
 * Exact sliding-window statistics over 2D scalar fields.
 *
 * - min/max: separable monotonic-deque sweep, O(1) amortized per pixel,
 *   independent of window size.
 * - median: Huang moving-histogram on 8-bit data, O(window height) per
 *   pixel instead of O(n log n) sorting.
 *
 * Borders are handled by edge replication (matching the previous
 * clamp-based behavior), so every window holds a constant sample count.
 */

type MinMaxOp = 'min' | 'max'

function slidingExtreme1D(
  src: Float32Array,
  srcOffset: number,
  srcStride: number,
  dst: Float32Array,
  dstOffset: number,
  dstStride: number,
  length: number,
  radius: number,
  op: MinMaxOp,
  dequeIdx: Int32Array,
  dequeVal: Float32Array,
): void {
  const window = 2 * radius + 1
  const virtualLength = length + 2 * radius
  let headPtr = 0
  let tailPtr = 0
  const isMax = op === 'max'

  for (let v = 0; v < virtualLength; v++) {
    const srcIdx = v - radius < 0 ? 0 : (v - radius >= length ? length - 1 : v - radius)
    const value = src[srcOffset + srcIdx * srcStride]

    // Drop elements outside the window [v - window + 1, v]
    while (headPtr < tailPtr && dequeIdx[headPtr] <= v - window) {
      headPtr++
    }
    // Maintain monotonicity
    if (isMax) {
      while (headPtr < tailPtr && dequeVal[tailPtr - 1] <= value) {
        tailPtr--
      }
    }
    else {
      while (headPtr < tailPtr && dequeVal[tailPtr - 1] >= value) {
        tailPtr--
      }
    }
    dequeIdx[tailPtr] = v
    dequeVal[tailPtr] = value
    tailPtr++

    const out = v - 2 * radius
    if (out >= 0) {
      dst[dstOffset + out * dstStride] = dequeVal[headPtr]
    }
  }
}

function slidingExtreme2D(src: Float32Array, width: number, height: number, radius: number, op: MinMaxOp): Float32Array {
  if (radius <= 0) {
    return new Float32Array(src)
  }

  const temp = new Float32Array(width * height)
  const out = new Float32Array(width * height)
  const maxDim = Math.max(width, height) + 2 * radius
  const dequeIdx = new Int32Array(maxDim)
  const dequeVal = new Float32Array(maxDim)

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    slidingExtreme1D(src, y * width, 1, temp, y * width, 1, width, radius, op, dequeIdx, dequeVal)
  }
  // Vertical pass
  for (let x = 0; x < width; x++) {
    slidingExtreme1D(temp, x, width, out, x, width, height, radius, op, dequeIdx, dequeVal)
  }

  return out
}

/** Sliding-window minimum with window (2*radius+1)², replicated borders. */
export function slidingMin(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  return slidingExtreme2D(src, width, height, radius, 'min')
}

/** Sliding-window maximum with window (2*radius+1)², replicated borders. */
export function slidingMax(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  return slidingExtreme2D(src, width, height, radius, 'max')
}

/** Quantize a [0,1] float field to 8-bit for histogram-based statistics. */
export function quantize01ToU8(src: Float32Array): Uint8Array {
  const out = new Uint8Array(src.length)
  // Indexed loop on purpose: TypedArray.entries() allocates a tuple per
  // element and dominates the runtime on multi-megapixel inputs.
  // eslint-disable-next-line unicorn/no-for-loop
  for (let i = 0; i < src.length; i++) {
    const v = src[i] * 255
    out[i] = v <= 0 ? 0 : (v >= 255 ? 255 : Math.trunc(v + 0.5))
  }
  return out
}

/**
 * Sliding-window median (Huang's algorithm) on 8-bit data with window
 * (2*radius+1)², replicated borders.
 */
export function slidingMedianU8(src: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) {
    return new Uint8Array(src)
  }

  const out = new Uint8Array(width * height)
  const hist = new Int32Array(256)
  const window = 2 * radius + 1
  const count = window * window
  const target = (count >> 1) + 1

  const clampX = (x: number): number => x < 0 ? 0 : (x >= width ? width - 1 : x)
  const clampY = (y: number): number => y < 0 ? 0 : (y >= height ? height - 1 : y)

  for (let y = 0; y < height; y++) {
    // Build histogram for window centered at (0, y)
    hist.fill(0)
    for (let wy = -radius; wy <= radius; wy++) {
      const row = clampY(y + wy) * width
      for (let wx = -radius; wx <= radius; wx++) {
        hist[src[row + clampX(wx)]]++
      }
    }

    // Initial median and count of values below it
    let mdn = 0
    let ltmdn = 0
    while (ltmdn + hist[mdn] < target) {
      ltmdn += hist[mdn]
      mdn++
    }
    out[y * width] = mdn

    for (let x = 1; x < width; x++) {
      // Slide window right: remove left column, add right column
      const xOut = clampX(x - radius - 1)
      const xIn = clampX(x + radius)
      for (let wy = -radius; wy <= radius; wy++) {
        const row = clampY(y + wy) * width
        const vOut = src[row + xOut]
        hist[vOut]--
        if (vOut < mdn) {
          ltmdn--
        }
        const vIn = src[row + xIn]
        hist[vIn]++
        if (vIn < mdn) {
          ltmdn++
        }
      }

      // Re-center median pointer
      if (ltmdn >= target) {
        do {
          mdn--
          ltmdn -= hist[mdn]
        } while (ltmdn >= target)
      }
      else {
        while (ltmdn + hist[mdn] < target) {
          ltmdn += hist[mdn]
          mdn++
        }
      }

      out[y * width + x] = mdn
    }
  }

  return out
}
