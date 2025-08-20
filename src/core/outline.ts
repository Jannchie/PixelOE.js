import { PixelImageData } from './imageData';
import { rgbToLab } from './colorSpace';
import { dilate, erode, dilateSmooth, erodeSmooth } from './morphology';
import { sigmoid } from '../utils/math';

/**
 * Outline expansion algorithms
 */


/**
 * Apply function to image patches (similar to Python apply_chunk_torch)
 */
function applyChunkOperation(
  imageData: PixelImageData,
  patchSize: number,
  stride: number,
  operation: (values: number[]) => number
): Float32Array {
  const result = new Float32Array(imageData.width * imageData.height);
  const halfPatch = Math.floor(patchSize / 2);
  
  // Process in chunks with overlap
  for (let y = 0; y < imageData.height; y += stride) {
    for (let x = 0; x < imageData.width; x += stride) {
      // Extract patch values
      const patchValues: number[] = [];
      
      for (let py = y - halfPatch; py <= y + halfPatch; py++) {
        for (let px = x - halfPatch; px <= x + halfPatch; px++) {
          const clampedX = Math.max(0, Math.min(px, imageData.width - 1));
          const clampedY = Math.max(0, Math.min(py, imageData.height - 1));
          
          const [r, g, b] = imageData.getPixel(clampedX, clampedY);
          // Convert to LAB L channel (normalized)
          const [l] = rgbToLab(r, g, b);
          patchValues.push(l / 100); // Normalize to 0-1
        }
      }
      
      // Apply operation to patch
      const patchResult = operation(patchValues);
      
      // Fill result in stride x stride area
      for (let dy = 0; dy < stride && y + dy < imageData.height; dy++) {
        for (let dx = 0; dx < stride && x + dx < imageData.width; dx++) {
          result[(y + dy) * imageData.width + (x + dx)] = patchResult;
        }
      }
    }
  }
  
  return result;
}

/**
 * Calculate median of array
 */
