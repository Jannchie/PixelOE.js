import { describe, expect, it } from 'vitest'
import { labToRgb, rgbToLab } from '../src/core/colorSpace'
import { labPlanesToRgba, labToRgb255, rgbaToLabLuminance01, rgbaToLabPlanes } from '../src/core/planes'

function randomRgba(n: number, seed = 42): Uint8ClampedArray {
  const data = new Uint8ClampedArray(n * 4)
  let state = seed
  for (let i = 0; i < data.length; i++) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    data[i] = state % 256
  }
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255
  }
  return data
}

describe('planes', () => {
  it('rgbatolabplanes matches scalar rgbtolab', () => {
    const w = 64
    const h = 32
    const data = randomRgba(w * h)
    const planes = rgbaToLabPlanes(data, w, h)

    for (let i = 0; i < w * h; i += 7) {
      const [
        l,
        a,
        b,
      ] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
      expect(planes.l[i]).toBeCloseTo(l, 2)
      expect(planes.a[i]).toBeCloseTo(a, 2)
      expect(planes.b[i]).toBeCloseTo(b, 2)
    }
  })

  it('labplanestorgba round-trips within 1/255 per channel', () => {
    const w = 48
    const h = 48
    const data = randomRgba(w * h, 7)
    const planes = rgbaToLabPlanes(data, w, h)
    const back = labPlanesToRgba(planes)

    for (const [i, datum] of data.entries()) {
      expect(Math.abs(back[i] - datum)).toBeLessThanOrEqual(1)
    }
  })

  it('labtorgb255 matches scalar labtorgb', () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [100, 0, 0],
      [50, 40, -30],
      [75, -20, 60],
      [25, 80, 80],
    ]
    for (const [
      l,
      a,
      b,
    ] of cases) {
      const expected = labToRgb(l, a, b)
      const actual = labToRgb255(l, a, b)
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(actual[c] - expected[c])).toBeLessThanOrEqual(1)
      }
    }
  })

  it('rgbatolabluminance01 matches l/100', () => {
    const w = 16
    const h = 16
    const data = randomRgba(w * h, 3)
    const lum = rgbaToLabLuminance01(data, w, h)
    for (let i = 0; i < w * h; i++) {
      const [l] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
      expect(lum[i]).toBeCloseTo(l / 100, 3)
    }
  })
})
