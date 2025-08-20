/**
 * Optimized downscaling algorithms
 */
import { PixelImageData } from './imageData'
import { clamp } from '../utils/math'

/**
 * Optimized K-means clustering for pixels
 * Uses squared distances and better memory access patterns
 */
export function kMeansClusterOptimized(
  pixels: Array<[number, number, number]>, 
  k: number = 2, 
  maxIterations: number = 10
): Array<[number, number, number]> {
  // Same logic as original but with micro-optimizations
  if (pixels.length === 0) return []
  if (k <= 0) return []
  if (k >= pixels.length) {
    if (pixels.length === 1) return [pixels[0]]
    const avgR = pixels.reduce((sum, p) => sum + p[0], 0) / pixels.length
    const avgG = pixels.reduce((sum, p) => sum + p[1], 0) / pixels.length
    const avgB = pixels.reduce((sum, p) => sum + p[2], 0) / pixels.length
    return [[Math.round(avgR), Math.round(avgG), Math.round(avgB)]]
  }

  // Initialize centroids deterministically using min-max interpolation (same as original)
  let minR = pixels[0][0], maxR = pixels[0][0]
  let minG = pixels[0][1], maxG = pixels[0][1]
  let minB = pixels[0][2], maxB = pixels[0][2]
  
  for (const pixel of pixels) {
    if (pixel[0] < minR) minR = pixel[0]
    if (pixel[0] > maxR) maxR = pixel[0]
    if (pixel[1] < minG) minG = pixel[1]
    if (pixel[1] > maxG) maxG = pixel[1]
    if (pixel[2] < minB) minB = pixel[2]
    if (pixel[2] > maxB) maxB = pixel[2]
  }

  const centroids: Array<[number, number, number]> = []
  for (let i = 0; i < k; i++) {
    const t = k === 1 ? 0 : i / (k - 1)
    centroids.push([
      minR + t * (maxR - minR),
      minG + t * (maxG - minG),
      minB + t * (maxB - minB)
    ])
  }

  // K-means iterations (similar to original but avoid Math.pow)
  for (let iter = 0; iter < maxIterations; iter++) {
    const clusters: Array<Array<[number, number, number]>> = Array(k).fill(null).map(() => [])
    
    for (const pixel of pixels) {
      let bestCentroid = 0
      let bestDistance = Infinity
      
      for (let c = 0; c < k; c++) {
        // Use squared distance instead of Math.pow for small performance gain
        const dr = pixel[0] - centroids[c][0]
        const dg = pixel[1] - centroids[c][1]
        const db = pixel[2] - centroids[c][2]
        const distance = dr * dr + dg * dg + db * db
        
        if (distance < bestDistance) {
          bestDistance = distance
          bestCentroid = c
        }
      }
      
      clusters[bestCentroid].push(pixel)
    }

    // Update centroids
    let converged = true
    for (let c = 0; c < k; c++) {
      if (clusters[c].length === 0) continue
      
      const newCentroid: [number, number, number] = [
        clusters[c].reduce((sum, p) => sum + p[0], 0) / clusters[c].length,
        clusters[c].reduce((sum, p) => sum + p[1], 0) / clusters[c].length,
        clusters[c].reduce((sum, p) => sum + p[2], 0) / clusters[c].length
      ]
      
      const dr = newCentroid[0] - centroids[c][0]
      const dg = newCentroid[1] - centroids[c][1]
      const db = newCentroid[2] - centroids[c][2]
      const distance = dr * dr + dg * dg + db * db
      
      if (distance > 1) { // 1 pixel difference threshold
        converged = false
      }
      
      centroids[c] = [
        Math.round(newCentroid[0]),
        Math.round(newCentroid[1]),
        Math.round(newCentroid[2])
      ]
    }

    if (converged) break
  }

  // Remove empty centroids (same logic as original)
  return centroids.filter((_, i) => 
    pixels.some(pixel => {
      let bestCentroid = 0
      let bestDistance = Infinity
      
      for (let c = 0; c < centroids.length; c++) {
        const dr = pixel[0] - centroids[c][0]
        const dg = pixel[1] - centroids[c][1]
        const db = pixel[2] - centroids[c][2]
        const distance = dr * dr + dg * dg + db * db
        
        if (distance < bestDistance) {
          bestDistance = distance
          bestCentroid = c
        }
      }
      
      return bestCentroid === i
    })
  )
}

/**
 * Fast K-means clustering using TypedArrays for better performance
 */
