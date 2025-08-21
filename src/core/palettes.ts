/**
 * Predefined color palettes for pixel art generation
 */

export interface ColorPalette {
  name: string
  description: string
  colors: number[][] // RGB values [0-255]
}

/**
 * Predefined color palettes
 */
export const PREDEFINED_PALETTES: ColorPalette[] = [
  {
    name: 'NES',
    description: 'Classic 8-bit NES color palette',
    colors: [
      [84, 84, 84],    // Dark Gray
      [0, 30, 116],    // Dark Blue
      [8, 16, 144],    // Purple
      [48, 0, 136],    // Dark Purple
      [68, 0, 100],    // Magenta
      [92, 0, 48],     // Dark Red
      [84, 4, 0],      // Brown
      [60, 24, 0],     // Dark Orange
      [32, 42, 0],     // Dark Green
      [8, 58, 0],      // Green
      [0, 64, 0],      // Bright Green
      [0, 60, 48],     // Teal
      [0, 50, 92],     // Blue
      [0, 0, 0],       // Black
      [0, 0, 0],       // Black
      [0, 0, 0],       // Black
      [152, 150, 152], // Light Gray
      [8, 76, 196],    // Blue
      [48, 50, 236],   // Light Blue
      [92, 30, 228],   // Light Purple
      [136, 20, 176],  // Pink
      [160, 20, 100],  // Light Red
      [152, 34, 32],   // Red
      [120, 60, 0],    // Orange
      [84, 90, 0],     // Yellow-Green
      [40, 114, 0],    // Light Green
      [8, 124, 0],     // Bright Light Green
      [0, 118, 40],    // Cyan-Green
      [0, 102, 120],   // Light Cyan
      [0, 0, 0],       // Black
      [0, 0, 0],       // Black
      [0, 0, 0],       // Black
      [236, 238, 236], // White
      [76, 154, 236],  // Sky Blue
      [120, 124, 236], // Lavender
      [176, 98, 236],  // Light Pink
      [228, 84, 236],  // Magenta
      [236, 88, 180],  // Pink
      [236, 106, 100], // Salmon
      [212, 136, 32],  // Gold
      [160, 170, 0],   // Yellow
      [116, 196, 0],   // Lime
      [76, 208, 32],   // Light Green
      [56, 204, 108],  // Mint
      [56, 180, 204],  // Light Blue
      [60, 60, 60],    // Dark Gray
      [0, 0, 0],       // Black
      [0, 0, 0],       // Black
      [236, 238, 236], // White
      [168, 204, 236], // Very Light Blue
      [188, 188, 236], // Very Light Purple
      [212, 178, 236], // Very Light Pink
      [236, 174, 236], // Very Light Magenta
      [236, 174, 212], // Very Light Pink
      [236, 180, 176], // Very Light Salmon
      [228, 196, 144], // Very Light Gold
      [204, 210, 120], // Very Light Yellow
      [180, 222, 120], // Very Light Lime
      [168, 226, 144], // Very Light Green
      [152, 226, 180], // Very Light Mint
      [160, 214, 228], // Very Light Cyan
      [160, 162, 160], // Light Gray
      [0, 0, 0],       // Black
      [0, 0, 0]        // Black
    ]
  },
  {
    name: 'Gameboy',
    description: 'Classic Game Boy monochrome palette',
    colors: [
      [15, 56, 15],    // Darkest Green
      [48, 98, 48],    // Dark Green
      [139, 172, 15],  // Light Green
      [155, 188, 15]   // Lightest Green
    ]
  },
  {
    name: 'Pico-8',
    description: 'Pico-8 fantasy console 16-color palette',
    colors: [
      [0, 0, 0],       // Black
      [29, 43, 83],    // Dark Blue
      [126, 37, 83],   // Dark Purple
      [0, 135, 81],    // Dark Green
      [171, 82, 54],   // Brown
      [95, 87, 79],    // Dark Gray
      [194, 195, 199], // Light Gray
      [255, 241, 232], // White
      [255, 0, 77],    // Red
      [255, 163, 0],   // Orange
      [255, 236, 39],  // Yellow
      [0, 228, 54],    // Green
      [41, 173, 255],  // Blue
      [131, 118, 156], // Indigo
      [255, 119, 168], // Pink
      [255, 204, 170]  // Peach
    ]
  },
  {
    name: 'Commodore 64',
    description: 'Commodore 64 computer palette',
    colors: [
      [0, 0, 0],       // Black
      [255, 255, 255], // White
      [136, 57, 50],   // Red
      [103, 182, 189], // Cyan
      [139, 63, 150],  // Purple
      [85, 160, 73],   // Green
      [64, 49, 141],   // Blue
      [191, 206, 114], // Yellow
      [139, 84, 41],   // Orange
      [87, 66, 0],     // Brown
      [184, 105, 98],  // Light Red
      [80, 80, 80],    // Dark Gray
      [120, 120, 120], // Gray
      [148, 224, 137], // Light Green
      [120, 105, 196], // Light Blue
      [159, 159, 159]  // Light Gray
    ]
  },
  {
    name: 'CGA',
    description: 'IBM CGA 16-color palette',
    colors: [
      [0, 0, 0],       // Black
      [0, 0, 170],     // Blue
      [0, 170, 0],     // Green
      [0, 170, 170],   // Cyan
      [170, 0, 0],     // Red
      [170, 0, 170],   // Magenta
      [170, 85, 0],    // Brown
      [170, 170, 170], // Light Gray
      [85, 85, 85],    // Dark Gray
      [85, 85, 255],   // Light Blue
      [85, 255, 85],   // Light Green
      [85, 255, 255],  // Light Cyan
      [255, 85, 85],   // Light Red
      [255, 85, 255],  // Light Magenta
      [255, 255, 85],  // Yellow
      [255, 255, 255]  // White
    ]
  },
  {
    name: 'Endesga 32',
    description: '32-color pixel art palette by Endesga',
    colors: [
      [190, 74, 47],   // Red
      [215, 118, 67],  // Orange
      [234, 212, 170], // Light Orange
      [228, 166, 114], // Tan
      [184, 111, 80],  // Brown
      [116, 63, 57],   // Dark Brown
      [63, 39, 49],    // Dark Red
      [84, 78, 104],   // Purple Gray
      [140, 143, 174], // Light Purple
      [208, 207, 221], // Very Light Purple
      [255, 255, 255], // White
      [52, 101, 36],   // Dark Green
      [91, 143, 85],   // Green
      [135, 192, 124], // Light Green
      [171, 236, 149], // Very Light Green
      [234, 255, 137], // Yellow Green
      [249, 241, 165], // Light Yellow
      [255, 255, 119], // Yellow
      [255, 204, 102], // Light Orange
      [255, 102, 99],  // Pink
      [238, 52, 78],   // Red
      [204, 0, 123],   // Magenta
      [111, 30, 81],   // Dark Magenta
      [75, 105, 47],   // Forest Green
      [82, 75, 36],    // Olive
      [50, 60, 57],    // Dark Gray Green
      [63, 63, 116],   // Navy
      [48, 96, 130],   // Blue
      [91, 110, 225],  // Light Blue
      [99, 155, 255],  // Sky Blue
      [95, 205, 228],  // Cyan
      [203, 219, 252]  // Very Light Blue
    ]
  },
  {
    name: 'CHOCOMILK-8',
    description: 'Warm 8-color palette with chocolate and milk tones by Blylzz',
    colors: [
      [214, 245, 228], // Light mint green
      [247, 255, 197], // Very light yellow
      [180, 199, 136], // Light green
      [138, 137, 105], // Olive green
      [139, 106, 68],  // Brown
      [98, 85, 76],    // Dark brown
      [70, 60, 60],    // Very dark brown
      [49, 38, 41]     // Almost black
    ]
  },
  {
    name: 'SLSO8',
    description: '8-color palette with deep blues to warm oranges',
    colors: [
      [13, 43, 69],    // Deep blue
      [32, 60, 86],    // Dark blue
      [84, 78, 104],   // Purple-gray
      [141, 105, 122], // Dusty pink
      [208, 129, 89],  // Brown-orange
      [255, 170, 94],  // Light orange
      [255, 212, 163], // Light peach
      [255, 236, 214]  // Very light cream
    ]
  },
  {
    name: 'CC-29',
    description: '29-color palette with muted tones and pastels',
    colors: [
      [242, 240, 229], // Off white
      [184, 181, 185], // Light gray
      [134, 129, 136], // Medium gray
      [100, 99, 101],  // Dark gray
      [69, 68, 79],    // Very dark gray
      [58, 56, 88],    // Dark purple
      [33, 33, 35],    // Almost black
      [53, 43, 66],    // Dark purple
      [67, 67, 106],   // Blue-purple
      [75, 128, 202],  // Blue
      [104, 194, 211], // Light blue
      [162, 220, 199], // Light cyan
      [237, 225, 158], // Light yellow
      [211, 160, 104], // Orange
      [180, 82, 82],   // Red
      [106, 83, 110],  // Purple-gray
      [75, 65, 88],    // Dark purple
      [128, 73, 58],   // Brown
      [167, 123, 91],  // Light brown
      [229, 206, 180], // Beige
      [194, 211, 104], // Yellow-green
      [138, 176, 96],  // Green
      [86, 123, 121],  // Blue-green
      [78, 88, 74],    // Dark green
      [123, 114, 67],  // Olive
      [178, 180, 126], // Light olive
      [237, 200, 196], // Light pink
      [207, 138, 203], // Pink
      [95, 85, 106]    // Gray-purple
    ]
  },
  {
    name: 'Vinik24',
    description: 'Soft pastel take on the Super Game Boy palette by Vinik',
    colors: [
      [0, 0, 0],       // Black
      [111, 103, 118], // Gray-purple
      [154, 154, 151], // Light gray
      [197, 204, 184], // Light green-gray
      [139, 85, 128],  // Purple
      [195, 136, 144], // Pink
      [165, 147, 165], // Light purple
      [102, 96, 146],  // Blue-purple
      [154, 79, 80],   // Red
      [194, 141, 117], // Orange
      [124, 161, 192], // Light blue
      [65, 106, 163],  // Blue
      [141, 98, 104],  // Brown-red
      [190, 149, 92],  // Yellow-brown
      [104, 172, 169], // Cyan
      [56, 112, 128],  // Dark cyan
      [110, 105, 98],  // Brown-gray
      [147, 161, 103], // Yellow-green
      [110, 170, 120], // Green
      [85, 112, 100],  // Dark green
      [157, 159, 127], // Light olive
      [126, 158, 153], // Light blue-green
      [93, 104, 114],  // Blue-gray
      [67, 52, 85]     // Dark purple
    ]
  },
  {
    name: 'Resurrect 64',
    description: 'Comprehensive 64-color palette for detailed pixel art',
    colors: [
      [46, 34, 47],    // Very dark purple
      [62, 53, 70],    // Dark purple
      [98, 85, 101],   // Purple-gray
      [150, 108, 108], // Dusty pink
      [171, 148, 122], // Light brown
      [105, 79, 98],   // Dark purple-pink
      [127, 112, 138], // Light purple
      [155, 171, 178], // Light blue-gray
      [199, 220, 208], // Very light green
      [255, 255, 255], // White
      [110, 39, 39],   // Dark red
      [179, 56, 49],   // Red
      [234, 79, 54],   // Bright red
      [245, 125, 74],  // Orange
      [174, 35, 52],   // Dark red-pink
      [232, 59, 59],   // Bright red
      [251, 107, 29],  // Orange
      [247, 150, 23],  // Yellow-orange
      [249, 194, 43],  // Yellow
      [122, 48, 69],   // Dark pink
      [158, 69, 57],   // Brown-red
      [205, 104, 61],  // Brown
      [230, 144, 78],  // Light brown
      [251, 185, 84],  // Light yellow
      [76, 62, 36],    // Very dark brown
      [103, 102, 51],  // Olive
      [162, 169, 71],  // Yellow-green
      [213, 224, 75],  // Light green
      [251, 255, 134], // Very light yellow
      [22, 90, 76],    // Dark teal
      [35, 144, 99],   // Teal
      [30, 188, 115],  // Green
      [145, 219, 105], // Light green
      [205, 223, 108], // Very light green
      [49, 54, 56],    // Very dark gray
      [55, 78, 74],    // Dark blue-gray
      [84, 126, 100],  // Green-gray
      [146, 169, 132], // Light green-gray
      [178, 186, 144], // Very light green-gray
      [11, 94, 101],   // Dark cyan
      [11, 138, 143],  // Cyan
      [14, 175, 155],  // Light cyan
      [48, 225, 185],  // Bright cyan
      [143, 248, 226], // Very light cyan
      [50, 41, 83],    // Dark blue
      [72, 74, 119],   // Blue
      [77, 101, 180],  // Bright blue
      [77, 155, 230],  // Light blue
      [143, 211, 255], // Very light blue
      [69, 41, 63],    // Dark purple
      [107, 62, 117],  // Purple
      [144, 94, 169],  // Light purple
      [168, 132, 243], // Bright purple
      [234, 173, 237], // Very light purple
      [117, 60, 84],   // Dark pink
      [162, 75, 111],  // Pink
      [207, 101, 127], // Light pink
      [237, 128, 153], // Very light pink
      [131, 28, 93],   // Dark magenta
      [195, 36, 84],   // Magenta
      [240, 79, 120],  // Bright pink
      [246, 129, 129], // Light pink
      [252, 167, 144]  // Very light orange
    ]
  }
]

/**
 * Find the nearest color in a palette
 */
export function findNearestColorInPalette(
  pixel: number[],
  palette: number[][]
): number[] {
  let minDistance = Infinity
  let nearestColor = palette[0]

  for (const color of palette) {
    let distance = 0
    for (let i = 0; i < 3; i++) {
      const diff = pixel[i] - color[i]
      distance += diff * diff
    }

    if (distance < minDistance) {
      minDistance = distance
      nearestColor = color
    }
  }

  return [...nearestColor]
}

/**
 * Convert color values to CSS hex format
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map(x => Math.round(x).toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * Get palette by name
 */
export function getPaletteByName(name: string): ColorPalette | undefined {
  return PREDEFINED_PALETTES.find(p => p.name === name)
}