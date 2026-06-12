import { clamp } from '../utils/math'
import { hsvToRgb, rgbToHsv } from './colorSpace'
import { PixelImageData } from './imageData'
import { labPlanesToRgba, rgbaToLabPlanes } from './planes'

/**
 * Color processing utilities
 */

interface ChannelStats {
  mean: number
  std: number
}

function planeStats(plane: Float32Array, scale: number, offset: number): ChannelStats {
  let sum = 0
  for (const element of plane) {
    sum += element * scale + offset
  }
  const mean = sum / plane.length

  let varSum = 0
  for (const element of plane) {
    const d = element * scale + offset - mean
    varSum += d * d
  }
  return { mean, std: Math.sqrt(varSum / plane.length) }
}

/**
 * Match color statistics between source and target images (matching Python).
 * Statistical Lab transfer followed by a multi-level wavelet color fix.
 */
export function matchColor(source: PixelImageData, target: PixelImageData, level: number = 5): PixelImageData {
  const srcPlanes = rgbaToLabPlanes(source.data, source.width, source.height)
  const tgtPlanes = rgbaToLabPlanes(target.data, target.width, target.height)

  // Stats in cv2-compatible ranges: L -> [0,255], a/b -> value + 128
  const srcL = planeStats(srcPlanes.l, 255 / 100, 0)
  const srcA = planeStats(srcPlanes.a, 1, 128)
  const srcB = planeStats(srcPlanes.b, 1, 128)
  const tgtL = planeStats(tgtPlanes.l, 255 / 100, 0)
  const tgtA = planeStats(tgtPlanes.a, 1, 128)
  const tgtB = planeStats(tgtPlanes.b, 1, 128)

  // Transform source planes in place: (v - srcMean) / srcStd * tgtStd + tgtMean
  const lScale = tgtL.std / (srcL.std || 1)
  const aScale = tgtA.std / (srcA.std || 1)
  const bScale = tgtB.std / (srcB.std || 1)

  for (let i = 0; i < srcPlanes.l.length; i++) {
    const cvL = srcPlanes.l[i] * (255 / 100)
    const cvA = srcPlanes.a[i] + 128
    const cvB = srcPlanes.b[i] + 128

    const newL = (cvL - srcL.mean) * lScale + tgtL.mean
    const newA = (cvA - srcA.mean) * aScale + tgtA.mean
    const newB = (cvB - srcB.mean) * bScale + tgtB.mean

    srcPlanes.l[i] = newL * (100 / 255)
    srcPlanes.a[i] = newA - 128
    srcPlanes.b[i] = newB - 128
  }

  const matched = new PixelImageData(
    source.width,
    source.height,
    labPlanesToRgba(srcPlanes),
  )

  return improvedWaveletColorFix(matched, target, level)
}

/**
 * Wavelet color correction: keep the source's high frequencies and the
 * target's low frequencies, per RGB channel.
 */
function improvedWaveletColorFix(source: PixelImageData, target: PixelImageData, level: number): PixelImageData {
  const width = source.width
  const height = source.height
  const n = width * height
  const result = new PixelImageData(width, height)
  const out = result.data
  const srcData = source.data
  const tgtData = target.data

  // Preserve alpha
  for (let i = 0; i < n; i++) {
    out[i * 4 + 3] = srcData[i * 4 + 3]
  }

  const srcChannel = new Float32Array(n)
  const tgtChannel = new Float32Array(n)

  for (let channel = 0; channel < 3; channel++) {
    for (let i = 0; i < n; i++) {
      srcChannel[i] = srcData[i * 4 + channel]
    }
    // Target may have different dimensions; clamp-sample it onto the source grid
    if (target.width === width && target.height === height) {
      for (let i = 0; i < n; i++) {
        tgtChannel[i] = tgtData[i * 4 + channel]
      }
    }
    else {
      for (let y = 0; y < height; y++) {
        const ty = Math.min(y, target.height - 1)
        for (let x = 0; x < width; x++) {
          const tx = Math.min(x, target.width - 1)
          tgtChannel[y * width + x] = tgtData[(ty * target.width + tx) * 4 + channel]
        }
      }
    }

    const sourceHigh = waveletDecomposition(srcChannel, width, height, level).high
    const targetLow = waveletDecomposition(tgtChannel, width, height, level).low

    for (let i = 0; i < n; i++) {
      out[i * 4 + channel] = sourceHigh[i] + targetLow[i]
    }
  }

  return result
}

/**
 * Multi-level wavelet decomposition via box-blur low-pass per level.
 */
function waveletDecomposition(channel: Float32Array, width: number, height: number, levels: number): { high: Float32Array, low: Float32Array } {
  const highFreq = new Float32Array(channel.length)
  let current: Float32Array = new Float32Array(channel)

  for (let i = 1; i <= levels; i++) {
    const radius = 2 ** i
    const lowFreq = boxBlurReplicate(current, width, height, radius)

    for (let j = 0; j < channel.length; j++) {
      highFreq[j] += current[j] - lowFreq[j]
    }

    current = lowFreq
  }

  return { high: highFreq, low: current }
}

/**
 * Separable running box blur with replicated borders — O(1) per pixel
 * regardless of radius (each window always holds (2r+1)² samples, with
 * edge samples repeated, matching clamp-based sampling).
 */
function boxBlurReplicate(channel: Float32Array, width: number, height: number, radius: number): Float32Array {
  const temp = new Float32Array(channel.length)
  const out = new Float32Array(channel.length)
  const window = 2 * radius + 1

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    for (let x = -radius; x <= radius; x++) {
      sum += channel[row + clamp(x, 0, width - 1)]
    }
    temp[row] = sum / window
    for (let x = 1; x < width; x++) {
      sum += channel[row + clamp(x + radius, 0, width - 1)]
      sum -= channel[row + clamp(x - radius - 1, 0, width - 1)]
      temp[row + x] = sum / window
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = -radius; y <= radius; y++) {
      sum += temp[clamp(y, 0, height - 1) * width + x]
    }
    out[x] = sum / window
    for (let y = 1; y < height; y++) {
      sum += temp[clamp(y + radius, 0, height - 1) * width + x]
      sum -= temp[clamp(y - radius - 1, 0, height - 1) * width + x]
      out[y * width + x] = sum / window
    }
  }

  return out
}

/**
 * Adjust color saturation and contrast
 */
export function colorStyling(
  imageData: PixelImageData,
  saturation: number = 1,
  contrast: number = 1,
): PixelImageData {
  const result = new PixelImageData(imageData.width, imageData.height)
  const src = imageData.data
  const dst = result.data

  for (let p = 0; p < src.length; p += 4) {
    const [
      h,
      s,
      v,
    ] = rgbToHsv(src[p], src[p + 1], src[p + 2])

    const newS = clamp(s * saturation, 0, 1)
    const newV = clamp(v * contrast - (contrast - 1) * 0.5, 0, 1)

    const [
      r,
      g,
      b,
    ] = hsvToRgb(h, newS, newV)
    dst[p] = r
    dst[p + 1] = g
    dst[p + 2] = b
    dst[p + 3] = src[p + 3]
  }

  return result
}
