import { PixelImageData } from './imageData';
import { rgbToLab, labToRgb } from './colorSpace';
import { median, mean, clamp } from '../utils/math';

/**
 * Downscaling algorithms
 */

/**
 * Select pixel from a patch based on contrast analysis
 */
function selectPixelByContrast(patch: Array<[number, number, number]>): [number, number, number] {
  if (patch.length === 0) return [0, 0, 0];
  
  // Convert to LAB and extract luminance
  const labPatch = patch.map(([r, g, b]) => rgbToLab(r, g, b));
  const luminances = labPatch.map(([l]) => l);
  
  const medianLum = median(luminances);
  const meanLum = mean(luminances);
  const maxLum = Math.max(...luminances);
  const minLum = Math.min(...luminances);
  
  // Default to center pixel
  const centerIdx = Math.floor(patch.length / 2);
  let selectedIdx = centerIdx;
  
  // Apply contrast-based selection logic
  if (medianLum < meanLum && (maxLum - medianLum) > (medianLum - minLum)) {
    // Patch is skewed toward low values, select minimum to preserve dark details
    selectedIdx = luminances.indexOf(minLum);
  } else if (medianLum > meanLum && (maxLum - medianLum) < (medianLum - minLum)) {
    // Patch is skewed toward high values, select maximum to preserve bright details
    selectedIdx = luminances.indexOf(maxLum);
  }
  
  return patch[selectedIdx];
}

/**
 * Get color patch data from image
 */
function getColorPatch(imageData: PixelImageData, startX: number, startY: number, patchSize: number): {
  luminancePatch: Array<[number, number, number]>,
  aPatch: number[],
  bPatch: number[]
} {
  const luminancePatch: Array<[number, number, number]> = [];
  const aPatch: number[] = [];
  const bPatch: number[] = [];
  
  for (let y = startY; y < startY + patchSize && y < imageData.height; y++) {
    for (let x = startX; x < startX + patchSize && x < imageData.width; x++) {
      const [r, g, b] = imageData.getPixel(x, y);
      const [l, a, bLab] = rgbToLab(r, g, b);
      
      luminancePatch.push([r, g, b]);
      aPatch.push(a);
      bPatch.push(bLab);
    }
  }
  
  return { luminancePatch, aPatch, bPatch };
}

/**
 * Contrast-based downscaling algorithm
 */
export function contrastDownscale(imageData: PixelImageData, targetSize: number): PixelImageData {
  const ratio = imageData.width / imageData.height;
  const targetHeight = Math.floor(Math.sqrt(targetSize * targetSize / ratio));
  const targetWidth = Math.floor(targetHeight * ratio);
  
  const patchSizeY = Math.max(1, Math.floor(imageData.height / targetHeight));
  const patchSizeX = Math.max(1, Math.floor(imageData.width / targetWidth));
  
  const result = new PixelImageData(targetWidth, targetHeight);
  
  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      const startX = tx * patchSizeX;
      const startY = ty * patchSizeY;
      
      // Get patch data
      const { luminancePatch, aPatch, bPatch } = getColorPatch(
        imageData, startX, startY, Math.max(patchSizeX, patchSizeY)
      );
      
      // Select luminance pixel using contrast analysis
      const [selectedR, selectedG, selectedB] = selectPixelByContrast(luminancePatch);
      const [selectedL] = rgbToLab(selectedR, selectedG, selectedB);
      
      // Use median for A and B channels
      const medianA = median(aPatch);
      const medianB = median(bPatch);
      
      // Convert back to RGB
      const [finalR, finalG, finalB] = labToRgb(selectedL, medianA, medianB);
      
      result.setPixel(tx, ty, [finalR, finalG, finalB, 255]);
    }
  }
  
  return result;
}

/**
 * Nearest neighbor upscaling
 */
export function nearestUpscale(imageData: PixelImageData, scale: number): PixelImageData {
  const newWidth = imageData.width * scale;
  const newHeight = imageData.height * scale;
  const result = new PixelImageData(newWidth, newHeight);
  
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      
      const pixel = imageData.getPixel(
        clamp(srcX, 0, imageData.width - 1),
        clamp(srcY, 0, imageData.height - 1)
      );
      
      result.setPixel(x, y, pixel);
    }
  }
  
  return result;
}

/**
 * Bilinear interpolation upscaling
 */
