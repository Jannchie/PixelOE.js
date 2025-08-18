import { PixelImageData } from './imageData';
import { clamp } from '../utils/math';

/**
 * High-quality image resampling algorithms
 */

/**
 * Lanczos kernel function
 * a: kernel size parameter (typically 2 or 3)
 * x: distance from sample point
 */
function lanczosKernel(x: number, a: number = 3): number {
  if (x === 0) return 1;
  if (Math.abs(x) >= a) return 0;
  
  const pix = Math.PI * x;
  return (a * Math.sin(pix) * Math.sin(pix / a)) / (pix * pix);
}

/**
 * Sinc function for Lanczos kernel
 */
// function sinc(x: number): number {
//   if (x === 0) return 1;
//   const pix = Math.PI * x;
//   return Math.sin(pix) / pix;
// }

/**
 * Alternative Lanczos kernel implementation
 */
// function lanczosKernelAlt(x: number, a: number = 3): number {
//   if (Math.abs(x) >= a) return 0;
//   if (x === 0) return 1;
//   
//   return a * sinc(x) * sinc(x / a);
// }

/**
 * Compute Lanczos weights for resampling
 */
function computeLanczosWeights(
  sourceSize: number,
  targetSize: number,
  kernelSize: number = 3
): { weights: number[][]; indices: number[][] } {
  const scale = sourceSize / targetSize;
  const weights: number[][] = [];
  const indices: number[][] = [];
  
  for (let i = 0; i < targetSize; i++) {
    const center = (i + 0.5) * scale - 0.5;
    const start = Math.floor(center - kernelSize);
    const end = Math.floor(center + kernelSize);
    
    const weightRow: number[] = [];
    const indexRow: number[] = [];
    let weightSum = 0;
    
    for (let j = start; j <= end; j++) {
      const distance = j - center;
      const weight = lanczosKernel(distance, kernelSize);
      
      if (weight !== 0) {
        // Clamp source index to valid range
        const sourceIndex = clamp(j, 0, sourceSize - 1);
        weightRow.push(weight);
        indexRow.push(sourceIndex);
        weightSum += weight;
      }
    }
    
    // Normalize weights
    if (weightSum > 0) {
      for (let k = 0; k < weightRow.length; k++) {
        weightRow[k] /= weightSum;
      }
    }
    
    weights.push(weightRow);
    indices.push(indexRow);
  }
  
  return { weights, indices };
}

/**
 * Lanczos horizontal resampling
 */
function lanczosResampleHorizontal(
  imageData: PixelImageData,
  newWidth: number,
  kernelSize: number = 3
): PixelImageData {
  const { weights, indices } = computeLanczosWeights(
    imageData.width, 
    newWidth, 
    kernelSize
  );
  
  const result = new PixelImageData(newWidth, imageData.height);
  
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < newWidth; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      const weightRow = weights[x];
      const indexRow = indices[x];
      
      for (let i = 0; i < weightRow.length; i++) {
        const weight = weightRow[i];
        const sourceX = indexRow[i];
        
        const [sr, sg, sb, sa] = imageData.getPixel(sourceX, y);
        
        r += sr * weight;
        g += sg * weight;
        b += sb * weight;
        a += sa * weight;
      }
      
      result.setPixel(x, y, [
        clamp(Math.round(r), 0, 255),
        clamp(Math.round(g), 0, 255),
        clamp(Math.round(b), 0, 255),
        clamp(Math.round(a), 0, 255)
      ]);
    }
  }
  
  return result;
}

/**
 * Lanczos vertical resampling
 */
function lanczosResampleVertical(
  imageData: PixelImageData,
  newHeight: number,
  kernelSize: number = 3
): PixelImageData {
  const { weights, indices } = computeLanczosWeights(
    imageData.height, 
    newHeight, 
    kernelSize
  );
  
  const result = new PixelImageData(imageData.width, newHeight);
  
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < imageData.width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      const weightRow = weights[y];
      const indexRow = indices[y];
      
      for (let i = 0; i < weightRow.length; i++) {
        const weight = weightRow[i];
        const sourceY = indexRow[i];
        
        const [sr, sg, sb, sa] = imageData.getPixel(x, sourceY);
        
        r += sr * weight;
        g += sg * weight;
        b += sb * weight;
        a += sa * weight;
      }
      
      result.setPixel(x, y, [
        clamp(Math.round(r), 0, 255),
        clamp(Math.round(g), 0, 255),
        clamp(Math.round(b), 0, 255),
        clamp(Math.round(a), 0, 255)
      ]);
    }
  }
  
  return result;
}

