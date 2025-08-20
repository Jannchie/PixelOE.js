/**
 * Custom ImageData class for image processing
 */
export class PixelImageData {
  public width: number
  public height: number
  public data: Uint8ClampedArray

  constructor(width: number, height: number, data?: Uint8ClampedArray) {
    this.width = width
    this.height = height
    this.data = data || new Uint8ClampedArray(width * height * 4)
  }

  /**
   * Get pixel color at (x, y) coordinate
   */
  getPixel(x: number, y: number): [number, number, number, number] {
    const idx = (y * this.width + x) * 4
    return [
      this.data[idx],
      this.data[idx + 1],
      this.data[idx + 2],
      this.data[idx + 3],
    ]
  }

  /**
   * Set pixel color at (x, y) coordinate
   */
  setPixel(x: number, y: number, [r,
g,
b,
a = 255]: [number, number, number, number?]): void {
    const idx = (y * this.width + x) * 4
    this.data[idx] = r
    this.data[idx + 1] = g
    this.data[idx + 2] = b
    this.data[idx + 3] = a
  }

  /**
   * Get luminance value at (x, y) coordinate
   */
  getLuminance(x: number, y: number): number {
    const [r,
g,
b] = this.getPixel(x, y)
    return 0.299 * r + 0.587 * g + 0.114 * b
  }

  /**
   * Clone the image data
   */
  clone(): PixelImageData {
    return new PixelImageData(this.width, this.height, new Uint8ClampedArray(this.data))
  }

  /**
   * Create from HTML Canvas ImageData
   */
  static fromCanvasImageData(imageData: ImageData): PixelImageData {
    return new PixelImageData(imageData.width, imageData.height, imageData.data)
  }

  /**
   * Convert to HTML Canvas ImageData
   */
  toCanvasImageData(): ImageData {
    return new ImageData(this.data, this.width, this.height)
  }
}
