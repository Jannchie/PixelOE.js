// Main exports
export { PixelOE } from './pixeloe';
export type { PixelOEOptions, PixelOEResult } from './pixeloe';

// Core exports
export { PixelImageData } from './core/imageData';
export * from './core/colorSpace';
export * from './core/morphology';
export * from './core/outline';
export * from './core/downscale';
export * from './core/color';

// New Python-ported features
export * from './core/quantization';
export * from './core/dithering';
export * from './core/sharpen';
export * from './core/imageResize';

// Utilities
export * from './utils/math';