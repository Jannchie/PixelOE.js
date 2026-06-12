import { PixelImageData } from './imageData'

/**
 * Morphological operations for image processing.
 *
 * All operations work directly on flat RGBA buffers with precomputed
 * kernel taps — no per-pixel allocations, no GPU round-trips.
 */

/**
 * Generate circle kernel (matching Python implementation exactly)
 */
function generatePythonCircleKernel(r: number): number[][] {
  const intR = Math.floor(r)
  const size = 2 * intR + 1
  const kernel = Array.from(
    { length: size },
    () => Array.from({ length: size }, () => 0),
  )

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const points = [
        [i - 0.5, j - 0.5],
        [i - 0.5, j + 0.5],
        [i + 0.5, j - 0.5],
        [i + 0.5, j + 0.5],
        [i, j + 0.5],
        [i, j - 0.5],
        [i + 0.5, j],
        [i - 0.5, j],
      ]

      const distances = points.map(p => Math.hypot((p[0] - intR), (p[1] - intR)))
      const maxDistance = Math.max(...distances)
      const minDistance = Math.min(...distances)

      if (maxDistance <= r) {
        kernel[i][j] = 1
      }
      else if (minDistance <= r) {
        const b = (r - minDistance) / (maxDistance - minDistance)
        kernel[i][j] = b
      }
    }
  }

  return kernel
}

/**
 * Predefined kernels matching Python KERNELS
 */
const PYTHON_KERNELS: { [key: number]: number[][] } = {
  1: generatePythonCircleKernel(1),
  2: generatePythonCircleKernel(1.5),
  3: generatePythonCircleKernel(2).slice(1, 4).map(row => row.slice(1, 4)),
  4: generatePythonCircleKernel(2.5),
  5: generatePythonCircleKernel(3).slice(1, 6).map(row => row.slice(1, 6)),
  6: generatePythonCircleKernel(3.5),
}

/** Largest available continuous kernel index. */
export const MAX_KERNEL_INDEX = 6

/**
 * Create expansion kernel (3x3 all ones - matching Python kernel_expansion)
 */
export function createExpansionKernel(): number[][] {
  return [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ]
}

/**
 * Create smoothing kernel (cross shape - matching Python kernel_smoothing)
 */
export function createSmoothingKernel(): number[][] {
  return [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ]
}

/**
 * Create a circular kernel for morphological operations (kept for backward compatibility)
 */
export function createCircularKernel(radius: number): number[][] {
  const size = Math.floor(radius) * 2 + 1
  const center = Math.floor(size / 2)
  const kernel: number[][] = []

  for (let y = 0; y < size; y++) {
    kernel[y] = []
    for (let x = 0; x < size; x++) {
      const dx = x - center
      const dy = y - center
      const distance = Math.hypot(dx, dy)

      if (distance <= radius - 0.5) {
        kernel[y][x] = 1
      }
      else if (distance <= radius + 0.5) {
        kernel[y][x] = radius + 0.5 - distance
      }
      else {
        kernel[y][x] = 0
      }
    }
  }

  return kernel
}

interface KernelTaps {
  dx: Int32Array
  dy: Int32Array
  /** (weight - 1) * 255: added before max for dilate, subtracted before min for erode. */
  addend: Float32Array
  radius: number
}

const tapsCache = new Map<string, KernelTaps>()

function flattenKernel(kernel: number[][], cacheKey?: string): KernelTaps {
  if (cacheKey) {
    const cached = tapsCache.get(cacheKey)
    if (cached) {
      return cached
    }
  }

  const half = Math.floor(kernel.length / 2)
  const dx: number[] = []
  const dy: number[] = []
  const addend: number[] = []

  for (const [ky, row] of kernel.entries()) {
    for (const [kx, weight] of row.entries()) {
      if (weight <= 0) {
        continue
      }
      dx.push(kx - half)
      dy.push(ky - half)
      addend.push((weight - 1) * 255)
    }
  }

  const taps: KernelTaps = {
    dx: new Int32Array(dx),
    dy: new Int32Array(dy),
    addend: new Float32Array(addend),
    radius: half,
  }
  if (cacheKey) {
    tapsCache.set(cacheKey, taps)
  }
  return taps
}

