import { describe, expect, it } from 'vitest'
import { quantize01ToU8, slidingMax, slidingMedianU8, slidingMin } from '../src/core/slidingStats'

function lcg(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 0x1_00_00_00_00
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : (Math.min(v, hi))
}

function bruteForceWindow(
  src: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): number[] {
  const values: number[] = []
  for (let wy = -radius; wy <= radius; wy++) {
    for (let wx = -radius; wx <= radius; wx++) {
      const sx = clamp(x + wx, 0, width - 1)
      const sy = clamp(y + wy, 0, height - 1)
      values.push(src[sy * width + sx])
    }
  }
  return values
}

describe('slidingstats', () => {
  const width = 37
  const height = 23
  const rand = lcg(123)
  const field = new Float32Array(width * height)
  for (let i = 0; i < field.length; i++) {
    field[i] = rand()
  }

  for (const radius of [1, 3, 6]) {
    it(`slidingMin/slidingMax match brute force (radius=${radius})`, () => {
      const min = slidingMin(field, width, height, radius)
      const max = slidingMax(field, width, height, radius)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const win = bruteForceWindow(field, width, height, x, y, radius)
          expect(min[y * width + x]).toBeCloseTo(Math.min(...win), 6)
          expect(max[y * width + x]).toBeCloseTo(Math.max(...win), 6)
        }
      }
    })

    it(`slidingMedianU8 matches brute force (radius=${radius})`, () => {
      const u8 = quantize01ToU8(field)
      const median = slidingMedianU8(u8, width, height, radius)

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const win = bruteForceWindow(u8, width, height, x, y, radius).toSorted((a, b) => a - b)
          const expected = win[win.length >> 1]
          expect(median[y * width + x]).toBe(expected)
        }
      }
    })
  }

  it('radius=0 returns a copy', () => {
    const min = slidingMin(field, width, height, 0)
    expect([...min]).toEqual([...field])
  })

  it('quantize01tou8 rounds and clamps', () => {
    const out = quantize01ToU8(new Float32Array([-0.5, 0, 0.5, 1, 2]))
    expect([...out]).toEqual([0, 0, 128, 255, 255])
  })
})
