import { PixelImageData } from './imageData';

/**
 * Morphological operations for image processing
 */

/**
 * Create expansion kernel (3x3 all ones - matching Python kernel_expansion)
 */
export function createExpansionKernel(): number[][] {
  return [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1]
  ];
}

/**
 * Create smoothing kernel (cross shape - matching Python kernel_smoothing)
 */
export function createSmoothingKernel(): number[][] {
  return [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0]
  ];
}

/**
 * Create a circular kernel for morphological operations (kept for backward compatibility)
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
 * Generic morphological operation with specified kernel
 */
function applyMorphologicalOperation(
  imageData: PixelImageData, 
  kernel: number[][], 
  operation: 'dilate' | 'erode',
  iterations: number = 1
): PixelImageData {
  let result = imageData;
  
  for (let iter = 0; iter < iterations; iter++) {
    const temp = new PixelImageData(result.width, result.height);
    const kernelHalf = Math.floor(kernel.length / 2);

    for (let y = 0; y < result.height; y++) {
      for (let x = 0; x < result.width; x++) {
        let extremeR = operation === 'dilate' ? 0 : 255;
        let extremeG = operation === 'dilate' ? 0 : 255;
        let extremeB = operation === 'dilate' ? 0 : 255;
        let extremeA = operation === 'dilate' ? 0 : 255;

        // Apply kernel
        for (let ky = 0; ky < kernel.length; ky++) {
          for (let kx = 0; kx < kernel[ky].length; kx++) {
            const weight = kernel[ky][kx];
            if (weight <= 0) continue;

            const px = Math.min(Math.max(x + kx - kernelHalf, 0), result.width - 1);
            const py = Math.min(Math.max(y + ky - kernelHalf, 0), result.height - 1);
            
            const [r, g, b, a] = result.getPixel(px, py);

            if (operation === 'dilate') {
              if (r > extremeR) extremeR = r;
              if (g > extremeG) extremeG = g;
              if (b > extremeB) extremeB = b;
              if (a > extremeA) extremeA = a;
            } else {
              if (r < extremeR) extremeR = r;
              if (g < extremeG) extremeG = g;
              if (b < extremeB) extremeB = b;
              if (a < extremeA) extremeA = a;
            }
          }
        }

        temp.setPixel(x, y, [extremeR, extremeG, extremeB, extremeA]);
      }
    }
    
    result = temp;
  }

  return result;
}

/**
 * Dilate operation with expansion kernel (matching Python)
 */
export function dilate(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  const kernel = createExpansionKernel();
  return applyMorphologicalOperation(imageData, kernel, 'dilate', iterations);
}

/**
 * Erode operation with expansion kernel (matching Python) 
 */
export function erode(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  const kernel = createExpansionKernel();
  return applyMorphologicalOperation(imageData, kernel, 'erode', iterations);
}

/**
 * Dilate operation with smoothing kernel (matching Python smoothing operations)
 */
export function dilateSmooth(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  const kernel = createSmoothingKernel();
  return applyMorphologicalOperation(imageData, kernel, 'dilate', iterations);
}

/**
 * Erode operation with smoothing kernel (matching Python smoothing operations)
 */
export function erodeSmooth(imageData: PixelImageData, iterations: number = 1): PixelImageData {
  const kernel = createSmoothingKernel();
  return applyMorphologicalOperation(imageData, kernel, 'erode', iterations);
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