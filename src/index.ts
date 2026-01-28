/**
 * datamatrix-svg-ts
 * 
 * TypeScript implementation based on:
 * https://github.com/datalog/datamatrix-svg
 * by Constantine (MIT License)
 */

export {
  DATAMatrix,
  encodeToMatrix,
  matrixToSvg,
  type DataMatrixOptions,
  type DataMatrixResult,
  type SvgOptions,
  type Palette,
  type SvgColor,
  type NamedColor
} from './datamatrix-svg.js';

export { DataMatrixError, type DataMatrixErrorCode } from './encoder.js';

export { DATAMatrix as default } from './datamatrix-svg.js';
