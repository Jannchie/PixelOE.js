<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean
  disabled?: boolean
  label?: string
  description?: string
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function toggle() {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <label class="wf-switch" :class="{ disabled }">
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      class="wf-switch__track"
      :class="{ active: modelValue }"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="wf-switch__thumb" />
    </button>
    <span v-if="label" class="wf-switch__text">
      <span class="wf-switch__label">{{ label }}</span>
      <span v-if="description" class="wf-switch__desc">{{ description }}</span>
    </span>
  </label>
</template>

<style scoped>
.wf-switch {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.wf-switch.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.wf-switch__track {
  flex-shrink: 0;
  width: 32px;
  height: 18px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: transparent;
  position: relative;
  cursor: pointer;
  padding: 0;
  margin-top: 1px;
  transition: border-color 0.15s, background 0.15s;
}

.wf-switch__track:hover {
  border-color: var(--color-border-hover);
}

.wf-switch__track.active {
  border-color: var(--color-accent);
  background: var(--color-accent);
}

.wf-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  background: var(--color-text);
  border-radius: 50%;
  transition: transform 0.15s;
}

.wf-switch__track.active .wf-switch__thumb {
  transform: translateX(14px);
  background: var(--color-bg);
}

.wf-switch__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wf-switch__label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text);
}

.wf-switch__desc {
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
