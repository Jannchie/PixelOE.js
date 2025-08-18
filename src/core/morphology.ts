import { PixelImageData } from './imageData';

/**
 * Morphological operations for image processing
 */

/**
 * Create a circular kernel for morphological operations
 */
export function createCircularKernel(radius: number): number[][] {
  const size = Math.floor(radius) * 2 + 1;
  const center = Math.floor(size / 2);
  const kernel: number[][] = [];

  for (let y = 0; y < size; y++) {
    kernel[y] = [];
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Create anti-aliased circular kernel
      if (distance <= radius - 0.5) {
        kernel[y][x] = 1;
      } else if (distance <= radius + 0.5) {
        kernel[y][x] = radius + 0.5 - distance;
      } else {
        kernel[y][x] = 0;
      }
    }
  }

  return kernel;
}

/**
 * Dilate operation - expands bright regions
 */
export function dilate(imageData: PixelImageData, kernelSize: number = 3): PixelImageData {
  const result = new PixelImageData(imageData.width, imageData.height);
  const kernel = createCircularKernel(kernelSize / 2);
  const kernelHalf = Math.floor(kernel.length / 2);

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      let maxR = 0, maxG = 0, maxB = 0;
      let maxA = 0;

      // Apply kernel
      for (let ky = 0; ky < kernel.length; ky++) {
        for (let kx = 0; kx < kernel[ky].length; kx++) {
          const weight = kernel[ky][kx];
          if (weight <= 0) continue;

          const px = Math.min(Math.max(x + kx - kernelHalf, 0), imageData.width - 1);
          const py = Math.min(Math.max(y + ky - kernelHalf, 0), imageData.height - 1);
          
          const [r, g, b, a] = imageData.getPixel(px, py);
          
          // Apply kernel weight and find maximum
          const weightedR = r * weight;
          const weightedG = g * weight;
          const weightedB = b * weight;
          const weightedA = a * weight;

          if (weightedR > maxR) maxR = weightedR;
          if (weightedG > maxG) maxG = weightedG;
          if (weightedB > maxB) maxB = weightedB;
          if (weightedA > maxA) maxA = weightedA;
        }
      }

      result.setPixel(x, y, [
        Math.min(255, Math.round(maxR)),
        Math.min(255, Math.round(maxG)),
        Math.min(255, Math.round(maxB)),
        Math.min(255, Math.round(maxA))
      ]);
    }
  }

  return result;
}

/**
 * Erode operation - shrinks bright regions
 */
export function erode(imageData: PixelImageData, kernelSize: number = 3): PixelImageData {
  const result = new PixelImageData(imageData.width, imageData.height);
  const kernel = createCircularKernel(kernelSize / 2);
  const kernelHalf = Math.floor(kernel.length / 2);

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      let minR = 255, minG = 255, minB = 255;
      let minA = 255;

      // Apply kernel
      for (let ky = 0; ky < kernel.length; ky++) {
        for (let kx = 0; kx < kernel[ky].length; kx++) {
          const weight = kernel[ky][kx];
          if (weight <= 0) continue;

          const px = Math.min(Math.max(x + kx - kernelHalf, 0), imageData.width - 1);
          const py = Math.min(Math.max(y + ky - kernelHalf, 0), imageData.height - 1);
          
          const [r, g, b, a] = imageData.getPixel(px, py);
          
          // Apply inverse kernel weight and find minimum
          const weightedR = r - (255 - r) * (weight - 1);
          const weightedG = g - (255 - g) * (weight - 1);
          const weightedB = b - (255 - b) * (weight - 1);
          const weightedA = a - (255 - a) * (weight - 1);

          if (weightedR < minR) minR = weightedR;
          if (weightedG < minG) minG = weightedG;
          if (weightedB < minB) minB = weightedB;
          if (weightedA < minA) minA = weightedA;
        }
      }

      result.setPixel(x, y, [
        Math.max(0, Math.round(minR)),
        Math.max(0, Math.round(minG)),
        Math.max(0, Math.round(minB)),
        Math.max(0, Math.round(minA))
      ]);
    }
  }

  return result;
}

/**
 * Morphological opening (erode then dilate)
 */
export function opening(imageData: PixelImageData, kernelSize: number = 3): PixelImageData {
  const eroded = erode(imageData, kernelSize);
  return dilate(eroded, kernelSize);
}

/**
 * Morphological closing (dilate then erode)
 */
export function closing(imageData: PixelImageData, kernelSize: number = 3): PixelImageData {
  const dilated = dilate(imageData, kernelSize);
  return erode(dilated, kernelSize);
}