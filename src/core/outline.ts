import { sigmoid } from '../utils/math'
import { PixelImageData } from './imageData'
import { dilate, dilateSmooth, erode, erodeSmooth } from './morphology'
import { outlineHaloRows, processOutlineBand } from './outlineBand'
import { rgbaToLabLuminance01, rgbaToLabLuminance01Strided } from './planes'
import { quantize01ToU8, slidingMax, slidingMedianU8, slidingMin } from './slidingStats'

/**
 * Outline expansion algorithms.
 *
 * The expansion weight is computed from exact per-pixel sliding-window
 * statistics over the Lab L channel (matching the PyTorch reference,
 * which uses `rgb_to_lab(img)[:, 0:1] / 100`).
 */

/**
 * Compute sigmoid weights from local statistics and min-max normalize.
 */
function statsToNormalizedWeights(
  medianU8: Uint8Array,
  minStat: Float32Array,
  maxStat: Float32Array,
  avgScale: number,
  distScale: number,
): Float32Array {
  const weights = new Float32Array(medianU8.length)
  let minWeight = Infinity
  let maxWeight = -Infinity

  for (let i = 0; i < weights.length; i++) {
    const med = medianU8[i] / 255
    const brightDist = maxStat[i] - med
    const darkDist = med - minStat[i]
    const w = sigmoid((med - 0.5) * avgScale - (brightDist - darkDist) * distScale)
    weights[i] = w
    if (w < minWeight) {
      minWeight = w
    }
    if (w > maxWeight) {
      maxWeight = w
    }
  }

  const range = maxWeight - minWeight
  if (range > 0) {
    const invRange = 1 / range
    for (let i = 0; i < weights.length; i++) {
      weights[i] = (weights[i] - minWeight) * invRange
    }
  }

  return weights
}

/**
 * Bilinear upsample of a strided field back to full resolution. Field
 * sample (sx, sy) corresponds to full-res (sx*stride + stride>>1, ...).
 */
function bilinearUpsampleField(
  field: Float32Array,
  fieldWidth: number,
  fieldHeight: number,
  width: number,
  height: number,
  stride: number,
): Float32Array {
  const out = new Float32Array(width * height)
  const offset = stride >> 1
  const invStride = 1 / stride

  for (let y = 0; y < height; y++) {
    let fy = (y - offset) * invStride
    if (fy < 0) {
      fy = 0
    }
    else if (fy > fieldHeight - 1) {
      fy = fieldHeight - 1
    }
    const y0 = Math.floor(fy)
    const y1 = Math.min(fieldHeight - 1, y0 + 1)
    const ty = fy - y0
    const row0 = y0 * fieldWidth
    const row1 = y1 * fieldWidth
    const outRow = y * width

    for (let x = 0; x < width; x++) {
      let fx = (x - offset) * invStride
      if (fx < 0) {
        fx = 0
      }
      else if (fx > fieldWidth - 1) {
        fx = fieldWidth - 1
      }
      const x0 = Math.floor(fx)
      const x1 = Math.min(fieldWidth - 1, x0 + 1)
      const tx = fx - x0

      const top = field[row0 + x0] * (1 - tx) + field[row0 + x1] * tx
      const bottom = field[row1 + x0] * (1 - tx) + field[row1 + x1] * tx
      out[outRow + x] = top * (1 - ty) + bottom * ty
    }
  }

  return out
}

/**
 * Calculate expansion weight map.
 *
 * Statistics are computed on a stride-subsampled grid (matching the torch
 * reference, which unfolds with `stride=k//2` and folds the strided stats
 * back) and bilinearly upsampled to full resolution. With stride <= 1 the
 * statistics are exact at every pixel: median over a (2*patchSize+1)²
 * window, min/max over a (2*floor(patchSize/2)+1)² window.
 */
export function calculateExpansionWeight(
  imageData: PixelImageData,
  patchSize: number = 8,
  stride: number = 2,
  avgScale: number = 10,
  distScale: number = 3,
): Float32Array {
  const width = imageData.width
  const height = imageData.height
  const s = Math.max(1, Math.floor(stride))

  if (s === 1) {
    const lum = rgbaToLabLuminance01(imageData.data, width, height)
    const medianU8 = slidingMedianU8(quantize01ToU8(lum), width, height, patchSize)
    const minMaxRadius = Math.floor(patchSize / 2)
    const minStat = slidingMin(lum, width, height, minMaxRadius)
    const maxStat = slidingMax(lum, width, height, minMaxRadius)
    return statsToNormalizedWeights(medianU8, minStat, maxStat, avgScale, distScale)
  }

  const { field, fieldWidth, fieldHeight } = rgbaToLabLuminance01Strided(imageData.data, width, height, s)

  const medianRadius = Math.max(1, Math.round(patchSize / s))
  const minMaxRadius = Math.max(1, Math.round(Math.floor(patchSize / 2) / s))

  const medianU8 = slidingMedianU8(quantize01ToU8(field), fieldWidth, fieldHeight, medianRadius)
  const minStat = slidingMin(field, fieldWidth, fieldHeight, minMaxRadius)
  const maxStat = slidingMax(field, fieldWidth, fieldHeight, minMaxRadius)

  const small = statsToNormalizedWeights(medianU8, minStat, maxStat, avgScale, distScale)
  return bilinearUpsampleField(small, fieldWidth, fieldHeight, width, height, s)
}