export function fastKMeansCluster(
  pixels: Array<[number, number, number]>, 
  k: number = 2,
  maxIterations: number = 10
): Array<[number, number, number]> {
  if (pixels.length === 0) return []
  if (k <= 0) return []
  if (k >= pixels.length) return [...pixels]

  const numPixels = pixels.length
  
  // Use flat arrays for better memory access
  const pixelData = new Uint8Array(numPixels * 3)
  for (let i = 0; i < numPixels; i++) {
    pixelData[i * 3] = pixels[i][0]
    pixelData[i * 3 + 1] = pixels[i][1]
    pixelData[i * 3 + 2] = pixels[i][2]
  }
  
  // Initialize centroids
  const centroids = new Uint8Array(k * 3)
  for (let i = 0; i < k; i++) {
    const pixelIndex = Math.floor((i * numPixels) / k)
    centroids[i * 3] = pixelData[pixelIndex * 3]
    centroids[i * 3 + 1] = pixelData[pixelIndex * 3 + 1]
    centroids[i * 3 + 2] = pixelData[pixelIndex * 3 + 2]
  }
  
  const assignments = new Uint8Array(numPixels)
  const counts = new Uint16Array(k)
  const sums = new Uint32Array(k * 3)
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Reset accumulators
    counts.fill(0)
    sums.fill(0)
    
    // Assignment step
    for (let i = 0; i < numPixels; i++) {
      const r = pixelData[i * 3]
      const g = pixelData[i * 3 + 1]
      const b = pixelData[i * 3 + 2]
      
      let bestCluster = 0
      let bestDistance = Infinity
      
      for (let c = 0; c < k; c++) {
        const cr = centroids[c * 3]
        const cg = centroids[c * 3 + 1]
        const cb = centroids[c * 3 + 2]
        
        const dr = r - cr
        const dg = g - cg
        const db = b - cb
        const distance = dr * dr + dg * dg + db * db
        
        if (distance < bestDistance) {
          bestDistance = distance
          bestCluster = c
        }
      }
      
      assignments[i] = bestCluster
      counts[bestCluster]++
      sums[bestCluster * 3] += r
      sums[bestCluster * 3 + 1] += g
      sums[bestCluster * 3 + 2] += b
    }
    
    // Update step
    let converged = true
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue
      
      const newR = Math.round(sums[c * 3] / counts[c])
      const newG = Math.round(sums[c * 3 + 1] / counts[c])
      const newB = Math.round(sums[c * 3 + 2] / counts[c])
      
      const oldR = centroids[c * 3]
      const oldG = centroids[c * 3 + 1]
      const oldB = centroids[c * 3 + 2]
      
      if (Math.abs(newR - oldR) + Math.abs(newG - oldG) + Math.abs(newB - oldB) > 1) {
        converged = false
      }
      
      centroids[c * 3] = newR
      centroids[c * 3 + 1] = newG
      centroids[c * 3 + 2] = newB
    }
    
    if (converged) break
  }
  
  // Convert back to array format, filtering empty centroids
  const result: Array<[number, number, number]> = []
  for (let c = 0; c < k; c++) {
    if (counts[c] > 0) {
      result.push([
        centroids[c * 3],
        centroids[c * 3 + 1],
        centroids[c * 3 + 2]
      ])
    }
  }
  
  return result
}

/**
 * Optimized K-centroid downscaling algorithm
 */
export function kCentroidDownscaleOptimized(
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
  
  // Process patches in batches for better cache locality
  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      const startX = tx * patchSizeX
      const startY = ty * patchSizeY
      const endX = Math.min(startX + patchSizeX, imageData.width)
      const endY = Math.min(startY + patchSizeY, imageData.height)
      
      // Extract patch pixels more efficiently
      const patchPixels: Array<[number, number, number]> = []
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const [r, g, b] = imageData.getPixel(x, y)
          patchPixels.push([r, g, b])
        }
      }
      
      if (patchPixels.length === 0) {
        result.setPixel(tx, ty, [0, 0, 0, 255])
        continue
      }
      
      // Use optimized clustering
      const centroids = fastKMeansCluster(patchPixels, Math.min(k, patchPixels.length))
      
      if (centroids.length === 0) {
        // Fallback to average color
        const avgR = patchPixels.reduce((sum, p) => sum + p[0], 0) / patchPixels.length
        const avgG = patchPixels.reduce((sum, p) => sum + p[1], 0) / patchPixels.length
        const avgB = patchPixels.reduce((sum, p) => sum + p[2], 0) / patchPixels.length
        result.setPixel(tx, ty, [Math.round(avgR), Math.round(avgG), Math.round(avgB), 255])
      } else {
        // Find centroid closest to center pixel for consistency
        const centerX = Math.floor((startX + endX - 1) / 2)
        const centerY = Math.floor((startY + endY - 1) / 2)
        const [centerR, centerG, centerB] = imageData.getPixel(
          clamp(centerX, 0, imageData.width - 1),
          clamp(centerY, 0, imageData.height - 1)
        )
        
        let bestCentroid = centroids[0]
        let bestDistance = Infinity
        
        for (const centroid of centroids) {
          const dr = centerR - centroid[0]
          const dg = centerG - centroid[1]
          const db = centerB - centroid[2]
          const distance = dr * dr + dg * dg + db * db
          
          if (distance < bestDistance) {
            bestDistance = distance
            bestCentroid = centroid
          }
        }
        
        result.setPixel(tx, ty, [bestCentroid[0], bestCentroid[1], bestCentroid[2], 255])
      }
    }
  }
  
  return result
}