/**
 * One pass of a weighted (continuous) morphological operation.
 * dilate: out = clamp(max(src[tap] + addend)), erode: out = clamp(min(src[tap] - addend)).
 * Matches the PyTorch `dilate_cont`/`erode_cont` semantics in the 0..255 domain.
 * Only RGB is filtered (the torch reference operates on 3 channels);
 * alpha is copied through from the center pixel.
 */
function morphPass(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  height: number,
  taps: KernelTaps,
  isDilate: boolean,
): void {
  const { dx, dy, addend, radius } = taps
  const tapCount = dx.length

  // Precompute linear offsets for the interior fast path
  const offsets = new Int32Array(tapCount)
  for (let t = 0; t < tapCount; t++) {
    offsets[t] = (dy[t] * width + dx[t]) * 4
  }

  for (let y = 0; y < height; y++) {
    const isBorderRow = y < radius || y >= height - radius
    const rowBase = y * width * 4

    for (let x = 0; x < width; x++) {
      const idx = rowBase + x * 4
      let bestR = isDilate ? -Infinity : Infinity
      let bestG = bestR
      let bestB = bestR

      if (!isBorderRow && x >= radius && x < width - radius) {
        if (isDilate) {
          for (let t = 0; t < tapCount; t++) {
            const s = idx + offsets[t]
            const add = addend[t]
            const r = src[s] + add
            const g = src[s + 1] + add
            const b = src[s + 2] + add
            if (r > bestR) {
              bestR = r
            }
            if (g > bestG) {
              bestG = g
            }
            if (b > bestB) {
              bestB = b
            }
          }
        }
        else {
          for (let t = 0; t < tapCount; t++) {
            const s = idx + offsets[t]
            const add = addend[t]
            const r = src[s] - add
            const g = src[s + 1] - add
            const b = src[s + 2] - add
            if (r < bestR) {
              bestR = r
            }
            if (g < bestG) {
              bestG = g
            }
            if (b < bestB) {
              bestB = b
            }
          }
        }
      }
      else {
        for (let t = 0; t < tapCount; t++) {
          let px = x + dx[t]
          let py = y + dy[t]
          if (px < 0) {
            px = 0
          }
          else if (px >= width) {
            px = width - 1
          }
          if (py < 0) {
            py = 0
          }
          else if (py >= height) {
            py = height - 1
          }
          const s = (py * width + px) * 4
          const add = addend[t]
          if (isDilate) {
            const r = src[s] + add
            const g = src[s + 1] + add
            const b = src[s + 2] + add
            if (r > bestR) {
              bestR = r
            }
            if (g > bestG) {
              bestG = g
            }
            if (b > bestB) {
              bestB = b
            }
          }
          else {
            const r = src[s] - add
            const g = src[s + 1] - add
            const b = src[s + 2] - add
            if (r < bestR) {
              bestR = r
            }
            if (g < bestG) {
              bestG = g
            }
            if (b < bestB) {
              bestB = b
            }
          }
        }
      }

      // Uint8ClampedArray store rounds and clamps to [0, 255]
      dst[idx] = bestR
      dst[idx + 1] = bestG
      dst[idx + 2] = bestB
      dst[idx + 3] = src[idx + 3]
    }
  }
}

function applyMorphTaps(
  imageData: PixelImageData,
  taps: KernelTaps,
  isDilate: boolean,
  iterations: number,
): PixelImageData {
  let src = new Uint8ClampedArray(imageData.data)
  let dst = new Uint8ClampedArray(src.length)

  for (let iter = 0; iter < iterations; iter++) {
    morphPass(src, dst, imageData.width, imageData.height, taps, isDilate);
    [src, dst] = [dst, src]
  }

  return new PixelImageData(imageData.width, imageData.height, src)
}