/**
 * Calculate orig_weight based on expansion weight (matching Legacy implementation)
 */
function calculateOrigWeight(weights: Float32Array): Float32Array {
  const origWeights = new Float32Array(weights.length)
  // Indexed loop on purpose: TypedArray.entries() allocates per element.
  // eslint-disable-next-line unicorn/no-for-loop
  for (let i = 0; i < weights.length; i++) {
    // orig_weight = sigmoid((weight - 0.5) * 5) * 0.25
    origWeights[i] = sigmoid((weights[i] - 0.5) * 5) * 0.25
  }
  return origWeights
}

/**
 * Three-way weighted blend (eroded, dilated, original) on flat buffers.
 */
function threewayBlend(
  eroded: PixelImageData,
  dilated: PixelImageData,
  original: PixelImageData,
  weights: Float32Array,
  origWeights: Float32Array,
): PixelImageData {
  const e = eroded.data
  const d = dilated.data
  const o = original.data
  const out = new Uint8ClampedArray(o.length)

  for (let i = 0, p = 0; i < weights.length; i++, p += 4) {
    const w = weights[i]
    const ow = origWeights[i]
    const morphW = 1 - ow
    for (let c = 0; c < 4; c++) {
      const blended = e[p + c] * w + d[p + c] * (1 - w)
      out[p + c] = blended * morphW + o[p + c] * ow
    }
  }

  return new PixelImageData(original.width, original.height, out)
}

/**
 * Post-process weights for display/return: |w*2 - 1| dilated by a
 * (2*iters+1)² max window (equivalent to iterating a 3x3 dilation).
 */
function processReturnWeights(weights: Float32Array, width: number, height: number, dilateIters: number): Float32Array {
  const folded = new Float32Array(weights.length)
  // Indexed loop on purpose: TypedArray.entries() allocates per element.
  // eslint-disable-next-line unicorn/no-for-loop
  for (let i = 0; i < weights.length; i++) {
    folded[i] = Math.abs(weights[i] * 2 - 1)
  }
  return slidingMax(folded, width, height, dilateIters)
}

/**
 * Legacy outline expansion (matching the original numpy implementation):
 * iterated 3x3 box morphology, three-way blend with original image, and a
 * smoothing open/close sequence with the cross kernel.
 */
export function outlineExpansion(
  imageData: PixelImageData,
  erodeIters: number = 2,
  dilateIters: number = 2,
  patchSize: number = 16,
  avgScale: number = 10,
  distScale: number = 3,
): { result: PixelImageData, weights: Float32Array } {
  const weights = calculateExpansionWeight(imageData, patchSize, Math.floor(patchSize / 4) * 2, avgScale, distScale)
  const origWeights = calculateOrigWeight(weights)

  const imgErode = erode(imageData, erodeIters)
  const imgDilate = dilate(imageData, dilateIters)

  let result = threewayBlend(imgErode, imgDilate, imageData, weights, origWeights)

  result = erodeSmooth(result, erodeIters)
  result = dilateSmooth(result, dilateIters * 2)
  result = erodeSmooth(result, erodeIters)

  return {
    result,
    weights: processReturnWeights(weights, imageData.width, imageData.height, dilateIters),
  }
}

/**
 * Outline expansion matching the PyTorch reference pipeline: a single pass
 * of continuous circle-kernel morphology sized by the iteration count,
 * two-way blend, then an open/close sequence with a smaller circle kernel.
 *
 * The `edgeThreshold` parameter is kept for API compatibility and ignored.
 * Pass `useOptimization: false` to fall back to the legacy algorithm.
 * `computeReturnWeights: false` skips the display-weight post-processing
 * (a full-resolution dilation) and returns the raw weight field instead.
 */
export function outlineExpansionOptimized(
  imageData: PixelImageData,
  erodeIters: number = 2,
  dilateIters: number = 2,
  patchSize: number = 16,
  avgScale: number = 10,
  distScale: number = 3,
  _edgeThreshold: number = 0.1,
  useOptimization: boolean = true,
  computeReturnWeights: boolean = true,
): { result: PixelImageData, weights: Float32Array, edgeCoverage?: number } {
  if (!useOptimization) {
    return outlineExpansion(imageData, erodeIters, dilateIters, patchSize, avgScale, distScale)
  }

  const weights = calculateExpansionWeight(imageData, patchSize, Math.floor(patchSize / 4) * 2, avgScale, distScale)

  const result = new PixelImageData(
    imageData.width,
    imageData.height,
    processOutlineBand(imageData.data, imageData.width, imageData.height, weights, erodeIters, dilateIters, 0, 0),
  )

  return {
    result,
    weights: computeReturnWeights
      ? processReturnWeights(weights, imageData.width, imageData.height, dilateIters)
      : weights,
  }
}

