import { PixelImageData } from './imageData';

/**
 * Morphological operations for image processing
 */

/**
 * Generate circle kernel (matching Python implementation exactly)
 */
function generatePythonCircleKernel(r: number): number[][] {
  const intR = Math.floor(r);
  const size = 2 * intR + 1;
  const kernel = Array(size).fill(0).map(() => Array(size).fill(0));
  
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const points = [
        [i - 0.5, j - 0.5], [i - 0.5, j + 0.5], [i + 0.5, j - 0.5], [i + 0.5, j + 0.5],
        [i, j + 0.5], [i, j - 0.5], [i + 0.5, j], [i - 0.5, j]
      ];
      
      const distances = points.map(p => Math.sqrt((p[0] - intR) ** 2 + (p[1] - intR) ** 2));
      const maxDistance = Math.max(...distances);
      const minDistance = Math.min(...distances);
      
      if (maxDistance <= r) {
        kernel[i][j] = 1;
      } else if (minDistance <= r) {
        const b = (r - minDistance) / (maxDistance - minDistance);
        kernel[i][j] = b;
      }
    }
  }
  
  return kernel;
}

/**
 * Predefined kernels matching Python KERNELS
 */
const PYTHON_KERNELS: { [key: number]: number[][] } = {
  1: generatePythonCircleKernel(1),
  2: generatePythonCircleKernel(1.5),
  3: generatePythonCircleKernel(2).slice(1, 4).map(row => row.slice(1, 4)),
  4: generatePythonCircleKernel(2.5),
  5: generatePythonCircleKernel(3).slice(1, 6).map(row => row.slice(1, 6)),
  6: generatePythonCircleKernel(3.5),
};

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

/**
 * Dilate operation using specific kernel (matching PyTorch dilate_cont)
 */
export function dilateWithKernel(imageData: PixelImageData, kernelIndex: number, iterations: number = 1): PixelImageData {
  const kernel = PYTHON_KERNELS[kernelIndex];
  if (!kernel) {
    throw new Error(`Invalid kernel index: ${kernelIndex}`);
  }
  
  let result = imageData;
  const kernelHalf = Math.floor(kernel.length / 2);
  
  // Perform iterations
  for (let iter = 0; iter < iterations; iter++) {
    const temp = new PixelImageData(result.width, result.height);
    
    for (let y = 0; y < result.height; y++) {
      for (let x = 0; x < result.width; x++) {
        let maxR = -Infinity, maxG = -Infinity, maxB = -Infinity, maxA = -Infinity;
        
        // Apply kernel
        for (let ky = 0; ky < kernel.length; ky++) {
          for (let kx = 0; kx < kernel[ky].length; kx++) {
            const weight = kernel[ky][kx];
            if (weight <= 0) continue;
            
            const px = Math.min(Math.max(x + kx - kernelHalf, 0), result.width - 1);
            const py = Math.min(Math.max(y + ky - kernelHalf, 0), result.height - 1);
            
            const [r, g, b, a] = result.getPixel(px, py);
            
            // Matching PyTorch implementation: patches + kernel - 1 (working in [0,1] range)
            const normalizedR = r / 255;
            const normalizedG = g / 255;
            const normalizedB = b / 255;
            const normalizedA = a / 255;
            
            const weightedR = normalizedR + weight - 1;
            const weightedG = normalizedG + weight - 1;
            const weightedB = normalizedB + weight - 1;
            const weightedA = normalizedA + weight - 1;
            
            if (weightedR > maxR) maxR = weightedR;
            if (weightedG > maxG) maxG = weightedG;
            if (weightedB > maxB) maxB = weightedB;
            if (weightedA > maxA) maxA = weightedA;
          }
        }
        
        // Clamp to [0, 1] as per PyTorch implementation, then convert back to [0, 255]
        temp.setPixel(x, y, [
          Math.round(Math.max(0, Math.min(1, maxR)) * 255),
          Math.round(Math.max(0, Math.min(1, maxG)) * 255),
          Math.round(Math.max(0, Math.min(1, maxB)) * 255),
          Math.round(Math.max(0, Math.min(1, maxA)) * 255)
        ]);
      }
    }
    
    result = temp;
  }
  
  return result;
}

/**
 * Erode operation using specific kernel (matching PyTorch erode_cont)
 */
export function erodeWithKernel(imageData: PixelImageData, kernelIndex: number, iterations: number = 1): PixelImageData {
  const kernel = PYTHON_KERNELS[kernelIndex];
  if (!kernel) {
    throw new Error(`Invalid kernel index: ${kernelIndex}`);
  }
  
  let result = imageData;
  const kernelHalf = Math.floor(kernel.length / 2);
  
  // Perform iterations
  for (let iter = 0; iter < iterations; iter++) {
    const temp = new PixelImageData(result.width, result.height);
    
    for (let y = 0; y < result.height; y++) {
      for (let x = 0; x < result.width; x++) {
        let minR = Infinity, minG = Infinity, minB = Infinity, minA = Infinity;
        
        // Apply kernel
        for (let ky = 0; ky < kernel.length; ky++) {
          for (let kx = 0; kx < kernel[ky].length; kx++) {
            const weight = kernel[ky][kx];
            if (weight <= 0) continue;
            
            const px = Math.min(Math.max(x + kx - kernelHalf, 0), result.width - 1);
            const py = Math.min(Math.max(y + ky - kernelHalf, 0), result.height - 1);
            
            const [r, g, b, a] = result.getPixel(px, py);
            
            // Matching PyTorch implementation: patches - kernel + 1 (working in [0,1] range)
            const normalizedR = r / 255;
            const normalizedG = g / 255;
            const normalizedB = b / 255;
            const normalizedA = a / 255;
            
            const weightedR = normalizedR - weight + 1;
            const weightedG = normalizedG - weight + 1;
            const weightedB = normalizedB - weight + 1;
            const weightedA = normalizedA - weight + 1;
            
            if (weightedR < minR) minR = weightedR;
            if (weightedG < minG) minG = weightedG;
            if (weightedB < minB) minB = weightedB;
            if (weightedA < minA) minA = weightedA;
          }
        }
        
        // Clamp to [0, 1] as per PyTorch implementation, then convert back to [0, 255]
        temp.setPixel(x, y, [
          Math.round(Math.max(0, Math.min(1, minR)) * 255),
          Math.round(Math.max(0, Math.min(1, minG)) * 255),
          Math.round(Math.max(0, Math.min(1, minB)) * 255),
          Math.round(Math.max(0, Math.min(1, minA)) * 255)
        ]);
      }
    }
    
    result = temp;
  }
  
  return result;
}