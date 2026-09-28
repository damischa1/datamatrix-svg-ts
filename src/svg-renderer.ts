/**
 * SVG Renderer for DataMatrix barcodes
 * 
 * This module handles the conversion of DataMatrix matrices to SVG elements.
 * It supports customizable colors, dimensions, padding, and output optimization.
 * 
 * @module svg-renderer
 */

import type { DataMatrixResult } from './encoder.js';

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
 * - Hex: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
 * - RGB: rgb(r, g, b), rgba(r, g, b, a)
 * - HSL: hsl(h, s%, l%), hsla(h, s%, l%, a)
 * - hwb(), lab(), lch(), oklab(), oklch(), color()
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
  | `hwb(${string})`          // HWB function
  | `lab(${string})`          // CIE Lab
  | `lch(${string})`          // CIE LCH
  | `oklab(${string})`        // Oklab
  | `oklch(${string})`        // Oklch
  | `color(${string})`        // color() with a color space
  | `url(${string})`          // URL references (gradients, patterns)
  | 'currentColor'            // Inherits from CSS color property
  | 'inherit'                 // Inherits from parent
  | 'none'                    // No color (transparent)
  | NamedColor;               // CSS named colors

/**
 * Color palette for the barcode. A value that is not a recognized SVG color
 * falls back to the default (black foreground, no background).
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
  /**
   * Output height in pixels; the width follows the symbol's aspect ratio.
   * Default: 256
   */
  dimension?: number;
  /** Quiet zone padding in modules (ISO/IEC 16022 requires at least 1). Default: 2 */
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
  'violet', 'wheat', 'whitesmoke', 'yellowgreen', 'rebeccapurple'
]);

// ============================================================================
// Color Validation
// ============================================================================

/**
 * Validates SVG-compatible color values
 * Supports: hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA), CSS color functions (rgb, hsl,
 * hwb, lab, lch, oklab, oklch, color), named colors, currentColor, inherit, none,
 * transparent and url() references. Function arguments are not validated.
 *
 * @param color - Color string to validate (already trimmed)
 * @returns true if the color is valid for SVG
 */
function isValidSvgColor(color: string): boolean {
  const lower = color.toLowerCase();

  return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(lower)
    || /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|url)\s*\(.*\)$/.test(lower)
    || ['currentcolor', 'inherit', 'none', 'transparent'].includes(lower)
    || CSS_NAMED_COLORS.has(lower);
}

/**
 * Resolves and validates color from palette
 * 
 * @param color - Color string to validate (hex, rgb, hsl, named, currentColor, etc.)
 * @param defaultColor - Default color if invalid or undefined
 * @returns Valid SVG color (trimmed) or default
 */
