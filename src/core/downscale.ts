import type { PixelImageData } from './imageData'
import { clamp, mean, median } from '../utils/math'
import { labToRgb, rgbToLab } from './colorSpace'
import { resizeImageSync } from './imageResize'

function selectPixelLuminanceByContrast(luminances: number[]): number {
  if (luminances.length === 0) {
    return 0
  }

  const medianLum = median(luminances)
  const meanLum = mean(luminances)
  const maxLum = Math.max(...luminances)
  const minLum = Math.min(...luminances)

  const midIdx = Math.floor(luminances.length / 2)
  let selectedValue = luminances[midIdx]

  const cond1 = medianLum < meanLum && (maxLum - medianLum) > (medianLum - minLum)
  const cond2 = medianLum > meanLum && (maxLum - medianLum) < (medianLum - minLum)

  if (cond1) {
    selectedValue = minLum
  }
  else if (cond2) {
    selectedValue = maxLum
  }

  return selectedValue
}

export function contrastDownscale(imageData: PixelImageData, targetSize: number = 128): PixelImageData {
  const { width: w, height: h } = imageData
  const ratio = w / h
  const adjustedTargetSize = Math.sqrt((targetSize * targetSize) / ratio)
  const targetHW: [number, number] = [
    Math.floor(adjustedTargetSize * ratio),
    Math.floor(adjustedTargetSize),
  ]

  const patchSize = Math.max(
    Math.round(h / targetHW[1]),
    Math.round(w / targetHW[0]),
  )

  console.log(`Contrast downscale: targetSize=${targetSize}, targetHW=[${targetHW[0]}, ${targetHW[1]}], patchSize=${patchSize}`)

  const processedImage = imageData.clone()

  for (let y = 0; y < h; y += patchSize) {
    for (let x = 0; x < w; x += patchSize) {
      const lPatch: number[] = []
      const aPatch: number[] = []
      const bPatch: number[] = []

      for (let py = y; py < Math.min(y + patchSize, h); py++) {
        for (let px = x; px < Math.min(x + patchSize, w); px++) {
          const [r, g, b] = imageData.getPixel(px, py)
          const [l, a, bLab] = rgbToLab(r, g, b)

          lPatch.push(l)
          aPatch.push(a)
          bPatch.push(bLab)
        }
      }

      const selectedL = selectPixelLuminanceByContrast(lPatch)
      const medianA = median(aPatch)
      const medianB = median(bPatch)
      const [finalR, finalG, finalB] = labToRgb(selectedL, medianA, medianB)

      for (let py = y; py < Math.min(y + patchSize, h); py++) {
        for (let px = x; px < Math.min(x + patchSize, w); px++) {
          processedImage.setPixel(px, py, [
            Math.round(clamp(finalR, 0, 255)),
            Math.round(clamp(finalG, 0, 255)),
            Math.round(clamp(finalB, 0, 255)),
            255,
          ])
        }
      }
    }
  }

  return resizeImageSync(processedImage, targetHW[0], targetHW[1], 'nearest')
}
