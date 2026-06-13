/**
 * Manifest of pre-generated preset preview images living in /public/presets.
 * Regenerate with: pnpm gen:previews (see scripts/generate-preset-previews.mjs)
 */

export interface PresetPreview {
  id: string
  file: string
  width: number
  height: number
}

export const PRESET_PREVIEWS: PresetPreview[] = [
  { id: 'default', file: 'default.png', width: 391, height: 167 },
  { id: 'fine', file: 'fine.png', width: 240, height: 426 },
  { id: 'chunky', file: 'chunky.png', width: 192, height: 192 },
  { id: 'outline', file: 'outline.png', width: 341, height: 192 },
  { id: 'vivid', file: 'vivid.png', width: 256, height: 256 },
  { id: 'soft', file: 'soft.png', width: 341, height: 192 },
  { id: 'gameboy', file: 'gameboy.png', width: 391, height: 167 },
  { id: 'nes', file: 'nes.png', width: 192, height: 341 },
  { id: 'pico8', file: 'pico8.png', width: 256, height: 256 },
  { id: 'c64', file: 'c64.png', width: 341, height: 192 },
  { id: 'mono', file: 'mono.png', width: 256, height: 256 },
  { id: 'endesga', file: 'endesga.png', width: 341, height: 192 },
  { id: 'pastel', file: 'pastel.png', width: 391, height: 167 },
  { id: 'resurrect', file: 'resurrect.png', width: 192, height: 341 },
]

export function getPresetPreview(id: string): PresetPreview | undefined {
  return PRESET_PREVIEWS.find(p => p.id === id)
}
