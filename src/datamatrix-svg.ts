/**
 * DataMatrix SVG Generator
 * 
 * A TypeScript library for generating DataMatrix 2D barcodes as SVG elements.
 * Supports ECC 200 encoding with automatic mode selection for optimal data density.
 * 
 * @packageDocumentation
 * @module datamatrix-svg-ts
 * @license MIT
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
import type { DataMatrixResult, EncodeOptions } from './encoder.js';
import { matrixToSvg, matrixToSvgString } from './svg-renderer.js';
import type { SvgOptions } from './svg-renderer.js';

// ============================================================================
// Re-export Types
// ============================================================================

export type { DataMatrixResult, EncodeOptions, MessageEncoding } from './encoder.js';
export { DataMatrixError, type DataMatrixErrorCode } from './encoder.js';
export type { NamedColor, Palette, SvgColor, SvgOptions } from './svg-renderer.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for DataMatrix generation: the message plus
 * encoding options ({@link EncodeOptions}) and SVG options ({@link SvgOptions})
 */
export interface DataMatrixOptions extends EncodeOptions, SvgOptions {
  /** The message to encode */
  message: string;
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
 * console.log(result.matrix[y][x]); // 1 = dark, 0 = light
 *
 * @example
 * // Rectangular symbol, Latin-1 text with an ECI designator
 * const result = encodeToMatrix('Äiti', { rectangular: true, encoding: 'iso-8859-1', eci: true });
 *
 * @param message - The text message to encode
 * @param options - Encoding options
 * @returns DataMatrixResult containing the pixel matrix and dimensions
 * @throws {DataMatrixError} code='EMPTY_MESSAGE' - When message is empty and allowEmptyMessage is false
 * @throws {DataMatrixError} code='MESSAGE_TOO_LONG' - When the message does not fit in the largest (144x144) symbol
 * @throws {DataMatrixError} code='UNSUPPORTED_CHARACTER' - When a character is outside the chosen encoding
 */
export function encodeToMatrix(message: string, options?: EncodeOptions): DataMatrixResult;
/**
 * @deprecated Pass an options object: `encodeToMatrix(message, { rectangular, allowEmptyMessage })`
 */
export function encodeToMatrix(message: string, useRectangular?: boolean, allowEmptyMessage?: boolean): DataMatrixResult;
export function encodeToMatrix(
  message: string,
  optionsOrRectangular?: EncodeOptions | boolean,
  allowEmptyMessage?: boolean
): DataMatrixResult {
  const options: EncodeOptions = typeof optionsOrRectangular === 'object' && optionsOrRectangular !== null
    ? optionsOrRectangular
    : { rectangular: optionsOrRectangular, allowEmptyMessage };
  return encodeMessage(message, options);
}

// Re-export the renderers directly from svg-renderer
export { matrixToSvg, matrixToSvgString };

/** Normalizes DATAMatrix()/toSvgString() arguments */
function toOptions(options: DataMatrixOptions | string): DataMatrixOptions {
  return ('string' == typeof options) ? { message: options } : options || { message: '' };
}

/** Encodes the message of DATAMatrix()/toSvgString() options */
function encodeOptions(opts: DataMatrixOptions): DataMatrixResult {
  return encodeMessage(opts.message || '', {
    rectangular: opts.rectangular,
    allowEmptyMessage: opts.allowEmptyMessage,
    encoding: opts.encoding,
    eci: opts.eci
  });
}

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
 * @throws {DataMatrixError} code='MESSAGE_TOO_LONG' - When the message does not fit in the largest (144x144) symbol
 * @throws {DataMatrixError} code='UNSUPPORTED_CHARACTER' - When a character is outside the chosen encoding
 */
export function DATAMatrix(options: DataMatrixOptions | string): SVGSVGElement {
  const opts = toOptions(options);
  return matrixToSvg(encodeOptions(opts), opts);
}

/**
 * Generates a DataMatrix 2D barcode as SVG markup, without a DOM
 *
 * Same options and output as `DATAMatrix(...).outerHTML`, but works in any
 * JavaScript runtime: server-side rendering, Node.js scripts, workers.
 *
 * @example
 * // React without refs or effects
 * <span dangerouslySetInnerHTML={{ __html: toSvgString({ message: code, padding: 1 }) }} />
 *
 * @example
 * // Write a file in Node.js
 * writeFileSync('code.svg', toSvgString('Hello World!'));
 *
 * @param options - Configuration options or just a string message
 * @returns SVG markup
 * @throws {DataMatrixError} Same as DATAMatrix()
 */
export function toSvgString(options: DataMatrixOptions | string): string {
  const opts = toOptions(options);
  return matrixToSvgString(encodeOptions(opts), opts);
}

export default DATAMatrix;
