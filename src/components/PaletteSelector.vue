<script setup lang="ts">
import { PREDEFINED_PALETTES, rgbToHex, type ColorPalette } from '../core/palettes'
import Button from 'primevue/button'
import Dropdown from 'primevue/dropdown'
import InputSwitch from 'primevue/inputswitch'
import { computed } from 'vue'

interface Props {
  selectedPalette?: ColorPalette | null | undefined
  usePalette?: boolean
  ditherMethod?: 'none' | 'ordered' | 'error_diffusion'
}

interface Emits {
  (e: 'update:selectedPalette', palette: ColorPalette | null | undefined): void
  (e: 'update:usePalette', value: boolean): void
  (e: 'update:ditherMethod', method: 'none' | 'ordered' | 'error_diffusion'): void
}

const props = withDefaults(defineProps<Props>(), {
  selectedPalette: undefined,
  usePalette: false,
  ditherMethod: 'none'
})

const emit = defineEmits<Emits>()

// Computed properties for two-way binding
const selectedPalette = computed({
  get: () => props.selectedPalette,
  set: (value) => emit('update:selectedPalette', value)
})

const usePalette = computed({
  get: () => props.usePalette,
  set: (value) => emit('update:usePalette', value)
})

const ditherMethod = computed({
  get: () => props.ditherMethod,
  set: (value) => emit('update:ditherMethod', value)
})

// Available palettes for dropdown
const paletteOptions = PREDEFINED_PALETTES.map(palette => ({
  label: `${palette.name} (${palette.colors.length} colors)`,
  value: palette
}))

// Dithering options
const ditherOptions = [
  { label: 'None', value: 'none' },
  { label: 'Ordered Dithering', value: 'ordered' },
  { label: 'Error Diffusion', value: 'error_diffusion' }
]

// Preview colors for current palette (max 16 colors for display)
const previewColors = computed(() => {
  if (!selectedPalette.value) return []
  
  const colors = selectedPalette.value.colors.slice(0, 16)
  return colors.map(color => rgbToHex(color[0], color[1], color[2]))
})
</script>

<template>
  <div class="space-y-4">
    <!-- Enable Palette Toggle -->
    <div class="flex items-center justify-between">
      <div>
        <label class="block text-sm text-gray-700 font-medium">Use Color Palette</label>
        <p class="mt-1 text-xs text-gray-500">
          Constrain colors to a predefined palette
        </p>
      </div>
      <InputSwitch
        v-model="usePalette"
      />
    </div>

    <!-- Palette Selection (only show when enabled) -->
    <div v-if="usePalette" class="space-y-4">
      <!-- Palette Dropdown -->
      <div>
        <label class="mb-2 block text-sm text-gray-700 font-medium">Palette</label>
        <Dropdown
          v-model="selectedPalette"
          :options="paletteOptions"
          option-label="label"
          option-value="value"
          placeholder="Select a palette"
          class="w-full"
        />
      </div>

      <!-- Palette Preview -->
      <div v-if="selectedPalette" class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm text-gray-700 font-medium">Preview</label>
          <span class="text-xs text-gray-500">
            {{ selectedPalette.colors.length }} colors total
          </span>
        </div>
        <div class="flex flex-wrap gap-1 p-2 border border-gray-200 bg-gray-50">
          <div
            v-for="(color, index) in previewColors"
            :key="index"
            class="h-6 w-6 border border-gray-300 shadow-sm"
            :style="{ backgroundColor: color }"
            :title="color"
          />
          <div
            v-if="selectedPalette.colors.length > 16"
            class="flex h-6 items-center px-2 text-xs text-gray-500 bg-gray-100 border border-gray-300"
          >
            +{{ selectedPalette.colors.length - 16 }}
          </div>
        </div>
        <p class="text-xs text-gray-500">
          {{ selectedPalette.description }}
        </p>
      </div>

      <!-- Dithering Method (only show when palette is selected) -->
      <div v-if="selectedPalette">
        <label class="mb-2 block text-sm text-gray-700 font-medium">Dithering</label>
        <div class="grid grid-cols-3 gap-2">
          <Button
            v-for="option in ditherOptions"
            :key="option.value"
            :label="option.label"
            :class="[
              'text-xs',
              ditherMethod === option.value
                ? 'p-button-primary'
                : 'p-button-outlined'
            ]"
            size="small"
            @click="ditherMethod = option.value as typeof ditherMethod"
          />
        </div>
        <p class="mt-2 text-xs text-gray-500">
          Dithering helps create smooth gradients with limited colors
        </p>
      </div>
    </div>
  </div>
</template>