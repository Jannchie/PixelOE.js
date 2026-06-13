/**
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
  { id: 'default', file: 'default.png', width: 391, height: 167, source: 'futuristic-megacity-aerial-panorama.webp' },
  { id: 'fine', file: 'fine.png', width: 240, height: 426, source: 'isekai-crystal-cavern-sanctuary-portrait.webp' },
  { id: 'chunky', file: 'chunky.png', width: 192, height: 192, source: 'square-snowy-shrine-siblings.webp' },
  { id: 'outline', file: 'outline.png', width: 341, height: 192, source: 'japanese-cinematic-rainy-tokyo-street.webp' },
  { id: 'vivid', file: 'vivid.png', width: 256, height: 256, source: 'japanese-cinematic-red-umbrella-closeup.webp' },
  { id: 'soft', file: 'soft.png', width: 341, height: 192, source: 'summer-rice-fields.webp' },
  { id: 'gameboy', file: 'gameboy.png', width: 391, height: 167, source: 'futuristic-megacity-aerial-panorama.webp' },
  { id: 'nes', file: 'nes.png', width: 192, height: 341, source: 'isekai-crystal-cavern-sanctuary-portrait.webp' },
  { id: 'pico8', file: 'pico8.png', width: 256, height: 256, source: 'square-snowy-shrine-siblings.webp' },
  { id: 'c64', file: 'c64.png', width: 341, height: 192, source: 'japanese-cinematic-rainy-tokyo-street.webp' },
  { id: 'mono', file: 'mono.png', width: 256, height: 256, source: 'japanese-cinematic-red-umbrella-closeup.webp' },
  { id: 'endesga', file: 'endesga.png', width: 341, height: 192, source: 'summer-rice-fields.webp' },
  { id: 'pastel', file: 'pastel.png', width: 391, height: 167, source: 'futuristic-megacity-aerial-panorama.webp' },
  { id: 'resurrect', file: 'resurrect.png', width: 192, height: 341, source: 'isekai-crystal-cavern-sanctuary-portrait.webp' },
]

export function getPresetPreview(id: string): PresetPreview | undefined {
  return PRESET_PREVIEWS.find(p => p.id === id)
}