/**
 * Binary 3x3 box min/max, separable into a horizontal and a vertical pass
 * (6 comparisons per pixel instead of 9).
 */
function morphBox3x3(imageData: PixelImageData, isDilate: boolean, iterations: number): PixelImageData {
  const width = imageData.width
  const height = imageData.height
  const src = new Uint8ClampedArray(imageData.data)
  const dst = new Uint8ClampedArray(src.length)

  const pass = (input: Uint8ClampedArray, output: Uint8ClampedArray, horizontal: boolean): void => {
    const stride = horizontal ? 4 : width * 4
    const limit = horizontal ? width : height

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const pos = horizontal ? x : y
        const prev = pos > 0 ? idx - stride : idx
        const next = pos < limit - 1 ? idx + stride : idx

        for (let c = 0; c < 3; c++) {
          const a = input[prev + c]
          const b = input[idx + c]
          const d = input[next + c]
          output[idx + c] = isDilate
            ? (a > b ? (Math.max(a, d)) : (Math.max(b, d)))
            : (a < b ? (Math.min(a, d)) : (Math.min(b, d)))
        }
        output[idx + 3] = input[idx + 3]
      }
    }
  }

  for (let iter = 0; iter < iterations; iter++) {
    pass(src, dst, true)
    pass(dst, src, false)
  }

  return new PixelImageData(width, height, src)
}

/**
 * Dilate operation with 3x3 expansion kernel
 */
export function dilate(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  return morphBox3x3(imageData, true, iterations)
}

/**
 * Erode operation with 3x3 expansion kernel
 */
export function erode(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  return morphBox3x3(imageData, false, iterations)
}

/**
 * Dilate operation with smoothing kernel (cross-shaped)
 */
export function dilateSmooth(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  const taps = flattenKernel(createSmoothingKernel(), 'smooth')
  return applyMorphTaps(imageData, taps, true, iterations)
}

/**
 * Erode operation with smoothing kernel (cross-shaped)
 */
export function erodeSmooth(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  const taps = flattenKernel(createSmoothingKernel(), 'smooth')
  return applyMorphTaps(imageData, taps, false, iterations)
}

/**
 * Morphological opening (erode then dilate)
 */
export function opening(imageData: PixelImageData, kernelSize: number = 3): PixelImageData {
  const eroded = erode(imageData, kernelSize)
  return dilate(eroded, kernelSize)
}

/**
 * Morphological closing (dilate then erode)
 */
export function closing(imageData: PixelImageData, kernelSize: number = 3): PixelImageData {
  const dilated = dilate(imageData, kernelSize)
  return erode(dilated, kernelSize)
}

function getPythonKernelTaps(kernelIndex: number): KernelTaps {
  const kernel = PYTHON_KERNELS[kernelIndex]
  if (!kernel) {
    throw new Error(`Invalid kernel index: ${kernelIndex}`)
  }
  return flattenKernel(kernel, `py:${kernelIndex}`)
}

/** Spatial radius of a continuous circle kernel (half its side length). */
export function getKernelRadius(kernelIndex: number): number {
  const kernel = PYTHON_KERNELS[kernelIndex]
  if (!kernel) {
    throw new Error(`Invalid kernel index: ${kernelIndex}`)
  }
  return Math.floor(kernel.length / 2)
}

/**
 * Dilate operation using continuous circle kernel (matching PyTorch dilate_cont)
 */
export function dilateWithKernel(imageData: PixelImageData, kernelIndex: number, iterations: number = 1): PixelImageData {
  return applyMorphTaps(imageData, getPythonKernelTaps(kernelIndex), true, iterations)
}

/**
 * Erode operation using continuous circle kernel (matching PyTorch erode_cont)
 */
export function erodeWithKernel(imageData: PixelImageData, kernelIndex: number, iterations: number = 1): PixelImageData {
  return applyMorphTaps(imageData, getPythonKernelTaps(kernelIndex), false, iterations)
}