// ---------------------------------------------------------------------------
// Worker-parallel variant
// ---------------------------------------------------------------------------

interface OutlineBandResponse {
  id: number
  out: ArrayBuffer
}

let workerPool: Worker[] | null | undefined
let nextJobId = 0
const pendingJobs = new Map<number, (out: ArrayBuffer) => void>()

function getWorkerPool(): Worker[] | null {
  if (workerPool !== undefined) {
    return workerPool
  }

  workerPool = null
  if (typeof Worker === 'undefined') {
    return workerPool
  }

  const cores = globalThis.navigator?.hardwareConcurrency ?? 4
  const count = Math.min(8, Math.max(1, cores - 1))
  if (count <= 1) {
    return workerPool
  }

  try {
    workerPool = Array.from({ length: count }, () => {
      const worker = new Worker(new URL('../workers/outline.worker.ts', import.meta.url), { type: 'module' })
      worker.addEventListener('message', (event: MessageEvent<OutlineBandResponse>) => {
        const { id, out } = event.data
        const resolve = pendingJobs.get(id)
        if (resolve) {
          pendingJobs.delete(id)
          resolve(out)
        }
      })
      return worker
    })
  }
  catch {
    workerPool = null
  }

  return workerPool
}

function runBandOnWorker(
  worker: Worker,
  src: Uint8ClampedArray,
  weights: Float32Array,
  width: number,
  rows: number,
  erodeIters: number,
  dilateIters: number,
  trimTop: number,
  trimBottom: number,
): Promise<Uint8ClampedArray> {
  return new Promise((resolve) => {
    const id = nextJobId++
    pendingJobs.set(id, out => resolve(new Uint8ClampedArray(out)))
    worker.postMessage(
      { id, src: src.buffer, weights: weights.buffer, width, rows, erodeIters, dilateIters, trimTop, trimBottom },
      [src.buffer, weights.buffer],
    )
  })
}

/**
 * Async outline expansion: identical output to
 * {@link outlineExpansionOptimized}, but the morphology chain is split into
 * horizontal bands (with halo rows) and processed concurrently on a Web
 * Worker pool. Falls back to the synchronous path when Workers are
 * unavailable (e.g. Node) or the image is small.
 */
export async function outlineExpansionOptimizedAsync(
  imageData: PixelImageData,
  erodeIters: number = 2,
  dilateIters: number = 2,
  patchSize: number = 16,
  avgScale: number = 10,
  distScale: number = 3,
  edgeThreshold: number = 0.1,
  useOptimization: boolean = true,
  computeReturnWeights: boolean = true,
): Promise<{ result: PixelImageData, weights: Float32Array, edgeCoverage?: number }> {
  const { width, height } = imageData
  const pool = useOptimization && width * height >= 500_000 ? getWorkerPool() : null

  if (!pool) {
    return outlineExpansionOptimized(
      imageData,
      erodeIters,
      dilateIters,
      patchSize,
      avgScale,
      distScale,
      edgeThreshold,
      useOptimization,
      computeReturnWeights,
    )
  }

  const weights = calculateExpansionWeight(imageData, patchSize, Math.floor(patchSize / 4) * 2, avgScale, distScale)

  const halo = outlineHaloRows(erodeIters, dilateIters)
  const bandCount = Math.min(pool.length, Math.max(1, Math.floor(height / Math.max(32, halo * 4))))

  const jobs: Promise<Uint8ClampedArray>[] = []
  const bandStarts: number[] = []

  for (let band = 0; band < bandCount; band++) {
    const y0 = Math.floor(band * height / bandCount)
    const y1 = Math.floor((band + 1) * height / bandCount)
    const top = Math.max(0, y0 - halo)
    const bottom = Math.min(height, y1 + halo)
    const rows = bottom - top

    // slice() copies, so each band owns transferable buffers
    const srcSlice = imageData.data.slice(top * width * 4, bottom * width * 4)
    const weightsSlice = weights.slice(top * width, bottom * width)

    bandStarts.push(y0)
    jobs.push(runBandOnWorker(
      pool[band % pool.length],
      srcSlice,
      weightsSlice,
      width,
      rows,
      erodeIters,
      dilateIters,
      y0 - top,
      bottom - y1,
    ))
  }

  const bandResults = await Promise.all(jobs)

  const out = new Uint8ClampedArray(width * height * 4)
  for (const [band, bandData] of bandResults.entries()) {
    out.set(bandData, bandStarts[band] * width * 4)
  }

  return {
    result: new PixelImageData(width, height, out),
    weights: computeReturnWeights
      ? processReturnWeights(weights, width, height, dilateIters)
      : weights,
  }
}
