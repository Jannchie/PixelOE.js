import { matchColor } from './color'
/**
 * Fast color matching for large images.
 */
import { PixelImageData } from './imageData'
import { labStatTransfer, rgbaToLabPlanes } from './planes'

/**
 * Color matching that picks a strategy by image size: full wavelet
 * matching for small images, sampled statistical transfer for large ones.
 */
export function matchColorFast(source: PixelImageData, target: PixelImageData): PixelImageData {
  const totalPixels = source.width * source.height
  if (totalPixels > 500_000) {
    return fastSampledColorMatch(source, target)
  }
  return matchColor(source, target)
}

interface LabStats {
  mean: [number, number, number]
  std: [number, number, number]
}

/**
 * Deterministic grid-sampled Lab statistics (cv2-compatible ranges).
 */
function sampledStats(image: PixelImageData, sampleCount: number): LabStats {
  const total = image.width * image.height
  const step = Math.max(1, Math.floor(total / sampleCount))

  // Collect samples into compact RGBA, then convert in one pass
  const n = Math.floor((total - 1) / step) + 1
  const samples = new Uint8ClampedArray(n * 4)
  for (let i = 0, s = 0; i < total; i += step, s += 4) {
    const p = i * 4
    samples[s] = image.data[p]
    samples[s + 1] = image.data[p + 1]
    samples[s + 2] = image.data[p + 2]
    samples[s + 3] = 255
  }

  const planes = rgbaToLabPlanes(samples, n, 1)
  const mean: [number, number, number] = [0, 0, 0]
  const std: [number, number, number] = [0, 0, 0]

  for (let i = 0; i < n; i++) {
    mean[0] += planes.l[i] * (255 / 100)
    mean[1] += planes.a[i] + 128
    mean[2] += planes.b[i] + 128
  }
  mean[0] /= n
  mean[1] /= n
  mean[2] /= n

  for (let i = 0; i < n; i++) {
    const dl = planes.l[i] * (255 / 100) - mean[0]
    const da = planes.a[i] + 128 - mean[1]
    const db = planes.b[i] + 128 - mean[2]
    std[0] += dl * dl
    std[1] += da * da
    std[2] += db * db
  }
  std[0] = Math.sqrt(std[0] / n)
  std[1] = Math.sqrt(std[1] / n)
  std[2] = Math.sqrt(std[2] / n)

  return { mean, std }
}

/**
 * Statistical Lab transfer using sampled statistics, applied to every
 * pixel in a single fused pass (no intermediate planes).
 *
 * The cv2-range transform `newCv = (cv - srcMean) * scale + tgtMean` is
 * affine in native Lab units, so it folds into per-channel scale/offset:
 * cvL = L * 2.55, cvA = a + 128, cvB = b + 128.
 */
function fastSampledColorMatch(source: PixelImageData, target: PixelImageData): PixelImageData {
  const sampleCount = Math.min(10_000, Math.floor(source.width * source.height / 100))
  const sourceStats = sampledStats(source, sampleCount)
  const targetStats = sampledStats(target, sampleCount)

  const lScale = sourceStats.std[0] > 0 ? targetStats.std[0] / sourceStats.std[0] : 1
  const aScale = sourceStats.std[1] > 0 ? targetStats.std[1] / sourceStats.std[1] : 1
  const bScale = sourceStats.std[2] > 0 ? targetStats.std[2] / sourceStats.std[2] : 1

  const out = labStatTransfer(source.data, source.width, source.height, {
    lScale,
    lOffset: (targetStats.mean[0] - lScale * sourceStats.mean[0]) / 2.55,
    aScale,
    aOffset: aScale * (128 - sourceStats.mean[1]) + targetStats.mean[1] - 128,
    bScale,
    bOffset: bScale * (128 - sourceStats.mean[2]) + targetStats.mean[2] - 128,
  })

  return new PixelImageData(source.width, source.height, out)
}
