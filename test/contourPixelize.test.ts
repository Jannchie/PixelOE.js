import { describe, expect, it } from 'vitest'
import { contourDownscale } from '../src/core/contourPixelize'
import { contrastDownscale } from '../src/core/downscale'
import { PixelImageData } from '../src/core/imageData'

const BG = 150

function makeGray(size: number, v: number): PixelImageData {
  const img = new PixelImageData(size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  return img
}

function setGray(img: PixelImageData, x: number, y: number, v: number): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) {
    return
  }
  const idx = (y * img.width + x) * 4
  img.data[idx] = v
  img.data[idx + 1] = v
  img.data[idx + 2] = v
}

function lum(img: PixelImageData, x: number, y: number): number {
  const [
    r,
    g,
    b,
  ] = img.getPixel(x, y)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function darkComponents(img: PixelImageData, threshold: number): number {
  const { width: w, height: h } = img
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      mask[y * w + x] = lum(img, x, y) < threshold ? 1 : 0
    }
  }
  let components = 0
  const stack: number[] = []
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1) {
      continue
    }
    components++
    stack.push(i)
    mask[i] = 2
    while (stack.length > 0) {
      const cur = stack.pop()!
      const cx = cur % w
      const cy = (cur - cx) / w
      for (const [
        dx,
        dy,
      ] of [
        [
          -1,
          0,
        ],
        [
          1,
          0,
        ],
        [
          0,
          -1,
        ],
        [
          0,
          1,
        ],
        [
          -1,
          -1,
        ],
        [
          1,
          -1,
        ],
        [
          -1,
          1,
        ],
        [
          1,
          1,
        ],
      ]) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx] === 1) {
          mask[ny * w + nx] = 2
          stack.push(ny * w + nx)
        }
      }
    }
  }
  return components
}

/** Count pixel-art "doubles" (L-corner stair pixels) in the dark mask — jaggy proxy. */
function countDoubles(img: PixelImageData, threshold: number): number {
  const { width: w, height: h } = img
  const at = (x: number, y: number): number =>
    (x >= 0 && y >= 0 && x < w && y < h && lum(img, x, y) < threshold) ? 1 : 0
  let doubles = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) {
        continue
      }
      const n = at(x, y - 1)
      const s = at(x, y + 1)
      const e = at(x + 1, y)
      const wst = at(x - 1, y)
      if (n + s + e + wst !== 2) {
        continue
      }
      if ((n && e && at(x + 1, y - 1)) || (e && s && at(x + 1, y + 1))
        || (s && wst && at(x - 1, y + 1)) || (wst && n && at(x - 1, y - 1))) {
        doubles++
      }
    }
  }
  return doubles
}

describe('contourdownscale', () => {
  it('redraws fading ring + line as crisp connected 1px strokes', () => {
    const img = makeGray(256, BG)
    for (let x = 0; x < 256; x++) {
      const yc = Math.round(64 + 30 * Math.sin(x / 20))
      const v = Math.round(40 + 70 * (0.5 + 0.5 * Math.sin(x / 13)))
      setGray(img, x, yc, v)
      setGray(img, x, yc + 1, v)
    }
    for (let t = 0; t < 4000; t++) {
      const ang = (t / 4000) * Math.PI * 2
      const v = Math.round(40 + 70 * (0.5 + 0.5 * Math.sin(ang * 3)))
      setGray(img, Math.round(128 + 60 * Math.cos(ang)), Math.round(170 + 60 * Math.sin(ang)), v)
      setGray(img, Math.round(128 + 60 * Math.cos(ang)) + 1, Math.round(170 + 60 * Math.sin(ang)), v)
    }

    const t0 = performance.now()
    const contour = contourDownscale(img, 48)
    const t1 = performance.now()
    const greedy = contrastDownscale(img, 48)
    const t2 = performance.now()

    const thr = BG - 25
    const cComp = darkComponents(contour, thr)
    const gComp = darkComponents(greedy, thr)
    const cDoubles = countDoubles(contour, thr)
    const gDoubles = countDoubles(greedy, thr)
    // eslint-disable-next-line no-console
    console.log(`contour: components ${cComp} (8-conn, ideal 2), doubles ${cDoubles}, ${(t1 - t0).toFixed(1)}ms | greedy: components ${gComp}, doubles ${gDoubles}, ${(t2 - t1).toFixed(1)}ms`)

    expect(cComp).toBeLessThanOrEqual(2)
    expect(cDoubles).toBe(0)
  })

  it('keeps flat color flat', () => {
    const img = makeGray(64, 150)
    const out = contourDownscale(img, 16)
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        expect(Math.abs(lum(out, x, y) - 150)).toBeLessThan(4)
      }
    }
  })
})
