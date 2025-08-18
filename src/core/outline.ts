import { PixelImageData } from './imageData';
import { rgbToLab } from './colorSpace';
import { dilate, erode, closing, opening } from './morphology';
import { median, mean, sigmoid, clamp, normalize } from '../utils/math';

/**
 * Outline expansion algorithms
 */

interface LocalStats {
  median: number;
  min: number;
  max: number;
  mean: number;
  brightDist: number;
  darkDist: number;
}

/**
 * Calculate local statistics for a patch
 */
function getLocalStats(imageData: PixelImageData, centerX: number, centerY: number, patchSize: number): LocalStats {
  const luminances: number[] = [];
  const halfPatch = Math.floor(patchSize / 2);

  for (let y = centerY - halfPatch; y <= centerY + halfPatch; y++) {
    for (let x = centerX - halfPatch; x <= centerX + halfPatch; x++) {
      const clampedX = clamp(x, 0, imageData.width - 1);
      const clampedY = clamp(y, 0, imageData.height - 1);
      
      const [r, g, b] = imageData.getPixel(clampedX, clampedY);
      const [l] = rgbToLab(r, g, b);
      luminances.push(l / 100); // Normalize to 0-1
    }
  }

  const medianVal = median(luminances);
  const meanVal = mean(luminances);
  const minVal = Math.min(...luminances);
  const maxVal = Math.max(...luminances);

  return {
    median: medianVal,
    min: minVal,
    max: maxVal,
    mean: meanVal,
    brightDist: maxVal - medianVal,
    darkDist: medianVal - minVal
  };
}

/**
 * Calculate expansion weight map
 */
export function calculateExpansionWeight(
  imageData: PixelImageData, 
  patchSize: number = 16, 
  stride: number = 4,
  avgScale: number = 10,
  distScale: number = 3
): Float32Array {
  const weights = new Float32Array(imageData.width * imageData.height);
  
  // For very large images, increase stride to reduce computation
  const imageSize = imageData.width * imageData.height;
  if (imageSize > 1000000) { // 1MP
    stride = Math.max(stride, 8);
    patchSize = Math.min(patchSize, 12);
  }
  
  const tempWeights: number[] = [];
  const samplePositions: Array<{x: number, y: number}> = [];

  // Calculate weights at sample points
  for (let y = stride; y < imageData.height - stride; y += stride) {
    for (let x = stride; x < imageData.width - stride; x += stride) {
      const stats = getLocalStats(imageData, x, y, patchSize);
      
      // Calculate weight based on original algorithm
      const weight = (stats.median - 0.5) * avgScale - (stats.brightDist - stats.darkDist) * distScale;
      const sigmoidWeight = sigmoid(weight);
      
      tempWeights.push(sigmoidWeight);
      samplePositions.push({x, y});
    }
  }

  // Normalize weights safely
  const normalizedWeights = normalize(tempWeights);

  // Interpolate weights across the entire image using nearest neighbor
  const samplesPerRow = Math.floor((imageData.width - 2 * stride) / stride);
  
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      // Find nearest sample point
      const sampleRow = Math.max(0, Math.min(Math.floor(y / stride), Math.floor((imageData.height - 2 * stride) / stride) - 1));
      const sampleCol = Math.max(0, Math.min(Math.floor(x / stride), samplesPerRow - 1));
      const sampleIndex = sampleRow * samplesPerRow + sampleCol;
      
      if (sampleIndex < normalizedWeights.length) {
        weights[y * imageData.width + x] = normalizedWeights[sampleIndex];
      } else {
        weights[y * imageData.width + x] = 0.5; // Default weight
      }
    }
  }

  return weights;
}

/**
 * Apply weighted blend between two images
 */
function weightedBlend(img1: PixelImageData, img2: PixelImageData, weights: Float32Array): PixelImageData {
  const result = new PixelImageData(img1.width, img1.height);

  for (let y = 0; y < img1.height; y++) {
    for (let x = 0; x < img1.width; x++) {
      const weight = weights[y * img1.width + x];
      const [r1, g1, b1, a1] = img1.getPixel(x, y);
      const [r2, g2, b2, a2] = img2.getPixel(x, y);

      result.setPixel(x, y, [
        Math.round(r1 * weight + r2 * (1 - weight)),
        Math.round(g1 * weight + g2 * (1 - weight)),
        Math.round(b1 * weight + b2 * (1 - weight)),
        Math.round(a1 * weight + a2 * (1 - weight))
      ]);
    }
  }

  return result;
}

/**
 * Main outline expansion function
 */
export function outlineExpansion(
  imageData: PixelImageData,
  erodeIters: number = 2,
  dilateIters: number = 2,
  patchSize: number = 16,
  avgScale: number = 10,
  distScale: number = 3
): { result: PixelImageData; weights: Float32Array } {
  // Calculate expansion weights
  const weights = calculateExpansionWeight(imageData, patchSize, patchSize / 4, avgScale, distScale);
  
  // Apply morphological operations
  const eroded = erode(imageData, erodeIters);
  const dilated = dilate(imageData, dilateIters);
  
  // Blend based on weights
  let result = weightedBlend(eroded, dilated, weights);
  
  // Apply morphological cleanup operations
  const cleanupIters = Math.max(erodeIters - 1, dilateIters - 1, 1);
  result = erode(result, cleanupIters);
  result = dilate(result, cleanupIters * 2);
  result = erode(result, cleanupIters);

  return { result, weights };
}