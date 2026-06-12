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
  { id: 'default', file: 'default.png', width: 313, height: 209 },
  { id: 'fine', file: 'fine.png', width: 246, height: 414 },
  { id: 'chunky', file: 'chunky.png', width: 192, height: 192 },
  { id: 'outline', file: 'outline.png', width: 313, height: 209 },
  { id: 'vivid', file: 'vivid.png', width: 197, height: 331 },
  { id: 'soft', file: 'soft.png', width: 256, height: 256 },
  { id: 'gameboy', file: 'gameboy.png', width: 313, height: 209 },
  { id: 'nes', file: 'nes.png', width: 197, height: 331 },
  { id: 'pico8', file: 'pico8.png', width: 256, height: 256 },
  { id: 'c64', file: 'c64.png', width: 313, height: 209 },
  { id: 'mono', file: 'mono.png', width: 197, height: 331 },
  { id: 'endesga', file: 'endesga.png', width: 256, height: 256 },
  { id: 'pastel', file: 'pastel.png', width: 313, height: 209 },
  { id: 'resurrect', file: 'resurrect.png', width: 197, height: 331 },
]

export function getPresetPreview(id: string): PresetPreview | undefined {
  return PRESET_PREVIEWS.find(p => p.id === id)
}
