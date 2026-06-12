import { describe, expect, it } from 'vitest'
import { PixelImageData } from '../src/core/imageData'
import { resizeAreaSync, resizeBilinearSync, resizeImageSync, resizeNearestSync } from '../src/core/imageResize'

function solidImage(width: number, height: number, rgba: [number, number, number, number]): PixelImageData {
  const image = new PixelImageData(width, height)
  for (let i = 0; i < width * height * 4; i += 4) {
    image.data[i] = rgba[0]
    image.data[i + 1] = rgba[1]
    image.data[i + 2] = rgba[2]
    image.data[i + 3] = rgba[3]
  }
  return image
}

describe('imageresize', () => {
  it('nearest upscale by integer factor replicates pixels exactly', () => {
    const image = new PixelImageData(2, 2)
    image.setPixel(0, 0, [255, 0, 0, 255])
    image.setPixel(1, 0, [0, 255, 0, 255])
    image.setPixel(0, 1, [0, 0, 255, 255])
    image.setPixel(1, 1, [255, 255, 0, 255])

    const up = resizeNearestSync(image, 4, 4)
    expect(up.getPixel(0, 0)).toEqual([255, 0, 0, 255])
    expect(up.getPixel(1, 1)).toEqual([255, 0, 0, 255])
    expect(up.getPixel(2, 0)).toEqual([0, 255, 0, 255])
    expect(up.getPixel(3, 3)).toEqual([255, 255, 0, 255])
  })

  it('area downscale of a solid image preserves the color', () => {
    const image = solidImage(30, 20, [120, 60, 200, 255])
    const down = resizeAreaSync(image, 7, 5)
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 7; x++) {
        expect(down.getPixel(x, y)).toEqual([120, 60, 200, 255])
      }
    }
  })

  it('area downscale averages exactly for integer factors', () => {
    const image = new PixelImageData(2, 1)
    image.setPixel(0, 0, [0, 0, 0, 255])
    image.setPixel(1, 0, [255, 255, 255, 255])
    const down = resizeAreaSync(image, 1, 1)
    const [
      r,
      g,
      b,
    ] = down.getPixel(0, 0)
    expect(r).toBeGreaterThanOrEqual(127)
    expect(r).toBeLessThanOrEqual(128)
    expect(g).toBe(r)
    expect(b).toBe(r)
  })

  it('bilinear upscale of a solid image preserves the color', () => {
    const image = solidImage(8, 8, [10, 200, 30, 255])
    const up = resizeBilinearSync(image, 19, 23)
    for (let y = 0; y < 23; y += 5) {
      for (let x = 0; x < 19; x += 4) {
        expect(up.getPixel(x, y)).toEqual([10, 200, 30, 255])
      }
    }
  })

  it('resizeimagesync returns a clone for same dimensions', () => {
    const image = solidImage(5, 5, [1, 2, 3, 255])
    const same = resizeImageSync(image, 5, 5)
    expect(same).not.toBe(image)
    expect([...same.data]).toEqual([...image.data])
  })

  it('resizeimagesync produces requested dimensions', () => {
    const image = solidImage(33, 17, [9, 9, 9, 255])
    expect(resizeImageSync(image, 10, 6).width).toBe(10)
    expect(resizeImageSync(image, 10, 6).height).toBe(6)
    expect(resizeImageSync(image, 66, 34, 'nearest').width).toBe(66)
  })
})
