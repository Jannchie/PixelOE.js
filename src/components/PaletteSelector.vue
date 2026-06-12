<script setup lang="ts">
import type { ColorPalette } from '../core/palettes'
import { computed, toRaw } from 'vue'
import { PREDEFINED_PALETTES, rgbToHex } from '../core/palettes'
import WfChip from './ui/WfChip.vue'
import WfSelect from './ui/WfSelect.vue'
import WfSwitch from './ui/WfSwitch.vue'

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
  ditherMethod: 'none',
})

const emit = defineEmits<Emits>()

const paletteOptions = PREDEFINED_PALETTES.map(p => ({
  label: `${p.name} [${p.colors.length}]`,
  value: p,
}))

const previewColors = computed(() => {
  if (!props.selectedPalette) {
    return []
  }
  return props.selectedPalette.colors.slice(0, 20).map(c => rgbToHex(c[0], c[1], c[2]))
})
</script>

<template>
  <div class="palette">
    <WfSwitch
      :model-value="usePalette"
      label="Use Color Palette"
      description="Constrain colors to a predefined palette"
      @update:model-value="emit('update:usePalette', $event)"
    />

    <template v-if="usePalette">
      <div class="palette__select">
        <span class="palette__label">Palette</span>
        <WfSelect
          :model-value="selectedPalette ? toRaw(selectedPalette) : selectedPalette"
          :options="paletteOptions"
          placeholder="Select a palette..."
          @update:model-value="emit('update:selectedPalette', $event)"
        />
      </div>

      <div v-if="selectedPalette" class="palette__preview">
        <div class="palette__preview-header">
          <span>{{ selectedPalette.colors.length }} colors</span>
        </div>
        <div class="palette__swatches">
          <span
            v-for="(color, i) in previewColors"
            :key="i"
            class="palette__swatch"
            :style="{ background: color }"
            :title="color"
          />
          <span
            v-if="selectedPalette.colors.length > 20"
            class="palette__overflow"
          >
            +{{ selectedPalette.colors.length - 20 }}
          </span>
        </div>
        <p v-if="selectedPalette.description" class="palette__desc">
          {{ selectedPalette.description }}
        </p>
      </div>

      <div v-if="selectedPalette" class="palette__dither">
        <span class="palette__label">Dithering</span>
        <div class="palette__chips">
          <WfChip
            :active="ditherMethod === 'none'"
            @click="emit('update:ditherMethod', 'none')"
          >
            none
          </WfChip>
          <WfChip
            :active="ditherMethod === 'ordered'"
            @click="emit('update:ditherMethod', 'ordered')"
          >
            ordered
          </WfChip>
          <WfChip
            :active="ditherMethod === 'error_diffusion'"
            @click="emit('update:ditherMethod', 'error_diffusion')"
          >
            diffusion
          </WfChip>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.palette {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.palette__select {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.palette__label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.palette__preview {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.palette__preview-header {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
}

.palette__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.palette__swatch {
  width: 18px;
  height: 18px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  flex-shrink: 0;
}

.palette__overflow {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  height: 18px;
  padding: 0 4px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
}

.palette__desc {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.palette__dither {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.palette__chips {
  display: flex;
  gap: 6px;
}
</style>
