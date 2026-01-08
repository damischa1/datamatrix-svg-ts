/**
 * SVG Renderer for DataMatrix barcodes
 * 
 * This module handles the conversion of DataMatrix matrices to SVG elements.
 * It supports customizable colors, dimensions, padding, and output optimization.
 * 
 * @module svg-renderer
 */

import type { DataMatrixResult } from './encoder';

// ============================================================================
// Types
// ============================================================================

/**
 * Named CSS colors supported by SVG (partial list)
 */
export type NamedColor =
  | 'black' | 'white' | 'red' | 'green' | 'blue' | 'yellow' | 'cyan' | 'magenta'
  | 'gray' | 'grey' | 'silver' | 'maroon' | 'olive' | 'navy' | 'purple' | 'teal'
  | 'aqua' | 'fuchsia' | 'lime' | 'orange' | 'pink' | 'brown' | 'transparent';

/**
 * SVG-compatible color values
 * Supports all standard SVG/CSS color formats:
 * - Hex: #RGB, #RRGGBB
 * - RGB: rgb(r, g, b), rgba(r, g, b, a)
 * - HSL: hsl(h, s%, l%), hsla(h, s%, l%, a)
 * - Named colors: black, white, red, etc.
 * - Special: currentColor, inherit, none, transparent
 * - URL references: url(#gradient-id)
 */
export type SvgColor =
  | `#${string}`              // Hex colors
  | `rgb(${string})`          // RGB function
  | `rgba(${string})`         // RGBA function
  | `hsl(${string})`          // HSL function
  | `hsla(${string})`         // HSLA function
  | `url(${string})`          // URL references (gradients, patterns)
  | 'currentColor'            // Inherits from CSS color property
  | 'inherit'                 // Inherits from parent
  | 'none'                    // No color (transparent)
  | NamedColor;               // CSS named colors

/**
 * Color palette for the barcode
 */
export interface Palette {
  /** Color for data modules (dark cells). Default: '#000' */
  foreground?: SvgColor;
  /** Color for background (light cells). Default: transparent (no background) */
  background?: SvgColor;
}

/**
 * SVG rendering options
 */
export interface SvgOptions {
  /** Output height in pixels. Default: 256 */
  dimension?: number;
  /** Quiet zone padding in modules. Default: 2 */
  padding?: number;
  /** Color palette for foreground and background */
  palette?: Palette;
  /** Use verbose SVG output (one rect per module vs optimized paths). Default: false */
  verbose?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** CSS named colors supported by SVG */
const CSS_NAMED_COLORS = new Set([
  // Basic colors
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
  'gray', 'grey', 'silver', 'maroon', 'olive', 'navy', 'purple', 'teal', 'aqua',
  'fuchsia', 'lime', 'orange', 'pink', 'brown', 'transparent',
  // Extended colors (most common)
  'aliceblue', 'antiquewhite', 'aquamarine', 'azure', 'beige', 'bisque',
  'blanchedalmond', 'blueviolet', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'darkblue',
  'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
  'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey',
  'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey',
  'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'greenyellow', 'honeydew', 'hotpink',
  'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush',
  'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink',
  'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey',
  'lightsteelblue', 'lightyellow', 'limegreen', 'linen', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
  'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'oldlace', 'olivedrab',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
  'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'plum', 'powderblue',
  'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen',
  'seashell', 'sienna', 'skyblue', 'slateblue', 'slategray', 'slategrey',
  'snow', 'springgreen', 'steelblue', 'tan', 'thistle', 'tomato', 'turquoise',
  'violet', 'wheat', 'whitesmoke', 'yellowgreen'
]);

// ============================================================================
// Color Validation
// ============================================================================

/**
 * Validates SVG-compatible color values
 * Supports: hex (#RGB, #RRGGBB), rgb(), rgba(), hsl(), hsla(), named colors,
 * currentColor, inherit, none, and url() references
 * 
 * @param color - Color string to validate
 * @returns true if the color is valid for SVG
 */
function isValidSvgColor(color: string): boolean {
  const trimmed = color.trim().toLowerCase();
  
  // Hex colors: #RGB or #RRGGBB
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) {
    return true;
  }
  
