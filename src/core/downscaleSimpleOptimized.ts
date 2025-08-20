/**
 * Simple and fast downscaling optimizations
 */
import { PixelImageData } from './imageData'
import { clamp } from '../utils/math'

/**
 * Fast K-centroid downscaling that avoids expensive operations for large images
 */
export function fastKCentroidDownscale(
  imageData: PixelImageData, 
  targetSize: number, 
  k: number = 2
): PixelImageData {
  const ratio = imageData.width / imageData.height
  const targetHeight = Math.floor(Math.sqrt(targetSize * targetSize / ratio))
  const targetWidth = Math.floor(targetHeight * ratio)
  
  const patchSizeY = Math.max(1, Math.floor(imageData.height / targetHeight))
  const patchSizeX = Math.max(1, Math.floor(imageData.width / targetWidth))
  
  const result = new PixelImageData(targetWidth, targetHeight)
  
  // For large images, use a faster approach than K-means clustering
  const totalPixels = imageData.width * imageData.height
  const useFastPath = totalPixels > 50000 // ~224x224 pixels
  
  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      const startX = tx * patchSizeX
      const startY = ty * patchSizeY
      const endX = Math.min(startX + patchSizeX, imageData.width)
      const endY = Math.min(startY + patchSizeY, imageData.height)
      
      if (useFastPath) {
        // Fast path: use simple sampling instead of K-means
        const samplePoints = Math.min(k * 2, (endX - startX) * (endY - startY))
        const colors: Array<[number, number, number]> = []
        
        // Sample key points in the patch
        for (let i = 0; i < samplePoints; i++) {
          const sampleX = startX + Math.floor((i % Math.sqrt(samplePoints)) * (endX - startX) / Math.sqrt(samplePoints))
          const sampleY = startY + Math.floor(Math.floor(i / Math.sqrt(samplePoints)) * (endY - startY) / Math.sqrt(samplePoints))
          const [r, g, b] = imageData.getPixel(
            clamp(sampleX, startX, endX - 1),
            clamp(sampleY, startY, endY - 1)
          )
          colors.push([r, g, b])
        }
        
        // Find the color closest to the center pixel
        const centerX = Math.floor((startX + endX - 1) / 2)
        const centerY = Math.floor((startY + endY - 1) / 2)
        const [centerR, centerG, centerB] = imageData.getPixel(
          clamp(centerX, 0, imageData.width - 1),
          clamp(centerY, 0, imageData.height - 1)
        )
        
        let bestColor = colors[0] || [centerR, centerG, centerB]
        let bestDistance = Infinity
        
        for (const [r, g, b] of colors) {
          const dr = centerR - r
          const dg = centerG - g
          const db = centerB - b
          const distance = dr * dr + dg * dg + db * db
          
          if (distance < bestDistance) {
            bestDistance = distance
            bestColor = [r, g, b]
          }
        }
        
        result.setPixel(tx, ty, [bestColor[0], bestColor[1], bestColor[2], 255])
        
      } else {
        // Slow path: use average color (fastest for small patches)
        let sumR = 0, sumG = 0, sumB = 0, count = 0
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const [r, g, b] = imageData.getPixel(x, y)
            sumR += r
            sumG += g
            sumB += b
            count++
          }
        }
        
        if (count > 0) {
          result.setPixel(tx, ty, [
            Math.round(sumR / count),
            Math.round(sumG / count),
            Math.round(sumB / count),
            255
          ])
        } else {
          result.setPixel(tx, ty, [0, 0, 0, 255])
        }
      }
    }
  }
  
  return result
}

/**
 * Fast contrast-based downscaling with optimizations
 */
export function fastContrastDownscale(imageData: PixelImageData, targetSize: number = 128): PixelImageData {
  const { width: w, height: h } = imageData;
  const ratio = w / h;
  const adjustedTargetSize = Math.sqrt((targetSize * targetSize) / ratio);
  const targetHW: [number, number] = [
    Math.floor(adjustedTargetSize * ratio),
    Math.floor(adjustedTargetSize)
  ];
  
  // For large images, use a simpler approach
  const totalPixels = w * h;
  if (totalPixels > 100000) {
    // Simple bilinear resize for large images
    return fastBilinearResize(imageData, targetHW[0], targetHW[1]);
  }
  
  // For smaller images, use a more sophisticated approach but still optimized
  const patchSize = Math.max(
    Math.round(h / targetHW[1]),
    Math.round(w / targetHW[0])
  );
  
  const result = new PixelImageData(targetHW[0], targetHW[1]);
  
  for (let ty = 0; ty < targetHW[1]; ty++) {
    for (let tx = 0; tx < targetHW[0]; tx++) {
      const startX = tx * patchSize;
      const startY = ty * patchSize;
      const endX = Math.min(startX + patchSize, w);
      const endY = Math.min(startY + patchSize, h);
      
      // Simple average for speed
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0, count = 0;
      
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const [r, g, b, a] = imageData.getPixel(x, y);
          sumR += r;
          sumG += g;
          sumB += b;
          sumA += a;
          count++;
        }
      }
      
      if (count > 0) {
        result.setPixel(tx, ty, [
          Math.round(sumR / count),
          Math.round(sumG / count),
          Math.round(sumB / count),
          Math.round(sumA / count)
        ]);
      }
    }
  }
  
  return result;
}

/**
 * Fast bilinear resize implementation
 */
function fastBilinearResize(imageData: PixelImageData, newWidth: number, newHeight: number): PixelImageData {
  const result = new PixelImageData(newWidth, newHeight);
  const scaleX = imageData.width / newWidth;
  const scaleY = imageData.height / newHeight;

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = x * scaleX;
      const srcY = y * scaleY;

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