function medianOfArray(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate expansion weight map (matching Python implementation more closely)
 */
export function calculateExpansionWeight(
  imageData: PixelImageData, 
  patchSize: number = 16, 
  stride: number = 4,
  avgScale: number = 10,
  distScale: number = 3
): Float32Array {
  // Calculate avg_y (median with larger patch - k * 2)
  const avgY = applyChunkOperation(imageData, patchSize * 2, stride, medianOfArray);
  
  // Calculate max_y 
  const maxY = applyChunkOperation(imageData, patchSize, stride, (values) => Math.max(...values));
  
  // Calculate min_y
  const minY = applyChunkOperation(imageData, patchSize, stride, (values) => Math.min(...values));
  
  // Calculate weight following Python logic
  const weights = new Float32Array(imageData.width * imageData.height);
  
  for (let i = 0; i < weights.length; i++) {
    const brightDist = maxY[i] - avgY[i];
    const darkDist = avgY[i] - minY[i];
    
    const weight = (avgY[i] - 0.5) * avgScale - (brightDist - darkDist) * distScale;
    weights[i] = sigmoid(weight);
  }
  
  // Normalize weights (matching Python: (output - np.min(output)) / (np.max(output)))
  let minWeight = weights[0];
  let maxWeight = weights[0];
  
  for (let i = 1; i < weights.length; i++) {
    if (weights[i] < minWeight) minWeight = weights[i];
    if (weights[i] > maxWeight) maxWeight = weights[i];
  }
  
  const range = maxWeight - minWeight;
  if (range > 0) {
    for (let i = 0; i < weights.length; i++) {
      weights[i] = (weights[i] - minWeight) / range;
    }
  }

  return weights;
}


/**
 * Calculate orig_weight based on expansion weight (matching Python implementation)
 */
function calculateOrigWeight(weights: Float32Array): Float32Array {
  const origWeights = new Float32Array(weights.length);
  
  for (let i = 0; i < weights.length; i++) {
    // orig_weight = sigmoid((weight - 0.5) * 5) * 0.25
    const sigmoidInput = (weights[i] - 0.5) * 5;
    const sigmoidOutput = sigmoid(sigmoidInput);
    origWeights[i] = sigmoidOutput * 0.25;
  }
  
  return origWeights;
}

/**
 * Apply three-way weighted blend (erode, dilate, original) - matching Python logic
 */
function threewayBlend(
  eroded: PixelImageData, 
  dilated: PixelImageData, 
  original: PixelImageData,
  weights: Float32Array,
  origWeights: Float32Array
): PixelImageData {
  const result = new PixelImageData(original.width, original.height);

  for (let y = 0; y < original.height; y++) {
    for (let x = 0; x < original.width; x++) {
      const weight = weights[y * original.width + x];
      const origWeight = origWeights[y * original.width + x];
      
      const [re, ge, be, ae] = eroded.getPixel(x, y);
      const [rd, gd, bd, ad] = dilated.getPixel(x, y);
      const [ro, go, bo, ao] = original.getPixel(x, y);

      // First blend: eroded * weight + dilated * (1 - weight)
      const r1 = re * weight + rd * (1 - weight);
      const g1 = ge * weight + gd * (1 - weight);
      const b1 = be * weight + bd * (1 - weight);
      const a1 = ae * weight + ad * (1 - weight);
      
      // Second blend: output = first_blend * (1 - orig_weight) + original * orig_weight
      const r = r1 * (1 - origWeight) + ro * origWeight;
      const g = g1 * (1 - origWeight) + go * origWeight;
      const b = b1 * (1 - origWeight) + bo * origWeight;
      const a = a1 * (1 - origWeight) + ao * origWeight;

      result.setPixel(x, y, [
        Math.round(Math.max(0, Math.min(255, r))),
        Math.round(Math.max(0, Math.min(255, g))),
        Math.round(Math.max(0, Math.min(255, b))),
        Math.round(Math.max(0, Math.min(255, a)))
      ]);
    }
  }

  return result;
}

/**
 * Main outline expansion function (matching Python implementation exactly)
 */
export function outlineExpansion(
  imageData: PixelImageData,
  erodeIters: number = 2,
  dilateIters: number = 2,
  patchSize: number = 16,
  avgScale: number = 10,
  distScale: number = 3
): { result: PixelImageData; weights: Float32Array } {
  // Step 1: Calculate expansion weights (k, stride, avg_scale, dist_scale)
  const weights = calculateExpansionWeight(imageData, patchSize, Math.floor(patchSize / 4) * 2, avgScale, distScale);
  
  // Step 2: Calculate orig_weight = sigmoid((weight - 0.5) * 5) * 0.25
  const origWeights = calculateOrigWeight(weights);
  
  // Step 3: Apply proper morphological operations
  const imgErode = erode(imageData, erodeIters);
  const imgDilate = dilate(imageData, dilateIters);
  
  // Step 4: Three-way weighted blend
  let result = threewayBlend(imgErode, imgDilate, imageData, weights, origWeights);
  
  // Step 5: Second round of morphological operations with smoothing kernel
  // output = cv2.erode(output, kernel_smoothing, iterations=erode)
  result = erodeSmooth(result, erodeIters);
  // output = cv2.dilate(output, kernel_smoothing, iterations=dilate * 2)
  result = dilateSmooth(result, dilateIters * 2);
  // output = cv2.erode(output, kernel_smoothing, iterations=erode)
  result = erodeSmooth(result, erodeIters);
  
  // Step 6: Process weights for return (matching Python: weight = np.abs(weight * 2 - 1) * 255)
  const finalWeights = new Float32Array(weights.length);
  for (let i = 0; i < weights.length; i++) {
    finalWeights[i] = Math.abs(weights[i] * 2 - 1);
  }
  
  // Apply dilation to weights (matching Python: weight = cv2.dilate(weight.astype(np.uint8), kernel_expansion, iterations=dilate))
  const weightImage = new PixelImageData(imageData.width, imageData.height);
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const weightValue = Math.round(finalWeights[y * imageData.width + x] * 255);
      weightImage.setPixel(x, y, [weightValue, weightValue, weightValue, 255]);
    }
  }
  
  const dilatedWeightImage = dilate(weightImage, dilateIters);
  
  // Extract back to Float32Array
  const processedWeights = new Float32Array(weights.length);
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < imageData.width; x++) {
      const [weightValue] = dilatedWeightImage.getPixel(x, y);
      processedWeights[y * imageData.width + x] = weightValue / 255;
    }
  }

  return { result, weights: processedWeights };
}

