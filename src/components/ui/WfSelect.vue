<script setup lang="ts" generic="T extends { label: string; value: any }">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: any
  options: T[]
  placeholder?: string
  disabled?: boolean
}>(), {
  placeholder: 'Select...',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: any]
}>()

const open = ref(false)
const containerRef = ref<HTMLDivElement>()

const selectedLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt?.label ?? props.placeholder
})

function toggle() {
  if (props.disabled) {
    return
  }
  open.value = !open.value
}

function select(option: T) {
  emit('update:modelValue', option.value)
  open.value = false
}

function onBlur(e: FocusEvent) {
  // Close if focus leaves the container
  if (containerRef.value && !containerRef.value.contains(e.relatedTarget as Node)) {
    open.value = false
  }
}
</script>

<template>
  <div
    ref="containerRef"
    class="wf-select"
    :class="{ open, disabled }"
    tabindex="0"
    @blur="onBlur"
  >
    <button
      type="button"
      class="wf-select__trigger"
      @click="toggle"
    >
      <span class="wf-select__label">{{ selectedLabel }}</span>
      <span class="wf-select__arrow" :class="{ rotated: open }">▾</span>
    </button>
    <div v-if="open" class="wf-select__menu">
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="wf-select__option"
        :class="{ selected: opt.value === modelValue }"
        @click="select(opt)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.wf-select {
  position: relative;
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
}

.wf-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: border-color 0.15s;
  gap: 8px;
}

.wf-select__trigger:hover {
  border-color: var(--color-border-hover);
}

.wf-select.open .wf-select__trigger {
  border-color: var(--color-border-active);
}

.wf-select__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.wf-select__arrow {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--color-text-muted);
  transition: transform 0.15s;
}
.wf-select__arrow.rotated {
  transform: rotate(180deg);
}

.wf-select__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  max-height: 200px;
  overflow-y: auto;
}

.wf-select__option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  transition: all 0.1s;
}

.wf-select__option:last-child {
  border-bottom: none;
}

.wf-select__option:hover {
  color: var(--color-text);
  background: rgba(255,255,255,0.05);
}

.wf-select__option.selected {
  color: var(--color-accent);
}

.wf-select.disabled {
  opacity: 0.35;
  pointer-events: none;
}
</style>
