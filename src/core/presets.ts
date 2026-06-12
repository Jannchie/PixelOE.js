/**
 * Curated parameter presets for one-click pixelization styles
 */

import type { PixelOEOptions } from '../pixeloe'
import { getPaletteByName } from './palettes'

export interface PixelOEPreset {
  id: string
  name: string
  description: string
  options: Partial<PixelOEOptions>
}

/**
 * Baseline options every preset is applied on top of,
 * so switching presets never leaks settings from the previous one.
 */
export const BASE_OPTIONS: PixelOEOptions = {
  pixelSize: 8,
  thickness: 2,
  targetSize: 256,
  mode: 'contrast',
  colorMatching: true,
  contrast: 1,
  saturation: 1,
  noUpscale: false,
  noDownscale: false,
  usePalette: false,
  selectedPalette: undefined,
  ditherMethod: 'none',
  edgeExpansionMode: 'optimized',
  edgeDetectionThreshold: 0.1,
  useEdgeOptimization: true,
  adaptiveProcessing: true,
}

export const PRESETS: PixelOEPreset[] = [
  {
    id: 'default',
    name: 'Classic',
    description: 'Balanced pixelation with subtle outlines',
    options: {},
  },
  {
    id: 'fine',
    name: 'Fine Detail',
    description: 'Small pixels, more detail preserved',
    options: { pixelSize: 4, targetSize: 320, thickness: 1 },
  },
  {
    id: 'chunky',
    name: 'Chunky',
    description: 'Big bold pixels, strong stylization',
    options: { pixelSize: 12, targetSize: 192, thickness: 3 },
  },
  {
    id: 'outline',
    name: 'Bold Outline',
    description: 'Thick dark outlines, comic-like look',
    options: { thickness: 6, contrast: 1.2 },
  },
  {
    id: 'vivid',
    name: 'Vivid',
    description: 'Punchy colors with extra saturation',
    options: { contrast: 1.2, saturation: 1.5 },
  },
  {
    id: 'soft',
    name: 'Soft',
    description: 'Gentle contrast, no outlines',
    options: { thickness: 0, contrast: 0.85, saturation: 0.95 },
  },
  {
    id: 'gameboy',
    name: 'Gameboy',
    description: '4-shade green LCD nostalgia',
    options: {
      usePalette: true,
      colorMatching: false,
      selectedPalette: getPaletteByName('Gameboy'),
      ditherMethod: 'ordered',
      contrast: 1.1,
    },
  },
  {
    id: 'nes',
    name: 'NES',
    description: '8-bit console color palette',
    options: {
      usePalette: true,
      colorMatching: false,
      selectedPalette: getPaletteByName('NES'),
    },
  },
  {
    id: 'pico8',
    name: 'Pico-8',
    description: 'Fantasy console, 16 colors + dither',
    options: {
      usePalette: true,
      colorMatching: false,
      selectedPalette: getPaletteByName('Pico-8'),
      ditherMethod: 'error_diffusion',
    },
  },
  {
    id: 'c64',
    name: 'C64',
    description: 'Commodore 64 retro home computer',
    options: {
      usePalette: true,
      colorMatching: false,
      selectedPalette: getPaletteByName('Commodore 64'),
      ditherMethod: 'ordered',
    },
  },
  {
    id: 'mono',
    name: 'Mono',
    description: '1-bit black & white with dithering',
    options: {
      usePalette: true,
      colorMatching: false,
      selectedPalette: getPaletteByName('Black & White'),
      ditherMethod: 'ordered',
      contrast: 1.3,
    },
  },
  {
    id: 'endesga',
    name: 'Endesga 32',
    description: 'Modern indie pixel-art palette',
    options: {
      usePalette: true,
      colorMatching: false,
      selectedPalette: getPaletteByName('Endesga 32'),
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    description: 'Soft milky tones, low contrast',
    options: {
      usePalette: true,
      colorMatching: false,
      selectedPalette: getPaletteByName('CHOCOMILK-8'),
      contrast: 0.9,
      saturation: 0.9,
    },
  },
  {
    id: 'resurrect',
    name: 'Resurrect 64',
    description: 'Rich 64-color general palette',
    options: {
      usePalette: true,
      colorMatching: false,
      selectedPalette: getPaletteByName('Resurrect 64'),
    },
  },
]

export function getPresetById(id: string): PixelOEPreset | undefined {
  return PRESETS.find(p => p.id === id)
}
