import { describe, expect, it } from 'vitest'
import { PixelImageData } from '../src/core/imageData'
import { calculateExpansionWeight, outlineExpansionOptimized, outlineExpansionOptimizedAsync } from '../src/core/outline'
import { outlineHaloRows, processOutlineBand } from '../src/core/outlineBand'

function syntheticImage(width: number, height: number): PixelImageData {
  const image = new PixelImageData(width, height)
  const data = image.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const cx = x - width / 2
      const cy = y - height / 2
      const inCircle = cx * cx + cy * cy < (width / 4) ** 2
      const stripe = Math.floor(x / 8) % 2 === 0
      data[idx] = inCircle ? 220 : Math.floor((x / width) * 255)
      data[idx + 1] = stripe ? 180 : Math.floor((y / height) * 255)
      data[idx + 2] = inCircle && stripe ? 40 : 128
      data[idx + 3] = 255
    }
  }
  return image
}

describe('outlineband', () => {
  it('banded processing with halo equals whole-image processing', () => {
    const width = 96
    const height = 120
    const image = syntheticImage(width, height)
    const erodeIters = 3
    const dilateIters = 3

    const weights = calculateExpansionWeight(image, 6, 2, 9, 4)

    // Whole image in one band
    const whole = processOutlineBand(
      new Uint8ClampedArray(image.data),
      width,
      height,
      new Float32Array(weights),
      erodeIters,
      dilateIters,
      0,
      0,
    )

    // Split into 3 bands with halo, stitch
    const halo = outlineHaloRows(erodeIters, dilateIters)
    const stitched = new Uint8ClampedArray(width * height * 4)
    const bandCount = 3
    for (let band = 0; band < bandCount; band++) {
      const y0 = Math.floor(band * height / bandCount)
      const y1 = Math.floor((band + 1) * height / bandCount)
      const top = Math.max(0, y0 - halo)
      const bottom = Math.min(height, y1 + halo)
      const out = processOutlineBand(
        image.data.slice(top * width * 4, bottom * width * 4),
        width,
        bottom - top,
        weights.slice(top * width, bottom * width),
        erodeIters,
        dilateIters,
        y0 - top,
        bottom - y1,
      )
      stitched.set(out, y0 * width * 4)
    }

    expect([...stitched]).toEqual([...whole])
  })

  it('async variant falls back to sync and matches its output (no worker in node)', async () => {
    const image = syntheticImage(80, 80)
    const sync = outlineExpansionOptimized(image, 2, 2, 6, 9, 4)
    const async_ = await outlineExpansionOptimizedAsync(image, 2, 2, 6, 9, 4)

    expect([...async_.result.data]).toEqual([...sync.result.data])
    expect([...async_.weights]).toEqual([...sync.weights])
  })

  it('halo is large enough: growing it further changes nothing', () => {
    const width = 64
    const height = 96
    const image = syntheticImage(width, height)
    const weights = calculateExpansionWeight(image, 6, 2, 9, 4)
    const halo = outlineHaloRows(2, 2)

    // Band in the middle with the computed halo vs a much larger halo
    const y0 = 40
    const y1 = 56
    const run = (h: number): Uint8ClampedArray => {
      const top = Math.max(0, y0 - h)
      const bottom = Math.min(height, y1 + h)
      return processOutlineBand(
        image.data.slice(top * width * 4, bottom * width * 4),
        width,
        bottom - top,
        weights.slice(top * width, bottom * width),
        2,
        2,
        y0 - top,
        bottom - y1,
      )
    }

    expect([...run(halo)]).toEqual([...run(halo * 3)])
  })
})
