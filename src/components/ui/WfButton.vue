<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
  loading?: boolean
}>(), {
  variant: 'secondary',
  size: 'md',
  disabled: false,
  loading: false,
})

const emit = defineEmits<{
  click: [e: MouseEvent]
}>()
</script>

<template>
  <button
    class="wf-btn"
    :class="[`wf-btn--${variant}`, `wf-btn--${size}`]"
    :disabled="disabled || loading"
    @click="emit('click', $event)"
  >
    <span v-if="loading" class="wf-spinner" />
    <span :class="{ 'opacity-0': loading }">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.wf-btn {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  position: relative;
  white-space: nowrap;
  user-select: none;
  background: transparent;
  outline: none;
  border-radius: var(--radius-full);
}

.wf-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Sizes */
.wf-btn--sm {
  height: 28px;
  padding: 0 12px;
  font-size: 11px;
}
.wf-btn--md {
  height: 36px;
  padding: 0 20px;
}

/* Variants */
.wf-btn--primary {
  color: var(--color-bg);
  background: var(--color-accent);
  border: 1px solid var(--color-accent);
}
.wf-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

.wf-btn--secondary {
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.wf-btn--secondary:hover:not(:disabled) {
  border-color: var(--color-border-hover);
  color: var(--color-text);
}

.wf-btn--ghost {
  color: var(--color-text-muted);
  border: 1px solid transparent;
}
.wf-btn--ghost:hover:not(:disabled) {
  color: var(--color-text);
  border-color: var(--color-border);
}

/* Spinner */
.wf-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: wf-spin 0.6s linear infinite;
  position: absolute;
}

@keyframes wf-spin {
  to { transform: rotate(360deg); }
}
</style>