export function bilinearUpscale(imageData: PixelImageData, scale: number): PixelImageData {
  const newWidth = imageData.width * scale;
  const newHeight = imageData.height * scale;
  const result = new PixelImageData(newWidth, newHeight);
  
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = x / scale;
      const srcY = y / scale;
      
      const x1 = Math.floor(srcX);
      const y1 = Math.floor(srcY);
      const x2 = Math.min(x1 + 1, imageData.width - 1);
      const y2 = Math.min(y1 + 1, imageData.height - 1);
      
      const dx = srcX - x1;
      const dy = srcY - y1;
      
      const [r1, g1, b1, a1] = imageData.getPixel(x1, y1);
      const [r2, g2, b2, a2] = imageData.getPixel(x2, y1);
      const [r3, g3, b3, a3] = imageData.getPixel(x1, y2);
      const [r4, g4, b4, a4] = imageData.getPixel(x2, y2);
      
      const r = Math.round(
        r1 * (1 - dx) * (1 - dy) +
        r2 * dx * (1 - dy) +
        r3 * (1 - dx) * dy +
        r4 * dx * dy
      );
      
      const g = Math.round(
        g1 * (1 - dx) * (1 - dy) +
        g2 * dx * (1 - dy) +
        g3 * (1 - dx) * dy +
        g4 * dx * dy
      );
      
      const b = Math.round(
        b1 * (1 - dx) * (1 - dy) +
        b2 * dx * (1 - dy) +
        b3 * (1 - dx) * dy +
        b4 * dx * dy
      );
      
      const a = Math.round(
        a1 * (1 - dx) * (1 - dy) +
        a2 * dx * (1 - dy) +
        a3 * (1 - dx) * dy +
        a4 * dx * dy
      );
      
      result.setPixel(x, y, [r, g, b, a]);
    }
  }
  
  return result;
}

/**
 * Center pixel downscaling (simple pixel selection)
 */
export function centerDownscale(imageData: PixelImageData, targetSize: number): PixelImageData {
  const ratio = imageData.width / imageData.height;
  const targetHeight = Math.floor(Math.sqrt(targetSize * targetSize / ratio));
  const targetWidth = Math.floor(targetHeight * ratio);
  
  const patchSizeY = Math.max(1, Math.floor(imageData.height / targetHeight));
  const patchSizeX = Math.max(1, Math.floor(imageData.width / targetWidth));
  
  const result = new PixelImageData(targetWidth, targetHeight);
  
  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      const centerX = Math.floor(tx * patchSizeX + patchSizeX / 2);
      const centerY = Math.floor(ty * patchSizeY + patchSizeY / 2);
      
      const pixel = imageData.getPixel(
        clamp(centerX, 0, imageData.width - 1),
        clamp(centerY, 0, imageData.height - 1)
      );
      
      result.setPixel(tx, ty, pixel);
    }
  }
  
  return result;
}

/**
 * K-means clustering for a set of pixels
 */
function kMeansCluster(pixels: Array<[number, number, number]>, k: number = 2, maxIterations: number = 10): Array<[number, number, number]> {
  if (pixels.length === 0) return [];
  if (k <= 0 || k >= pixels.length) {
    // If k is invalid, return the most frequent color or average
    if (pixels.length === 1) return [pixels[0]];
    const avgR = pixels.reduce((sum, p) => sum + p[0], 0) / pixels.length;
    const avgG = pixels.reduce((sum, p) => sum + p[1], 0) / pixels.length;
    const avgB = pixels.reduce((sum, p) => sum + p[2], 0) / pixels.length;
    return [[Math.round(avgR), Math.round(avgG), Math.round(avgB)]];
  }

  // Initialize centroids deterministically using min-max interpolation
  let minR = pixels[0][0], maxR = pixels[0][0];
  let minG = pixels[0][1], maxG = pixels[0][1];
  let minB = pixels[0][2], maxB = pixels[0][2];
  
  for (const pixel of pixels) {
    if (pixel[0] < minR) minR = pixel[0];
    if (pixel[0] > maxR) maxR = pixel[0];
    if (pixel[1] < minG) minG = pixel[1];
    if (pixel[1] > maxG) maxG = pixel[1];
    if (pixel[2] < minB) minB = pixel[2];
    if (pixel[2] > maxB) maxB = pixel[2];
  }

  const centroids: Array<[number, number, number]> = [];
  for (let i = 0; i < k; i++) {
    const t = i / (k - 1);
    centroids.push([
      minR + t * (maxR - minR),
      minG + t * (maxG - minG),
      minB + t * (maxB - minB)
    ]);
  }

  // K-means iterations
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign pixels to closest centroids
    const clusters: Array<Array<[number, number, number]>> = Array(k).fill(null).map(() => []);
    
    for (const pixel of pixels) {
      let bestCentroid = 0;
      let bestDistance = Infinity;
      
      for (let c = 0; c < k; c++) {
        const distance = 
          Math.pow(pixel[0] - centroids[c][0], 2) +
          Math.pow(pixel[1] - centroids[c][1], 2) +
          Math.pow(pixel[2] - centroids[c][2], 2);
        
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCentroid = c;
        }
      }
      
      clusters[bestCentroid].push(pixel);
    }

    // Update centroids
    let converged = true;
    for (let c = 0; c < k; c++) {
      if (clusters[c].length === 0) continue;
      
      const newCentroid: [number, number, number] = [
        clusters[c].reduce((sum, p) => sum + p[0], 0) / clusters[c].length,
        clusters[c].reduce((sum, p) => sum + p[1], 0) / clusters[c].length,
        clusters[c].reduce((sum, p) => sum + p[2], 0) / clusters[c].length
      ];
      
      const distance = 
        Math.pow(newCentroid[0] - centroids[c][0], 2) +
        Math.pow(newCentroid[1] - centroids[c][1], 2) +
        Math.pow(newCentroid[2] - centroids[c][2], 2);
      
      if (distance > 1) { // 1 pixel difference threshold
        converged = false;
      }
      
      centroids[c] = [
        Math.round(newCentroid[0]),
        Math.round(newCentroid[1]),
        Math.round(newCentroid[2])
      ];
    }

    if (converged) break;
  }

  // Remove empty centroids
  return centroids.filter((_, i) => 
    pixels.some(pixel => {
      let bestCentroid = 0;
      let bestDistance = Infinity;
      
      for (let c = 0; c < centroids.length; c++) {
        const distance = 
          Math.pow(pixel[0] - centroids[c][0], 2) +
          Math.pow(pixel[1] - centroids[c][1], 2) +
          Math.pow(pixel[2] - centroids[c][2], 2);
        
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCentroid = c;
        }
      }
      
      return bestCentroid === i;
    })
  );
}

