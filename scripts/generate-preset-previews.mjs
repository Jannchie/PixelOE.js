/**
 * Pre-generates preset preview thumbnails for the preset gallery.
 *
 * For each preset in src/core/presets.ts, runs PixelOE in a headless
 * Chromium against a sample image and writes:
 *   - public/presets/<id>.png        (the pixelized preview thumbnail)
 *   - public/samples/<source>.webp   (downscaled source so the app can
 *                                      re-apply the preset live on it)
 *   - src/core/presetPreviews.ts     (manifest: dimensions + source file)
 *
 * Usage: pnpm gen:previews [sample images...]
 * Requires a Chromium binary (ms-playwright cache or system google-chrome).
 */

import { Buffer } from 'node:buffer'
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Source images for preset previews, cycled across presets (sample[i % N]).
// The first 6 line up with the non-palette presets so each shows a distinct
// scene; palette presets reuse them. Local dataset — pass images as CLI args
// to override.
const DATASET = '/mnt/e/aigc/datasets/gpt-image-2'
const DEFAULT_SAMPLES = [
  `${DATASET}/futuristic-megacity-aerial-panorama.png`, // default: wide, dense detail
  `${DATASET}/isekai-crystal-cavern-sanctuary-portrait.png`, // fine: tall, saturated detail
  `${DATASET}/square-snowy-shrine-siblings.png`, // chunky: square, bold shapes
  `${DATASET}/japanese-cinematic-rainy-tokyo-street.png`, // outline: edges, neon vs dark
  `${DATASET}/japanese-cinematic-red-umbrella-closeup.png`, // vivid: strong red/green
  `${DATASET}/summer-rice-fields.png`, // soft: gentle pastoral
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

// --- start vite dev server ---
const PORT = 5197
const vite = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], {
  cwd: projectRoot,
  stdio: 'ignore',
  detached: false,
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

  const presetIds = await page.evaluate(async () => {
    const { PRESETS } = await import('/src/core/presets.ts')
    return PRESETS.map(p => p.id)
  })

  const sampleDataUrls = await Promise.all(samplePaths.map(p => toDataUrl(p)))

  // Export each (deduplicated) source image, downscaled to the same cap used
  // for preview generation, so the web app can load the exact picture behind
  // a preset and re-apply it live. Index-aligned with samplePaths.
  const MAXDIM = 768
  const samplesDir = path.join(projectRoot, 'public/samples')
  await mkdir(samplesDir, { recursive: true })
  const sampleSources = []
  const writtenSources = new Set()
  for (const [k, p] of samplePaths.entries()) {
    const outName = `${path.basename(p).replace(/\.[^.]+$/, '').replaceAll(/[^\w-]/g, '_')}.webp`
    sampleSources[k] = outName
    if (writtenSources.has(outName)) {
      continue
    }
    const scaled = await page.evaluate(async ({ dataUrl, maxDim }) => {
      const img = new Image()
      await new Promise((res, rej) => {
        img.addEventListener('load', res)
        img.addEventListener('error', rej)
        img.src = dataUrl
      })
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (Math.max(w, h) > maxDim) {
        const s = maxDim / Math.max(w, h)
        w = Math.round(w * s)
        h = Math.round(h * s)
      }
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      return c.toDataURL('image/webp', 0.92)
    }, { dataUrl: sampleDataUrls[k], maxDim: MAXDIM })
    await writeFile(path.join(samplesDir, outName), Buffer.from(scaled.split(',')[1], 'base64'))
    writtenSources.add(outName)
    console.log(`source → public/samples/${outName}`)
  }

  const outDir = path.join(projectRoot, 'public/presets')
  await mkdir(outDir, { recursive: true })

  const manifest = []
  for (const [i, id] of presetIds.entries()) {
    const sample = sampleDataUrls[i % sampleDataUrls.length]
    const source = sampleSources[i % sampleSources.length]
    process.stdout.write(`[${i + 1}/${presetIds.length}] ${id} ... `)
    try {
      const result = await page.evaluate(async ({ presetId, dataUrl }) => {
        const { PixelOE } = await import('/src/index.ts')
        const { BASE_OPTIONS, getPresetById } = await import('/src/core/presets.ts')
        const preset = getPresetById(presetId)
        const oe = new PixelOE({ ...BASE_OPTIONS, ...preset.options, noUpscale: true })

        let image = await oe.loadImage(dataUrl)
        // Cap the source size so generation stays fast
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
          const { PixelImageData } = await import('/src/core/imageData.ts')
          image = PixelImageData.fromCanvasImageData(ctx.getImageData(0, 0, dst.width, dst.height))
        }

        const out = oe.pixelize(image).result
        const canvas = document.createElement('canvas')
        canvas.width = out.width
        canvas.height = out.height
        canvas.getContext('2d').putImageData(out.toCanvasImageData(), 0, 0)
        return { dataUrl: canvas.toDataURL('image/png'), width: out.width, height: out.height }
      }, { presetId: id, dataUrl: sample })

      const file = `${id}.png`
      await writeFile(
        path.join(outDir, file),
        Buffer.from(result.dataUrl.split(',')[1], 'base64'),
      )
      manifest.push({ id, file, width: result.width, height: result.height, source })
      console.log(`ok (${result.width}x${result.height})`)
    }
    catch (error) {
      console.log(`FAILED: ${error.message?.split('\n')[0]}`)
    }
  }

  // Flag stale previews / sources that no longer correspond to a preset
  const wanted = new Set(manifest.map(m => m.file))
  for (const f of await readdir(outDir)) {
    if (!wanted.has(f)) {
      console.log(`stale preview (delete manually if unwanted): public/presets/${f}`)
    }
  }
  for (const f of await readdir(samplesDir)) {
    if (!writtenSources.has(f)) {
      console.log(`stale sample (delete manually if unwanted): public/samples/${f}`)
    }
  }

  const manifestSource = `/**
 * Manifest of pre-generated preset preview images living in /public/presets.
 * Regenerate with: pnpm gen:previews (see scripts/generate-preset-previews.mjs)
 */

export interface PresetPreview {
  id: string
  file: string
  width: number
  height: number
  /** Downscaled source image in /public/samples used to generate this preview. */
  source: string
}

export const PRESET_PREVIEWS: PresetPreview[] = [
${manifest.map(m => `  { id: '${m.id}', file: '${m.file}', width: ${m.width}, height: ${m.height}, source: '${m.source}' },`).join('\n')}
]

export function getPresetPreview(id: string): PresetPreview | undefined {
  return PRESET_PREVIEWS.find(p => p.id === id)
}
`
  await writeFile(path.join(projectRoot, 'src/core/presetPreviews.ts'), manifestSource)
  console.log(`\nWrote ${manifest.length} previews + src/core/presetPreviews.ts`)
}
finally {
  await browser?.close()
  vite.kill()
}
