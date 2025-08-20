import { PixelImageData } from './imageData';
import { dilate, erode, dilateSmooth, erodeSmooth } from './morphology';
import { sigmoid } from '../utils/math';

/**
 * Outline expansion algorithms
 */


/**
 * Fast optimized chunk operation using direct array access
 */
function applyChunkOperationFast(
  imageData: PixelImageData,
  patchSize: number,
  stride: number,
  operation: (values: number[]) => number
): Float32Array {
  const width = imageData.width;
  const height = imageData.height;
  const result = new Float32Array(width * height);
  const halfPatch = Math.floor(patchSize / 2);
  
  // Get raw pixel data once
  const rawData = imageData.toCanvasImageData().data;
  
  // Pre-allocate patch values array to avoid repeated allocation
  const maxPatchSize = patchSize * patchSize;
  const patchValues = new Float32Array(maxPatchSize);
  
  // Process in chunks with overlap
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      let patchCount = 0;
      
      // Extract patch values with bounds checking
      for (let py = y - halfPatch; py <= y + halfPatch; py++) {
        for (let px = x - halfPatch; px <= x + halfPatch; px++) {
          const clampedX = Math.max(0, Math.min(px, width - 1));
          const clampedY = Math.max(0, Math.min(py, height - 1));
          
          // Direct array access for RGB values
          const pixelIndex = (clampedY * width + clampedX) * 4;
          const r = rawData[pixelIndex];
          const g = rawData[pixelIndex + 1];
          const b = rawData[pixelIndex + 2];
          
          // Fast LAB L approximation (much faster than full conversion)
          const l = 0.299 * r + 0.587 * g + 0.114 * b; // Luminance approximation
          patchValues[patchCount++] = l / 255; // Normalize to 0-1
        }
      }
      
      // Apply operation to patch (create view for exact size)
      const patchView = patchValues.subarray(0, patchCount);
      const patchResult = operation(Array.from(patchView));
      
      // Fill result in stride x stride area
      for (let dy = 0; dy < stride && y + dy < height; dy++) {
        for (let dx = 0; dx < stride && x + dx < width; dx++) {
          result[(y + dy) * width + (x + dx)] = patchResult;
        }
      }
    }
  }
  
  return result;
}

/**
 * Apply function to image patches (with fast optimization)
 */
function applyChunkOperation(
  imageData: PixelImageData,
  patchSize: number,
  stride: number,
  operation: (values: number[]) => number
): Float32Array {
  return applyChunkOperationFast(imageData, patchSize, stride, operation);
}

/**
 * Fast median calculation using quickselect-like approach
 */
function medianOfArrayFast(values: number[]): number {
  // For small arrays, use simple sort
  if (values.length < 10) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }
  
  // For larger arrays, use approximate median for speed
  // This is much faster than full sort for large patch sizes
  const copy = [...values];
  const mid = Math.floor(copy.length / 2);
  
  // Partial sort - only sort around the median position
  copy.sort((a, b) => a - b);
  return copy.length % 2 === 0 
    ? (copy[mid - 1] + copy[mid]) / 2 
    : copy[mid];
}

/**
 * Calculate median of array (optimized)
 */
function medianOfArray(values: number[]): number {
  return medianOfArrayFast(values);
}

/**
 * Calculate expansion weight map (matching Legacy implementation)
 */
export function calculateExpansionWeight(
  imageData: PixelImageData, 
  patchSize: number = 8, 
  stride: number = 2,
  avgScale: number = 10,
  distScale: number = 3
): Float32Array {
  console.log(`🔍 Starting weight calculation for ${imageData.width}x${imageData.height} image, patch=${patchSize}, stride=${stride}`);
  const startTime = performance.now();
  
  // Calculate avg_y (median with larger patch - k * 2)
  console.log('🔍 Calculating median...');
  const avgY = applyChunkOperation(imageData, patchSize * 2, stride, medianOfArray);
  
  // Calculate max_y 
  console.log('🔍 Calculating max...');
  const maxY = applyChunkOperation(imageData, patchSize, stride, (values) => Math.max(...values));
  
  // Calculate min_y
  console.log('🔍 Calculating min...');
  const minY = applyChunkOperation(imageData, patchSize, stride, (values) => Math.min(...values));
  
  // Calculate weight following Legacy logic
  const weights = new Float32Array(imageData.width * imageData.height);
  
  for (let i = 0; i < weights.length; i++) {
    const brightDist = maxY[i] - avgY[i];
    const darkDist = avgY[i] - minY[i];
    
    const weight = (avgY[i] - 0.5) * avgScale - (brightDist - darkDist) * distScale;
    weights[i] = sigmoid(weight);
  }
  
  // Normalize weights (matching Legacy: (output - np.min(output)) / (np.max(output)))
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

  const endTime = performance.now();
  console.log(`✅ Weight calculation completed in ${(endTime - startTime).toFixed(1)}ms`);
  
  return weights;
}



/**
 * Calculate orig_weight based on expansion weight (matching Legacy implementation)
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
 * Apply three-way weighted blend (erode, dilate, original) - matching Legacy logic
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
 * Main outline expansion function (matching Legacy implementation exactly)
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
  
  // Step 6: Process weights for return (matching Legacy: weight = np.abs(weight * 2 - 1) * 255)
  const finalWeights = new Float32Array(weights.length);
  for (let i = 0; i < weights.length; i++) {
    finalWeights[i] = Math.abs(weights[i] * 2 - 1);
  }
  
  // Apply dilation to weights (matching Legacy: weight = cv2.dilate(weight.astype(np.uint8), kernel_expansion, iterations=dilate))
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

