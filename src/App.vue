<script setup lang="ts">
import PixelOEDemo from './components/PixelOEDemo.vue'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-header__logo">
        <span class="app-header__name">pixeloe.js</span>
        <span class="app-header__sep">//</span>
        <span class="app-header__tag">pixel art generator</span>
      </div>
      <div class="app-header__meta">
        <a
          href="https://github.com/KohakuBlueleaf/PixelOE"
          target="_blank"
          class="app-header__link"
        >
          github
        </a>
      </div>
    </header>
    <main class="app-main">
      <PixelOEDemo />
    </main>
    <footer class="app-footer">
      <span>detail-oriented pixel art · pure browser · no ai</span>
    </footer>
  </div>
</template>

<style>
.app-shell {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--color-bg);
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 24px;
  border-bottom: 1px solid var(--color-border);
}

.app-header__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 12px;
}

.app-header__name {
  color: var(--color-text);
  font-weight: 500;
  letter-spacing: 0.03em;
}

.app-header__sep {
  color: var(--color-text-muted);
}

.app-header__tag {
  color: var(--color-text-muted);
  font-size: 11px;
}

.app-header__meta {
  display: flex;
  gap: 16px;
}

.app-header__link {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color 0.15s;
}
.app-header__link:hover {
  color: var(--color-text);
}

.app-main {
  overflow: hidden;
  min-height: 0;
}

.app-footer {
  padding: 6px 24px;
  border-top: 1px solid var(--color-border);
  text-align: center;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
}

@media (max-width: 767px) {
  .app-header {
    padding: 8px 16px;
  }
  .app-header__tag {
    display: none;
  }
  .app-footer {
    padding: 6px 16px;
    font-size: 9px;
  }
}
</style>
