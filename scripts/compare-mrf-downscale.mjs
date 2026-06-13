/**
 * Real-image A/B comparison: greedy contrast downscale vs MRF downscale,
 * with and without outline expansion. Writes side-by-side variants to
 * tmp/mrf-compare/ for visual inspection.
 *
 * Usage: node scripts/compare-mrf-downscale.mjs [sample images...]
 */

import { Buffer } from 'node:buffer'
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULT_SAMPLES = [
  '../__fern_sousou_no_frieren_generated_by_drowsy_sheep__sample-0f7f4f06a2bac538bc731e8362c79fd2.jpg',
  '../__frieren_sousou_no_frieren_drawn_by_xuhh__fbb7597e7003f9e2a81a25f4593cc893.png',
  '../demo/house-python-test.webp',
]

const VARIANTS = [
  { id: 'oe-greedy', options: { thickness: 3, downscaleMethod: 'contrast' } },
  { id: 'oe-mrf', options: { thickness: 3, downscaleMethod: 'mrf' } },
  { id: 'noe-greedy', options: { thickness: 0, downscaleMethod: 'contrast' } },
  { id: 'noe-mrf', options: { thickness: 0, downscaleMethod: 'mrf' } },
  { id: 'oe-rescue', options: { thickness: 3, downscaleMethod: 'mrf-rescue' } },
  { id: 'noe-rescue', options: { thickness: 0, downscaleMethod: 'mrf-rescue' } },
  { id: 'noe-contour', options: { thickness: 0, downscaleMethod: 'contour' } },
  { id: 'oe-contour', options: { thickness: 3, downscaleMethod: 'contour' } },
]

const sampleArgs = process.argv.slice(2)
const samplePaths = (sampleArgs.length > 0 ? sampleArgs : DEFAULT_SAMPLES)
  .map(p => path.resolve(projectRoot, p))
  .filter((p) => {
    if (!existsSync(p)) {
      console.warn(`sample not found, skipping: ${p}`)
      return false
    }
    return true
  })

if (samplePaths.length === 0) {
  throw new Error('No sample images available.')
}

function findChromium() {
  const cache = path.join(homedir(), '.cache/ms-playwright')
  if (existsSync(cache)) {
    const candidates = execSync(
      String.raw`find ${cache} -maxdepth 3 -type f \( -name chrome -o -name headless_shell \) 2>/dev/null || true`,
      { encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean)
    if (candidates.length > 0) {
      return candidates.toSorted().at(-1)
    }
  }
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(p)) {
      return p
    }
  }
  throw new Error('No Chromium binary found')
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

async function toDataUrl(filePath) {
  const buf = await readFile(filePath)
  const mime = MIME[path.extname(filePath).toLowerCase()] ?? 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
}

const PORT = 5198
const vite = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], {
  cwd: projectRoot,
  stdio: 'ignore',
})

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`)
      if (res.ok) {
        return
      }
    }
    catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('vite dev server did not start')
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox', '--use-gl=swiftshader'],
  })
  const page = await browser.newPage()
  page.on('pageerror', e => console.error('  pageerror:', e.message))
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })

  const outDir = path.join(projectRoot, 'tmp/mrf-compare')
  await mkdir(outDir, { recursive: true })

  for (const samplePath of samplePaths) {
    const name = path.basename(samplePath).slice(0, 24).replaceAll(/[^\w-]/g, '_')
    const dataUrl = await toDataUrl(samplePath)
    for (const variant of VARIANTS) {
      process.stdout.write(`${name} / ${variant.id} ... `)
      const result = await page.evaluate(async ({ dataUrl, options }) => {
        const { PixelOE } = await import('/src/index.ts')
        const { PixelImageData } = await import('/src/core/imageData.ts')
        const oe = new PixelOE({
          pixelSize: 4,
          targetSize: 160,
          colorMatching: true,
          contrast: 1,
          saturation: 1,
          ...options,
        })

        let image = await oe.loadImage(dataUrl)
        const maxDim = 768
        if (Math.max(image.width, image.height) > maxDim) {
          const scale = maxDim / Math.max(image.width, image.height)
          const src = document.createElement('canvas')
          src.width = image.width
          src.height = image.height
          src.getContext('2d').putImageData(image.toCanvasImageData(), 0, 0)
          const dst = document.createElement('canvas')
          dst.width = Math.round(image.width * scale)
          dst.height = Math.round(image.height * scale)
          const ctx = dst.getContext('2d')
          ctx.drawImage(src, 0, 0, dst.width, dst.height)
          image = PixelImageData.fromCanvasImageData(ctx.getImageData(0, 0, dst.width, dst.height))
        }

        const t0 = performance.now()
        const out = oe.pixelize(image).result
        const ms = performance.now() - t0
        const canvas = document.createElement('canvas')
        canvas.width = out.width
        canvas.height = out.height
        canvas.getContext('2d').putImageData(out.toCanvasImageData(), 0, 0)
        return { dataUrl: canvas.toDataURL('image/png'), width: out.width, height: out.height, ms }
      }, { dataUrl, options: variant.options })

      await writeFile(
        path.join(outDir, `${name}--${variant.id}.png`),
        Buffer.from(result.dataUrl.split(',')[1], 'base64'),
      )
      console.log(`ok ${result.width}x${result.height} (${result.ms.toFixed(0)}ms)`)
    }
  }
  console.log(`\nWrote variants to tmp/mrf-compare/`)
}
finally {
  await browser?.close()
  vite.kill()
}