  // rgb() and rgba()
  if (/^rgba?\s*\(/.test(trimmed)) {
    return true;
  }
  
  // hsl() and hsla()
  if (/^hsla?\s*\(/.test(trimmed)) {
    return true;
  }
  
  // Special SVG/CSS values
  if (['currentcolor', 'inherit', 'none', 'transparent'].includes(trimmed)) {
    return true;
  }
  
  // URL references (gradients, patterns)
  if (/^url\s*\(/.test(trimmed)) {
    return true;
  }
  
  // Named colors
  if (CSS_NAMED_COLORS.has(trimmed)) {
    return true;
  }
  
  return false;
}

/**
 * Resolves and validates color from palette
 * 
 * @param color - Color string to validate (hex, rgb, hsl, named, currentColor, etc.)
 * @param defaultColor - Default color if invalid or undefined
 * @returns Valid SVG color or default
 */
function resolveColor(color: string | undefined, defaultColor: string | null): string | null {
  if (color && isValidSvgColor(color)) {
    return color;
  }
  return defaultColor;
}

// ============================================================================
// SVG Element Creation
// ============================================================================

/**
 * Creates an SVG element with specified attributes
 * @typeParam T - The specific SVG element type
 * @param tagName - SVG element tag name
 * @param attributes - Key-value pairs for element attributes
 * @returns Created SVG element
 */
function createSvgElement<T extends SVGElement = SVGElement>(
  tagName: string, 
  attributes?: Record<string, string | number>
): T {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);

  for (const attrName in attributes || {}) {
    element.setAttribute(attrName, String(attributes![attrName]));
  }

  return element as T;
}

// ============================================================================
// Path Generation
// ============================================================================

/**
 * Generates SVG path data from the barcode matrix
 * Uses run-length encoding for optimized output
 * 
 * @param matrix - 2D array of pixel values (1 = black)
 * @param width - Matrix width
 * @param height - Matrix height
 * @param optimized - Use optimized path (horizontal runs) vs verbose (one rect per module)
 * @returns SVG path data string
 */
function generatePathData(
  matrix: number[][],
  width: number,
  height: number,
  optimized: boolean
): string {
  let pathData = '';
  let currentY = height;

  while (currentY--) {
    let runLength = 0;
    let currentX = width;

    while (currentX--) {
      if (matrix[currentY] && matrix[currentY][currentX]) {
        if (optimized) {
          // Accumulate horizontal runs for optimized output
          runLength++;

          if (!matrix[currentY][currentX - 1]) {
            // End of run - output rectangle
            pathData += 'M' + currentX + ',' + currentY + 'h' + runLength + 'v1h-' + runLength + 'v-1z';
            runLength = 0;
          }
        } else {
          // Verbose mode - one rectangle per module
          pathData += 'M' + currentX + ',' + currentY + 'h1v1h-1v-1z';
        }
      }
    }
  }

  return pathData;
}

// ============================================================================
// SVG Component Creation
// ============================================================================

/**
 * Creates the root SVG element with proper attributes
 * 
 * @param svgWidth - Total SVG width including padding
 * @param svgHeight - Total SVG height including padding
 * @param pixelDimension - Output dimension in pixels
 * @param foregroundColor - Fill color for modules
 * @returns SVG root element
 */
function createSvgRoot(
  svgWidth: number,
  svgHeight: number,
  pixelDimension: number,
  foregroundColor: string
): SVGSVGElement {
  return createSvgElement<SVGSVGElement>('svg', {
    'viewBox': [0, 0, svgWidth, svgHeight].join(' '),
    'width': pixelDimension / svgHeight * svgWidth | 0,
    'height': pixelDimension,
    'fill': foregroundColor,
    'shape-rendering': 'crispEdges',
    'xmlns': SVG_NAMESPACE,
    'version': '1.1'
  });
}

/**
 * Creates a background rectangle path element
 * 
 * @param svgWidth - Total SVG width
 * @param svgHeight - Total SVG height
 * @param backgroundColor - Background fill color
 * @returns SVG path element for background
 */
function createBackgroundPath(svgWidth: number, svgHeight: number, backgroundColor: string): SVGPathElement {
  return createSvgElement<SVGPathElement>('path', {
    'fill': backgroundColor,
    'd': 'M0,0v' + svgHeight + 'h' + svgWidth + 'V0H0Z'
  });
}

/**
 * Creates the barcode path element with transformation
 * 
 * @param pathData - SVG path data string
 * @param padding - Padding offset for transform
 * @returns SVG path element for barcode
 */
function createBarcodePath(pathData: string, padding: number): SVGPathElement {
  const transformMatrix = [1, 0, 0, 1, padding, padding];
  return createSvgElement<SVGPathElement>('path', {
    'transform': 'matrix(' + transformMatrix + ')',
    'd': pathData
  });
}

// ============================================================================
// Main Rendering Function
// ============================================================================

/**
 * Converts a DataMatrix pixel matrix to an SVG element
 * 
 * This function takes the matrix result from encodeMessage() and renders it
 * as an SVG element with customizable styling options.
 *
 * @example
 * // Basic usage
 * import { encodeMessage } from './encoder';
 * const matrixResult = encodeMessage('Hello World!');
 * const svg = matrixToSvg(matrixResult);
 *
 * @example
 * // With custom options
 * const svg = matrixToSvg(matrixResult, {
 *   dimension: 512,
 *   padding: 4,
 *   palette: { foreground: '#000000', background: '#ffffff' }
 * });
 *
 * @param matrixResult - The result from encodeMessage()
 * @param options - SVG rendering options
 * @returns SVG element containing the DataMatrix barcode
 */
export function matrixToSvg(matrixResult: DataMatrixResult, options?: SvgOptions): SVGSVGElement {
  const opts = options || {};
  const { matrix, width: matrixWidth, height: matrixHeight } = matrixResult;
  
  // Parse options with defaults
  const palette = opts.palette || {};
  const dimension = Math.abs(opts.dimension!) || 256;
  let padding = Math.abs(opts.padding!);
  padding = (padding > -1) ? padding : 2;
  const useOptimizedPath = !opts.verbose;

  // Resolve colors
  const foregroundColor = resolveColor(palette.foreground, '#000')!;
  const backgroundColor = resolveColor(palette.background, null);

  // Calculate SVG dimensions
  const svgWidth = matrixWidth + padding * 2;
  const svgHeight = matrixHeight + padding * 2;

  // Generate path data from matrix
  const pathData = generatePathData(matrix, matrixWidth, matrixHeight, useOptimizedPath);

  // Create SVG structure
  const svgElement = createSvgRoot(svgWidth, svgHeight, dimension, foregroundColor);

  // Add background if specified
  if (backgroundColor) {
    svgElement.appendChild(createBackgroundPath(svgWidth, svgHeight, backgroundColor));
  }

  // Add barcode path
  svgElement.appendChild(createBarcodePath(pathData, padding));

  return svgElement;
}