/**
 * Lanczos resampling (resize) - high quality image scaling
 * Based on Lanczos downscale from Python version
 */
export function lanczosResize(
  imageData: PixelImageData,
  newWidth: number,
  newHeight: number,
  kernelSize: number = 3
): PixelImageData {
  // First resample horizontally, then vertically for better quality
  let result = imageData;
  
  // Horizontal resampling
  if (newWidth !== imageData.width) {
    result = lanczosResampleHorizontal(result, newWidth, kernelSize);
  }
  
  // Vertical resampling
  if (newHeight !== imageData.height) {
    result = lanczosResampleVertical(result, newHeight, kernelSize);
  }
  
  return result;
}

/**
 * Lanczos downscaling optimized for pixel art
 * Maintains sharpness while reducing aliasing
 */
export function lanczosDownscale(
  imageData: PixelImageData,
  scale: number,
  kernelSize: number = 2
): PixelImageData {
  const newWidth = Math.floor(imageData.width * scale);
  const newHeight = Math.floor(imageData.height * scale);
  
  return lanczosResize(imageData, newWidth, newHeight, kernelSize);
}

/**
 * Lanczos upscaling
 */
export function lanczosUpscale(
  imageData: PixelImageData,
  scale: number,
  kernelSize: number = 3
): PixelImageData {
  const newWidth = Math.floor(imageData.width * scale);
  const newHeight = Math.floor(imageData.height * scale);
  
  return lanczosResize(imageData, newWidth, newHeight, kernelSize);
}

/**
 * Bicubic interpolation kernel
 */
function bicubicKernel(x: number): number {
  const a = -0.5; // Mitchell parameter
  const absX = Math.abs(x);
  
  if (absX <= 1) {
    return (a + 2) * absX * absX * absX - (a + 3) * absX * absX + 1;
  } else if (absX < 2) {
    return a * absX * absX * absX - 5 * a * absX * absX + 8 * a * absX - 4 * a;
  } else {
    return 0;
  }
}

/**
 * Bicubic resampling (alternative to Lanczos)
 */
export function bicubicResize(
  imageData: PixelImageData,
  newWidth: number,
  newHeight: number
): PixelImageData {
  const result = new PixelImageData(newWidth, newHeight);
  const scaleX = imageData.width / newWidth;
  const scaleY = imageData.height / newHeight;
  
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const sourceX = x * scaleX;
      const sourceY = y * scaleY;
      
      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      
      let r = 0, g = 0, b = 0, a = 0;
      let weightSum = 0;
      
      // Sample 4x4 neighborhood
      for (let dy = -1; dy <= 2; dy++) {
        for (let dx = -1; dx <= 2; dx++) {
          const sampleX = clamp(x0 + dx, 0, imageData.width - 1);
          const sampleY = clamp(y0 + dy, 0, imageData.height - 1);
          
          const weightX = bicubicKernel(sourceX - (x0 + dx));
          const weightY = bicubicKernel(sourceY - (y0 + dy));
          const weight = weightX * weightY;
          
          const [sr, sg, sb, sa] = imageData.getPixel(sampleX, sampleY);
          
          r += sr * weight;
          g += sg * weight;
          b += sb * weight;
          a += sa * weight;
          weightSum += weight;
        }
      }
      
      if (weightSum > 0) {
        r /= weightSum;
        g /= weightSum;
        b /= weightSum;
        a /= weightSum;
      }
      
      result.setPixel(x, y, [
        clamp(Math.round(r), 0, 255),
        clamp(Math.round(g), 0, 255),
        clamp(Math.round(b), 0, 255),
        clamp(Math.round(a), 0, 255)
      ]);
    }
  }
  
  return result;
}

/**
 * High-quality resize with automatic method selection
 */
export function highQualityResize(
  imageData: PixelImageData,
  newWidth: number,
  newHeight: number,
  method: 'lanczos' | 'bicubic' | 'auto' = 'auto'
): PixelImageData {
  if (method === 'bicubic') {
    return bicubicResize(imageData, newWidth, newHeight);
  } else if (method === 'lanczos') {
    return lanczosResize(imageData, newWidth, newHeight, 3);
  } else {
    // Auto selection
    const scaleX = newWidth / imageData.width;
    const scaleY = newHeight / imageData.height;
    const scale = Math.min(scaleX, scaleY);
    
    if (scale < 0.5) {
      // Large downscaling - use Lanczos with smaller kernel
      return lanczosResize(imageData, newWidth, newHeight, 2);
    } else {
      // Upscaling or moderate downscaling - use Lanczos with larger kernel
      return lanczosResize(imageData, newWidth, newHeight, 3);
    }
  }
}