import { describe, expect, it } from 'vitest'
import { BASE_OPTIONS, getPresetById, PRESETS } from '../src/core/presets'

describe('presets', () => {
  it('has unique ids', () => {
    const ids = PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves a palette for every palette-based preset', () => {
    for (const preset of PRESETS) {
      if (preset.options.usePalette) {
        expect(preset.options.selectedPalette, `preset "${preset.id}" palette`).toBeDefined()
        expect(preset.options.selectedPalette!.colors.length).toBeGreaterThan(0)
      }
    }
  })

  it('only overrides known option keys', () => {
    const knownKeys = new Set(Object.keys(BASE_OPTIONS))
    for (const preset of PRESETS) {
      for (const key of Object.keys(preset.options)) {
        expect(knownKeys.has(key), `preset "${preset.id}" key "${key}"`).toBe(true)
      }
    }
  })

  it('finds presets by id', () => {
    expect(getPresetById('default')?.name).toBe('Classic')
    expect(getPresetById('nope')).toBeUndefined()
  })
})
