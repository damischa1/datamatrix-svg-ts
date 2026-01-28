/**
 * DataMatrix SVG Generator
 * 
 * A TypeScript library for generating DataMatrix 2D barcodes as SVG elements.
 * Supports ECC 200 encoding with automatic mode selection for optimal data density.
 * 
 * @packageDocumentation
 * @module datamatrix-svg-ts
 * @version 1.0.0
 * @license ISC
 * 
 * @example
 * // Simple usage with just a message
 * import { DATAMatrix } from 'datamatrix-svg-ts';
 * const svg = DATAMatrix('Hello World!');
 * document.body.appendChild(svg);
 * 
 * @example
 * // With configuration options
 * import { DATAMatrix } from 'datamatrix-svg-ts';
 * const svg = DATAMatrix({
 *   message: "Your message here",
 *   dimension: 256,
 *   rectangular: false,
 *   padding: 2,
 *   palette: { foreground: "#000000", background: "#ffffff" }
 * });
 * 
 * @example
 * // Two-step generation for more control
 * import { encodeToMatrix, matrixToSvg } from 'datamatrix-svg-ts';
 * const matrixResult = encodeToMatrix('Hello World!');
 * const svg = matrixToSvg(matrixResult, { dimension: 512 });
 */

import { encodeMessage } from './encoder.js';
import type { DataMatrixResult } from './encoder.js';
import { matrixToSvg } from './svg-renderer.js';
import type { Palette } from './svg-renderer.js';

// ============================================================================
// Re-export Types
// ============================================================================

export type { DataMatrixResult } from './encoder.js';
export { DataMatrixError, type DataMatrixErrorCode } from './encoder.js';
export type { NamedColor, Palette, SvgColor, SvgOptions } from './svg-renderer.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for DataMatrix generation
 */
export interface DataMatrixOptions {
  /** The message to encode */
  message: string;
  /** Output height in pixels. Default: 256 */
  dimension?: number;
  /** Use rectangular format instead of square. Default: false */
  rectangular?: boolean;
  /** Quiet zone padding in modules. Default: 2 */
  padding?: number;
  /** Color palette for foreground and background */
  palette?: Palette;
  /** Use verbose SVG output. Default: false */
  verbose?: boolean;
  /** Allow empty message. Default: false */
  allowEmptyMessage?: boolean;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Encodes a message into a DataMatrix pixel matrix
 * 
 * This is the first step in generating a DataMatrix barcode.
 * The resulting matrix can be rendered to SVG using matrixToSvg(),
 * or used with other rendering methods (Canvas, PNG, etc.)
 *
 * @example
 * // Get the raw matrix data
 * const result = encodeToMatrix('Hello World!');
 * console.log(result.width, result.height); // dimensions in modules
 * console.log(result.matrix[y][x]); // 1 = black, 0/undefined = white
 *
 * @example
 * // For rectangular symbols
 * const result = encodeToMatrix('ABC123', true);
 *
 * @param message - The text message to encode
 * @param useRectangular - Use rectangular format instead of square (default: false)
 * @param allowEmptyMessage - Allow empty message without throwing error (default: false)
 * @returns DataMatrixResult containing the pixel matrix and dimensions
 * @throws {DataMatrixError} code='EMPTY_MESSAGE' - When message is empty and allowEmptyMessage is false
 * @throws {DataMatrixError} code='MESSAGE_TOO_LONG' - When encoded message exceeds DataMatrix capacity (~1556 bytes max)
 */
export function encodeToMatrix(message: string, useRectangular?: boolean, allowEmptyMessage?: boolean): DataMatrixResult {
  return encodeMessage(message, useRectangular, allowEmptyMessage);
}

// Re-export matrixToSvg directly from svg-renderer
export { matrixToSvg };

/**
 * Generates a DataMatrix 2D barcode as an SVG element (convenience function)
 *
 * This combines encodeToMatrix() and matrixToSvg() into a single call.
 * For more control, use those functions separately.
 *
 * @example
 * // Simple usage with just a message
 * const svg = DATAMatrix('Hello World!');
 *
 * @example
 * // With options
 * const svg = DATAMatrix({
 *   message: "Your message",
 *   dimension: 256,
 *   rectangular: false,
 *   padding: 2,
 *   palette: { foreground: "#000000", background: "#f2f4f8" },
 *   verbose: false
 * });
 *
 * @param options - Configuration options or just a string message
 * @returns SVG element containing the DataMatrix barcode
 * @throws {DataMatrixError} code='EMPTY_MESSAGE' - When message is empty and allowEmptyMessage is false
 * @throws {DataMatrixError} code='MESSAGE_TOO_LONG' - When encoded message exceeds DataMatrix capacity (~1556 bytes max)
 */
export function DATAMatrix(options: DataMatrixOptions | string): SVGSVGElement {
  // Parse options
  const opts: DataMatrixOptions = ('string' == typeof options) ? { message: options } : options || {};
  
  // Generate the barcode matrix
  const matrixResult = encodeToMatrix(opts.message || '', opts.rectangular, opts.allowEmptyMessage);
  
  // Convert to SVG with the same options
  return matrixToSvg(matrixResult, {
    dimension: opts.dimension,
    padding: opts.padding,
    palette: opts.palette,
    verbose: opts.verbose
  });
}

export default DATAMatrix;