/**
 * K-centroid downscaling algorithm
 */
export function kCentroidDownscale(imageData: PixelImageData, targetSize: number, k: number = 2): PixelImageData {
  const ratio = imageData.width / imageData.height;
  const targetHeight = Math.floor(Math.sqrt(targetSize * targetSize / ratio));
  const targetWidth = Math.floor(targetHeight * ratio);
  
  const patchSizeY = Math.max(1, Math.floor(imageData.height / targetHeight));
  const patchSizeX = Math.max(1, Math.floor(imageData.width / targetWidth));
  
  const result = new PixelImageData(targetWidth, targetHeight);
  
  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      const startX = tx * patchSizeX;
      const startY = ty * patchSizeY;
      const endX = Math.min(startX + patchSizeX, imageData.width);
      const endY = Math.min(startY + patchSizeY, imageData.height);
      
      // Extract patch pixels
      const patchPixels: Array<[number, number, number]> = [];
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const [r, g, b] = imageData.getPixel(x, y);
          patchPixels.push([r, g, b]);
        }
      }
      
      if (patchPixels.length === 0) {
        result.setPixel(tx, ty, [0, 0, 0, 255]);
        continue;
      }
      
      // Apply K-means clustering
      const centroids = kMeansCluster(patchPixels, Math.min(k, patchPixels.length));
      
      if (centroids.length === 0) {
        // Fallback to average color
        const avgR = patchPixels.reduce((sum, p) => sum + p[0], 0) / patchPixels.length;
        const avgG = patchPixels.reduce((sum, p) => sum + p[1], 0) / patchPixels.length;
        const avgB = patchPixels.reduce((sum, p) => sum + p[2], 0) / patchPixels.length;
        result.setPixel(tx, ty, [Math.round(avgR), Math.round(avgG), Math.round(avgB), 255]);
      } else {
        // Find the centroid closest to the center pixel
        const centerX = Math.floor((startX + endX - 1) / 2);
        const centerY = Math.floor((startY + endY - 1) / 2);
        const [centerR, centerG, centerB] = imageData.getPixel(
          clamp(centerX, 0, imageData.width - 1),
          clamp(centerY, 0, imageData.height - 1)
        );
        
        let bestCentroid = centroids[0];
        let bestDistance = Infinity;
        
        for (const centroid of centroids) {
          const distance = 
            Math.pow(centerR - centroid[0], 2) +
            Math.pow(centerG - centroid[1], 2) +
            Math.pow(centerB - centroid[2], 2);
          
          if (distance < bestDistance) {
            bestDistance = distance;
            bestCentroid = centroid;
          }
        }
        
        result.setPixel(tx, ty, [bestCentroid[0], bestCentroid[1], bestCentroid[2], 255]);
      }
    }
  }
  
  return result;
}