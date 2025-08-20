// Test setup for PixelOE.js
// This file is referenced in vitest.config.ts

// Type declarations for global variables
declare global {
  var gc: (() => void) | undefined
}

// Enable performance measurements
if (typeof performance === 'undefined') {
  // Polyfill performance for older Node.js versions
  globalThis.performance = {
    now: () => Date.now(),
  } as Performance
}

// Memory cleanup helper
globalThis.gc = globalThis.gc || (() => {})

// Console formatting for better test output
const originalLog = console.log
console.log = (...args) => {
  const timestamp = new Date().toLocaleTimeString()
  originalLog(`[${timestamp}]`, ...args)
}