function resolveColor(color: string | undefined, defaultColor: string | null): string | null {
  const trimmed = typeof color === 'string' ? color.trim() : '';
  return trimmed && isValidSvgColor(trimmed) ? trimmed : defaultColor;
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
  matrix: readonly (readonly number[])[],
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
      const row = matrix[currentY];
      if (row && row[currentX]) {
        if (optimized) {
          // Accumulate horizontal runs for optimized output
          runLength++;

          if (!row[currentX - 1]) {
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
// SVG Description
// ============================================================================

/** Attributes of one SVG element, in output order */
type Attributes = ReadonlyArray<readonly [name: string, value: string | number]>;

/** Renderer-independent description of the barcode SVG */
interface SvgDescription {
  root: Attributes;
  paths: Attributes[];
}

/**
 * Describes the SVG for a matrix: the root element and its paths.
 * Both the DOM and the string renderer are built from this, so their output matches.
 */
function describeSvg(matrixResult: DataMatrixResult, options?: SvgOptions): SvgDescription {
  const opts = options || {};
  const { matrix, width: matrixWidth, height: matrixHeight } = matrixResult;

  // Parse options with defaults; negative or non-numeric values use the default
  const palette = opts.palette || {};
  const dimension = positiveNumber(opts.dimension, 256, false);
  const padding = positiveNumber(opts.padding, 2, true);

  // Resolve colors
  const foregroundColor = resolveColor(palette.foreground, '#000')!;
  const backgroundColor = resolveColor(palette.background, null);

  // Calculate SVG dimensions
  const svgWidth = matrixWidth + padding * 2;
  const svgHeight = matrixHeight + padding * 2;

  const root: Attributes = [
    ['viewBox', [0, 0, svgWidth, svgHeight].join(' ')],
    ['width', dimension / svgHeight * svgWidth | 0],
    ['height', dimension],
    ['fill', foregroundColor],
    ['shape-rendering', 'crispEdges'],
    ['xmlns', SVG_NAMESPACE],
    ['version', '1.1']
  ];

  const paths: Attributes[] = [];

  // Background, if specified
  if (backgroundColor) {
    paths.push([
      ['fill', backgroundColor],
      ['d', 'M0,0v' + svgHeight + 'h' + svgWidth + 'V0H0Z']
    ]);
  }

  // Barcode, offset by the quiet zone
  paths.push([
    ['transform', 'matrix(' + [1, 0, 0, 1, padding, padding] + ')'],
    ['d', generatePathData(matrix, matrixWidth, matrixHeight, !opts.verbose)]
  ]);

  return { root, paths };
}

/**
 * Returns `value` if it is a finite number above zero (or zero, if allowed), else `fallback`
 */
function positiveNumber(value: number | undefined, fallback: number, allowZero: boolean): number {
  // Number() keeps numeric strings from untyped callers working
  const number = value === undefined || value === null ? NaN : Number(value);
  return Number.isFinite(number) && (number > 0 || (allowZero && number === 0)) ? number : fallback;
}

// ============================================================================
// Renderers
// ============================================================================

/** Creates an SVG element with the given attributes */
function createSvgElement<T extends SVGElement>(tagName: string, attributes: Attributes): T {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);
  for (const [name, value] of attributes) {
    element.setAttribute(name, String(value));
  }
  return element as T;
}

/** Escapes a value for use in a double-quoted XML attribute */
function escapeAttribute(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Serializes an element with the given attributes and inner markup */
function elementToString(tagName: string, attributes: Attributes, inner = ''): string {
  const attrs = attributes.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');
  return `<${tagName}${attrs}>${inner}</${tagName}>`;
}

// ============================================================================
// Main Rendering Functions
// ============================================================================

/**
 * Converts a DataMatrix pixel matrix to an SVG element
 * 
 * This function takes the matrix result from encodeToMatrix() and renders it
 * as an SVG element with customizable styling options. It needs a DOM
 * (a global `document`); use matrixToSvgString() on a server.
 *
 * @example
 * // Basic usage
 * const matrixResult = encodeToMatrix('Hello World!');
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
 * @param matrixResult - The result from encodeToMatrix()
 * @param options - SVG rendering options
 * @returns SVG element containing the DataMatrix barcode
 */
export function matrixToSvg(matrixResult: DataMatrixResult, options?: SvgOptions): SVGSVGElement {
  const { root, paths } = describeSvg(matrixResult, options);
  const svgElement = createSvgElement<SVGSVGElement>('svg', root);
  for (const path of paths) {
    svgElement.appendChild(createSvgElement<SVGPathElement>('path', path));
  }
  return svgElement;
}

/**
 * Converts a DataMatrix pixel matrix to SVG markup, without a DOM
 *
 * Produces the same markup as `matrixToSvg(...).outerHTML`. Works in any
 * JavaScript runtime: server-side rendering, Node.js scripts, workers.
 *
 * @example
 * const markup = matrixToSvgString(encodeToMatrix('Hello World!'), { dimension: 128 });
 * // '<svg viewBox="0 0 18 18" width="128" ...><path ...></path></svg>'
 *
 * @param matrixResult - The result from encodeToMatrix()
 * @param options - SVG rendering options
 * @returns SVG markup
 */
export function matrixToSvgString(matrixResult: DataMatrixResult, options?: SvgOptions): string {
  const { root, paths } = describeSvg(matrixResult, options);
  return elementToString('svg', root, paths.map((path) => elementToString('path', path)).join(''));
}
