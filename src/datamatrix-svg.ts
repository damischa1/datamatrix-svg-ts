/**
 * DataMatrix SVG Generator
 * 
 * TypeScript port of:
 * https://github.com/datalog/datamatrix-svg
 * under MIT license
 * # datamatrix.js has no dependencies
 * Copyright (c) 2020 Constantine
 * 
 * Original JavaScript file kept as reference: datamatrix.js
 */

'use strict';

// ============================================================================
// Types
// ============================================================================

/** Configuration options for DataMatrix generation */
export interface DataMatrixOptions {
  /** Message to encode in the DataMatrix */
  msg?: string;
  /** Use rectangular format instead of square */
  rct?: boolean;
  /** Output dimension in pixels (default: 256) */
  dim?: number;
  /** Padding around the barcode (default: 2) */
  pad?: number;
  /** Color palette: [foreground, background?] */
  pal?: string[];
  /** Verbose mode - generates non-optimized SVG paths */
  vrb?: boolean;
}

/** Result from encoding a message into a matrix */
export interface DataMatrixResult {
  /** 2D matrix of the barcode (1 = black, 0/undefined = white) */
  matrix: number[][];
  /** Matrix width in modules */
  width: number;
  /** Matrix height in modules */
  height: number;
}

/** Options for SVG generation from matrix */
export interface SvgOptions {
  /** Output dimension in pixels (default: 256) */
  dim?: number;
  /** Padding around the barcode (default: 2) */
  pad?: number;
  /** Color palette: [foreground, background?] */
  pal?: string[];
  /** Verbose mode - generates non-optimized SVG paths */
  vrb?: boolean;
}

/** Symbol size parameters calculated for the data */
interface SymbolSize {
  /** Symbol width in modules */
  symbolWidth: number;
  /** Symbol height in modules */
  symbolHeight: number;
  /** Number of column regions (for large symbols) */
  numColRegions: number;
  /** Number of row regions (for large symbols) */
  numRowRegions: number;
  /** Width of each region */
  regionWidth: number;
  /** Height of each region */
  regionHeight: number;
  /** Total data capacity in codewords */
  totalCodewords: number;
  /** Number of Reed-Solomon check codewords */
  rsCheckwords: number;
  /** Number of interleaved blocks for RS */
  numBlocks: number;
}

// ============================================================================
// Constants
// ============================================================================

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** C40 encoding table - optimized for uppercase alphanumeric */
const C40_TABLE = [
  230,        // Mode switch codeword
  31, 0, 0,   // Set 0: ASCII 0-31
  32, 9, 29,  // Space (value 3 in basic set)
  47, 1, 33,  // Set 1: !"#$%&'()*+,-./
  57, 9, 44,  // Digits 0-9 (values 4-13 in basic set)
  64, 1, 43,  // Set 1: :;<=>?@
  90, 9, 51,  // Uppercase A-Z (values 14-39 in basic set)
  95, 1, 69,  // Set 1: [\]^_
  127, 2, 96, // Set 2: lowercase a-z and others
  255, 1, 0   // Extended ASCII
];

/** TEXT encoding table - optimized for lowercase alphanumeric */
const TEXT_TABLE = [
  239,        // Mode switch codeword
  31, 0, 0,
  32, 9, 29,
  47, 1, 33,
  57, 9, 44,
  64, 1, 43,
  90, 2, 64,  // Uppercase in Set 2
  95, 1, 69,
  122, 9, 83, // Lowercase a-z in basic set
  127, 2, 96,
  255, 1, 0
];

/** X12 encoding table - for ANSI X12 EDI data */
const X12_TABLE = [
  238,         // Mode switch codeword
  12, 8, 0,    // Invalid chars 0-12
  13, 9, 13,   // CR (carriage return)
  31, 8, 0,    // Invalid
  32, 9, 29,   // Space
  41, 8, 0,    // Invalid
  42, 9, 41,   // Asterisk
  47, 8, 0,    // Invalid
  57, 9, 44,   // Digits 0-9
  64, 8, 0,    // Invalid
  90, 9, 51,   // Uppercase A-Z
  255, 8, 0    // Invalid
];

/** RS checkwords for rectangular symbols [width, checkwords] pairs */
const RECTANGULAR_SIZES = [
  16, 7,
  28, 11,
  24, 14,
  32, 18,
  32, 24,
  44, 28
];

/** RS checkwords for each square symbol size */
const SQUARE_RS_CHECKWORDS = [
  5, 7, 10, 12, 14, 18, 20, 24, 28, 36, 42, 48,
  56, 68, 84, 112, 144, 192, 224, 272, 336, 408, 496, 620
];

/** Nominal L-shaped module placement pattern (relative coordinates) */
const NOMINAL_PATTERN: number[] = [
  0, 0,
  -1, 0,
  -2, 0,
  0, -1,
  -1, -1,
  -2, -1,
  -1, -2,
  -2, -2
];

// ============================================================================
// Helper Functions (Private - not exported)
// ============================================================================

/**
 * Validates hex color format (#RGB or #RRGGBB)
 */
function isValidHexColor(color: string): boolean {
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color);
}

/**
 * Creates an SVG element with specified attributes
 */
function createSvgElement(tagName: string, attributes?: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);

  for (const attrName in attributes || {}) {
    element.setAttribute(attrName, String(attributes![attrName]));
  }

  return element;
}

// ============================================================================
// SVG Generation Functions (Private - not exported)
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
  return createSvgElement('svg', {
    'viewBox': [0, 0, svgWidth, svgHeight].join(' '),
    'width': pixelDimension / svgHeight * svgWidth | 0,
    'height': pixelDimension,
    'fill': foregroundColor,
    'shape-rendering': 'crispEdges',
    'xmlns': SVG_NAMESPACE,
    'version': '1.1'
  }) as SVGSVGElement;
}

/**
 * Creates a background rectangle path element
 * 
 * @param svgWidth - Total SVG width
 * @param svgHeight - Total SVG height
 * @param backgroundColor - Background fill color
 * @returns SVG path element for background
 */
function createBackgroundPath(svgWidth: number, svgHeight: number, backgroundColor: string): SVGElement {
  return createSvgElement('path', {
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
function createBarcodePath(pathData: string, padding: number): SVGElement {
  const transformMatrix = [1, 0, 0, 1, padding, padding];
  return createSvgElement('path', {
    'transform': 'matrix(' + transformMatrix + ')',
    'd': pathData
  });
}

/**
 * Resolves and validates color from palette
 * 
 * @param color - Color string to validate
 * @param defaultColor - Default color if invalid
 * @returns Valid hex color or default
 */
function resolveColor(color: string | undefined, defaultColor: string | null): string | null {
  if (color && isValidHexColor(color)) {
    return color;
  }
  return defaultColor;
}

// ============================================================================
// Encoding Functions (Private - not exported)
// ============================================================================

/**
 * Encodes text using ASCII encoding mode
 * ASCII mode is efficient for ASCII characters and pairs of digits
 * @param text - Input text to encode
 * @returns Array of codewords
 */
function encodeAscii(text: string): number[] {
  const codewords: number[] = [];
  const textLength = text.length;

  for (let i = 0; i < textLength; i++) {
    const charCode = text.charCodeAt(i);
    const nextCharCode = (i + 1 < textLength) ? text.charCodeAt(i + 1) : 0;

    // Check if current and next characters are both digits (0-9)
    if (charCode > 47 && charCode < 58 && nextCharCode > 47 && nextCharCode < 58) {
      // Encode digit pair: (d1 * 10 + d2) + 130
      // Optimization: -48 converts ASCII to digit, +130 for encoding = net +82
      codewords.push((charCode - 48) * 10 + nextCharCode + 82);
      i++; // Skip next character (already encoded)
    } else if (charCode > 127) {
      // Extended ASCII character (128-255)
      // Use Upper Shift (235) followed by character - 127
      codewords.push(235);
      codewords.push((charCode - 127) & 255);
    } else {
      // Regular ASCII character: charCode + 1
      codewords.push(charCode + 1);
    }
  }

  return codewords;
}

/**
 * Encodes text using Base 256 encoding mode
 * Base 256 mode is efficient for binary/byte data
 * @param text - Input text to encode
 * @returns Array of codewords
 */
function encodeBase256(text: string): number[] {
  const textLength = text.length;
  
  // Build header: mode switch + length encoding
  const header: number[] = [231]; // Switch to Base 256 mode
  
  // Length encoding with 255-state randomizing algorithm
  if (textLength > 250) {
    // High byte for lengths > 250
    header.push((37 + Math.floor(textLength / 250)) & 255);
  }
  // Low byte (always present) - position-dependent randomization
  const lowBytePosition = header.length + 1;
  header.push((textLength % 250 + 149 * lowBytePosition % 255 + 1) & 255);

  // Encode each byte with 255-state randomizing algorithm
  const startPosition = header.length + 1;
  const encodedBytes = Array.from(text, (char, i) => 
    (char.charCodeAt(0) + 149 * (startPosition + i) % 255 + 1) & 255
  );

  return [...header, ...encodedBytes];
}

/**
 * Encodes text using EDIFACT encoding mode
 * EDIFACT mode packs 4 characters into 3 codewords (6 bits per char)
 * Valid characters: ASCII 32-94
 * @param text - Input text to encode
 * @returns Array of codewords, or empty array if encoding fails
 */
function encodeEdifact(text: string): number[] {
  const textLength = text.length;
  const alignedLength = (textLength + 1) & -4; // Round up to multiple of 4
  let codewordAccumulator = 0;
  let charCode: number;
  const codewords: number[] = (alignedLength > 0) ? [240] : []; // Switch to EDIFACT mode

  for (let i = 0; i < alignedLength; i++) {
    if (i < alignedLength - 1) {
      charCode = text.charCodeAt(i);
      // EDIFACT only supports ASCII 32-94
      if (charCode < 32 || charCode > 94) return [];
    } else {
      charCode = 31; // Return to ASCII codeword
    }

    // Pack 6 bits into accumulator
    codewordAccumulator = codewordAccumulator * 64 + (charCode & 63);

    // Every 4 characters, output 3 codewords
    if ((i & 3) == 3) {
      codewords.push(codewordAccumulator >> 16);
      codewords.push((codewordAccumulator >> 8) & 255);
      codewords.push(codewordAccumulator & 255);
      codewordAccumulator = 0;
    }
  }

  // Handle remaining characters with ASCII encoding
  return alignedLength > textLength
    ? codewords
    : codewords.concat(encodeAscii(text.substr(alignedLength == 0 ? 0 : alignedLength - 1)));
}

/**
 * Encodes text using C40, TEXT, or X12 encoding modes
 * These modes pack 3 characters into 2 codewords
 * @param text - Input text to encode
 * @param encodingTable - Character set definition table
 * @returns Array of codewords, or empty array if encoding fails
 */
function encodeTextMode(text: string, encodingTable: number[]): number[] {
  let i: number;
  let tableIndex: number;
  let charCount = 0;      // Characters packed (0-2)
  let codewordValue = 0;  // Accumulated value for packing
  const textLength = text.length;
  const codewords: number[] = [encodingTable[0]]; // Mode switch codeword

  /**
   * Packs a value into the codeword accumulator
   * Every 3 values produce 2 codewords
   */
  const packValue = function(value: number): void {
    codewordValue = 40 * codewordValue + value;

    if (charCount++ == 2) {
      codewords.push(++codewordValue >> 8);
      codewords.push(codewordValue & 255);
      charCount = codewordValue = 0;
    }
  };

  for (i = 0; i < textLength; i++) {
    // Last char in ASCII mode is more efficient
    if (0 == charCount && i == textLength - 1) break;

    let charCode = text.charCodeAt(i);

    // Handle extended ASCII (128-255) - not for X12 mode (238)
    if (charCode > 127 && 238 != codewords[0]) {
      packValue(1);  // Shift to set 2
      packValue(30); // Upper Shift
      charCode -= 128;
    }

    // Find character in encoding table
    for (tableIndex = 1; charCode > encodingTable[tableIndex]; tableIndex += 3);

    const shiftValue = encodingTable[tableIndex + 1];

    // Check if character is valid in this encoding
    if (8 == shiftValue || (9 == shiftValue && 0 == charCount && i == textLength - 1)) {
      return []; // Character not in set or padding would fail
    }

    // Handle last character edge case
    if (shiftValue < 5 && charCount == 2 && i == textLength - 1) break;

    // Add shift if needed (values 0-4 are valid shifts)
    if (shiftValue < 5) packValue(shiftValue);

    // Add character value (offset from table)
    packValue(charCode - encodingTable[tableIndex + 2]);
  }

  // Add padding if needed (not for X12 mode)
  if (2 == charCount && 238 !== codewords[0]) {
    packValue(0);
  }

  codewords.push(254); // Return to ASCII mode

  // Encode remaining characters in ASCII
  if (charCount > 0 || i < textLength) {
    return codewords.concat(encodeAscii(text.substr(i - charCount)));
  }

  return codewords;
}

/**
 * Selects the most efficient encoding mode for the given text
 * Tries ASCII, C40, TEXT, X12, EDIFACT, and Base256 modes
 * @param text - UTF-8 encoded text to encode
 * @returns The most compact codeword array
 */
function selectBestEncoding(text: string): number[] {
  // Define all encoding strategies
  const encodingStrategies: Array<() => number[]> = [
    () => encodeAscii(text),
    () => encodeTextMode(text, C40_TABLE),
    () => encodeTextMode(text, TEXT_TABLE),
    () => encodeTextMode(text, X12_TABLE),
    () => encodeEdifact(text),
    () => encodeBase256(text)
  ];

  // Find the shortest valid encoding
  return encodingStrategies.reduce((best, encode) => {
    const result = encode();
    return (result.length > 0 && result.length < best.length) ? result : best;
  }, encodingStrategies[0]());
}

/**
 * Calculates the optimal symbol size for the given data length
 * @param encodedLength - Number of data codewords
 * @param useRectangular - Whether to use rectangular format
 * @returns Symbol size parameters, or null if data is too long
 */
function calculateSymbolSize(encodedLength: number, useRectangular?: boolean): SymbolSize | null {
  let symbolHeight: number;
  let symbolWidth: number;
  let numColRegions = 1;
  let numRowRegions = 1;
  let symbolIndex = -1;
  let rsCheckwords: number;
  let numBlocks = 1;
  let totalCodewords: number;

  if (useRectangular && encodedLength < 50) {
    // Find smallest rectangle that fits the data
    do {
      symbolWidth = RECTANGULAR_SIZES[++symbolIndex];
      symbolHeight = 6 + (symbolIndex & 12); // Heights: 6, 6, 6, 8, 8, 8...
      totalCodewords = symbolWidth * symbolHeight / 8;
    } while (totalCodewords - RECTANGULAR_SIZES[++symbolIndex] < encodedLength);

    rsCheckwords = RECTANGULAR_SIZES[symbolIndex];

    // Wide rectangles need 2 column regions
    if (symbolWidth > 25) numColRegions = 2;
  } else {
    // Square symbols
    symbolWidth = symbolHeight = 6;
    let sizeIncrement = 2;

    // Find smallest square that fits the data
    do {
      if (++symbolIndex == SQUARE_RS_CHECKWORDS.length) {
        return null; // Message too long
      }

      // Size increments: 2,2,2,2,4,4,4,4,4,8,8,8,8,12,12,12...
      if (symbolWidth > 11 * sizeIncrement) {
        sizeIncrement = (4 + sizeIncrement) & 12;
      }

      symbolWidth = symbolHeight += sizeIncrement;
      totalCodewords = (symbolWidth * symbolHeight) >> 3;
    } while (totalCodewords - SQUARE_RS_CHECKWORDS[symbolIndex] < encodedLength);

    rsCheckwords = SQUARE_RS_CHECKWORDS[symbolIndex];

    // Large symbols need multiple regions
    if (symbolWidth > 27) {
      numRowRegions = numColRegions = 2 * (symbolWidth / 54 | 0) + 2;
    }
    // Large symbols use multiple interleaved blocks
    if (totalCodewords > 255) {
      numBlocks = 2 * (totalCodewords >> 9) + 2;
    }
  }

  return {
    symbolWidth,
    symbolHeight,
    numColRegions,
    numRowRegions,
    regionWidth: symbolWidth / numColRegions,
    regionHeight: symbolHeight / numRowRegions,
    totalCodewords,
    rsCheckwords,
    numBlocks
  };
}

/**
 * Adds padding codewords to fill the symbol capacity
 * @param encodedData - Data codewords array (modified in place)
 * @param totalCodewords - Total symbol capacity
 * @param rsCheckwords - Number of RS check codewords
 */
function addPadding(encodedData: number[], totalCodewords: number, rsCheckwords: number): void {
  let encodedLength = encodedData.length;

  // First padding is always 129 (ASCII mode pad)
  if (encodedLength < totalCodewords - rsCheckwords) {
    encodedData[encodedLength++] = 129;
  }

  // Additional padding uses 253-state algorithm
  while (encodedLength < totalCodewords - rsCheckwords) {
    encodedData[encodedLength++] = (((149 * encodedLength) % 253) + 130) % 254;
  }
}

/**
 * Builds Galois Field GF(256) log and exp tables
 * Used for Reed-Solomon error correction calculations
 * @returns Object containing log and exp tables
 */
function buildGaloisFieldTables(): { logTable: number[], expTable: number[] } {
  const logTable = new Array(256);
  const expTable = new Array(255);

  let gfValue = 1;
  for (let i = 0; i < 255; i++) {
    expTable[i] = gfValue;
    logTable[gfValue] = i;
    gfValue *= 2;
    if (gfValue > 255) {
      gfValue ^= 301; // Reduce by primitive polynomial x^8 + x^5 + x^3 + x^2 + 1
    }
  }

  return { logTable, expTable };
}

/**
 * Builds the Reed-Solomon generator polynomial
 * @param rsPerBlock - Number of RS codewords per block
 * @param logTable - GF log table
 * @param expTable - GF exp table
 * @returns Generator polynomial coefficients
 */
function buildRsGeneratorPolynomial(
  rsPerBlock: number,
  logTable: number[],
  expTable: number[]
): number[] {
  const polynomial = new Array(rsPerBlock + 1).fill(0);
  polynomial[rsPerBlock] = 0;

  for (let col = 1; col <= rsPerBlock; col++) {
    polynomial[rsPerBlock - col] = 1;
    for (let row = rsPerBlock - col; row < rsPerBlock; row++) {
      polynomial[row] = polynomial[row + 1] ^ expTable[(logTable[polynomial[row]] + col) % 255];
    }
  }

  return polynomial;
}

/**
 * Calculates Reed-Solomon error correction codewords
 * Uses GF(256) with primitive polynomial x^8 + x^5 + x^3 + x^2 + 1 (301)
 * @param encodedData - Data codewords array (RS codewords appended in place)
 * @param rsCheckwords - Number of RS check codewords to generate
 * @param numBlocks - Number of interleaved blocks
 */
function calculateReedSolomon(encodedData: number[], rsCheckwords: number, numBlocks: number): void {
  const encodedLength = encodedData.length;
  const rsPerBlock = rsCheckwords / numBlocks;

  // Build Galois field tables
  const { logTable, expTable } = buildGaloisFieldTables();

  // Build RS generator polynomial
  const rsPolynomial = buildRsGeneratorPolynomial(rsPerBlock, logTable, expTable);

  // Calculate RS codewords for each interleaved block
  for (let col = 0; col < numBlocks; col++) {
    const rsRemainder = new Array(rsPerBlock + 1).fill(0);

    // Process data codewords for this block
    for (let i = col; i < encodedLength; i += numBlocks) {
      const feedback = rsRemainder[0] ^ encodedData[i];
      for (let j = 0; j < rsPerBlock; j++) {
        rsRemainder[j] = rsRemainder[j + 1] ^ (feedback ? expTable[(logTable[rsPolynomial[j]] + logTable[feedback]) % 255] : 0);
      }
    }

    // Interleave RS codewords into output
    for (let i = 0; i < rsPerBlock; i++) {
      encodedData[encodedLength + col + i * numBlocks] = rsRemainder[i];
    }
  }
}

/**
 * Draws the finder pattern (L-shaped borders around each region)
 * @param setBit - Function to set a bit in the matrix
 * @param symbolSize - Symbol size parameters
 */
function drawFinderPattern(
  setBit: (x: number, y: number) => void,
  symbolSize: SymbolSize
): void {
  const { symbolWidth, symbolHeight, numColRegions, numRowRegions, regionWidth, regionHeight } = symbolSize;

  // Horizontal lines
  for (let i = 0; i < symbolHeight + 2 * numRowRegions; i += regionHeight + 2) {
    for (let j = 0; j < symbolWidth + 2 * numColRegions; j++) {
      setBit(j, i + regionHeight + 1); // Solid bottom line
      if ((j & 1) == 0) setBit(j, i);  // Alternating top line
    }
  }

  // Vertical lines
  for (let i = 0; i < symbolWidth + 2 * numColRegions; i += regionWidth + 2) {
    for (let j = 0; j < symbolHeight; j++) {
      setBit(i, j + (j / regionHeight | 0) * 2 + 1); // Solid left line
      if ((j & 1) == 1) {
        setBit(i + regionWidth + 1, j + (j / regionHeight | 0) * 2); // Alternating right
      }
    }
  }
}

/**
 * Places data codewords into the matrix using the DataMatrix placement algorithm
 * @param setBit - Function to set a bit in the matrix
 * @param encodedData - All codewords (data + RS)
 * @param symbolSize - Symbol size parameters
 */
function placeDataCodewords(
  setBit: (x: number, y: number) => void,
  encodedData: number[],
  symbolSize: SymbolSize
): void {
  const { symbolWidth, symbolHeight, regionWidth, regionHeight, totalCodewords } = symbolSize;

  let step = 2;      // Direction of diagonal movement
  let col = 0;       // Current column
  let row = 4;       // Current row

  // Place data codewords in diagonal pattern
  for (let dataIndex = 0; dataIndex < totalCodewords; row -= step, col += step) {
    let placementPattern: number[];

    // Handle special corner cases
    if (row == symbolHeight - 3 && col == -1) {
      // Corner case A
      placementPattern = [
        symbolWidth, 6 - symbolHeight,
        symbolWidth, 5 - symbolHeight,
        symbolWidth, 4 - symbolHeight,
        symbolWidth, 3 - symbolHeight,
        symbolWidth - 1, 3 - symbolHeight,
        3, 2,
        2, 2,
        1, 2
      ];
    } else if (row == symbolHeight + 1 && col == 1 && (symbolWidth & 7) == 0 && (symbolHeight & 7) == 6) {
      // Corner case D
      placementPattern = [
        symbolWidth - 2, -symbolHeight,
        symbolWidth - 3, -symbolHeight,
        symbolWidth - 4, -symbolHeight,
        symbolWidth - 2, -1 - symbolHeight,
        symbolWidth - 3, -1 - symbolHeight,
        symbolWidth - 4, -1 - symbolHeight,
        symbolWidth - 2, -2,
        -1, -2
      ];
    } else {
      // Skip corner B upper-left position
      if (row == 0 && col == symbolWidth - 2 && (symbolWidth & 3)) continue;

      // Handle boundary wrap-around
      if (row < 0 || col >= symbolWidth || row >= symbolHeight || col < 0) {
        step = -step; // Reverse direction
        row += 2 + step / 2;
        col += 2 - step / 2;

        while (row < 0 || col >= symbolWidth || row >= symbolHeight || col < 0) {
          row -= step;
          col += step;
        }
      }

      if (row == symbolHeight - 2 && col == 0 && (symbolWidth & 3)) {
        // Corner case B
        placementPattern = [
          symbolWidth - 1, 3 - symbolHeight,
          symbolWidth - 1, 2 - symbolHeight,
          symbolWidth - 2, 2 - symbolHeight,
          symbolWidth - 3, 2 - symbolHeight,
          symbolWidth - 4, 2 - symbolHeight,
          0, 1,
          0, 0,
          0, -1
        ];
      } else if (row == symbolHeight - 2 && col == 0 && (symbolWidth & 7) == 4) {
        // Corner case C
        placementPattern = [
          symbolWidth - 1, 5 - symbolHeight,
          symbolWidth - 1, 4 - symbolHeight,
          symbolWidth - 1, 3 - symbolHeight,
          symbolWidth - 1, 2 - symbolHeight,
          symbolWidth - 2, 2 - symbolHeight,
          0, 1,
          0, 0,
          0, -1
        ];
      } else if (row == 1 && col == symbolWidth - 1 && (symbolWidth & 7) == 0 && (symbolHeight & 7) == 6) {
        continue; // Skip corner D position
      } else {
        placementPattern = NOMINAL_PATTERN;
      }
    }

    // Place 8 modules for current codeword
    for (let codeword = encodedData[dataIndex++], bitIndex = 0; codeword > 0; bitIndex += 2, codeword >>= 1) {
      if (codeword & 1) {
        let tempX = col + placementPattern[bitIndex];
        let tempY = row + placementPattern[bitIndex + 1];

        // Wrap coordinates if negative
        if (tempX < 0) {
          tempX += symbolWidth;
          tempY += 4 - ((symbolWidth + 4) & 7);
        }
        if (tempY < 0) {
          tempY += symbolHeight;
          tempX += 4 - ((symbolHeight + 4) & 7);
        }

        // Account for region separators
        setBit(
          tempX + 2 * (tempX / regionWidth | 0) + 1,
          tempY + 2 * (tempY / regionHeight | 0) + 1
        );
      }
    }
  }

  // Fill unused corner modules
  for (let i = symbolWidth; i & 3; i--) {
    setBit(i, i);
  }
}

/**
 * Main encoding function - orchestrates the encoding process
 * @param text - Message to encode
 * @param useRectangular - Use rectangular symbol format
 * @returns DataMatrixResult with matrix and dimensions
 */
function encodeMessage(text: string, useRectangular?: boolean): DataMatrixResult {
  /** 2D matrix storing the barcode pattern (1 = black, 0/undefined = white) */
  const matrix: number[][] = [];

  /**
   * Sets a bit (black module) at the specified position in the matrix
   */
  const setBit = function(x: number, y: number): void {
    matrix[y] = matrix[y] || [];
    matrix[y][x] = 1;
  };

  // Convert to UTF-8 bytes
  text = unescape(encodeURI(text));

  // Step 1: Select best encoding mode
  const encodedData = selectBestEncoding(text);

  // Step 2: Calculate symbol size
  const symbolSize = calculateSymbolSize(encodedData.length, useRectangular);
  if (!symbolSize) {
    return { matrix, width: 0, height: 0 }; // Message too long
  }

  // Step 3: Add padding codewords
  addPadding(encodedData, symbolSize.totalCodewords, symbolSize.rsCheckwords);

  // Step 4: Calculate Reed-Solomon error correction
  calculateReedSolomon(encodedData, symbolSize.rsCheckwords, symbolSize.numBlocks);

  // Step 5: Draw finder pattern
  drawFinderPattern(setBit, symbolSize);

  // Step 6: Place data codewords
  placeDataCodewords(setBit, encodedData, symbolSize);

  // Calculate final dimensions including region separators
  const matrixWidth = symbolSize.symbolWidth + 2 * symbolSize.numColRegions;
  const matrixHeight = symbolSize.symbolHeight + 2 * symbolSize.numRowRegions;

  return { matrix, width: matrixWidth, height: matrixHeight };
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
 * @returns DataMatrixResult containing the pixel matrix and dimensions
 */
export function encodeToMatrix(message: string, useRectangular?: boolean): DataMatrixResult {
  return encodeMessage(message, useRectangular);
}

/**
 * Converts a DataMatrix pixel matrix to an SVG element
 * 
 * This is the second step in generating a DataMatrix barcode.
 * Use encodeToMatrix() first to get the matrix data.
 *
 * @example
 * // Two-step generation
 * const matrixResult = encodeToMatrix('Hello World!');
 * const svg = matrixToSvg(matrixResult);
 *
 * @example
 * // With custom options
 * const matrixResult = encodeToMatrix('Hello World!');
 * const svg = matrixToSvg(matrixResult, {
 *   dim: 512,
 *   pad: 4,
 *   pal: ['#000000', '#ffffff']
 * });
 *
 * @param matrixResult - The result from encodeToMatrix()
 * @param options - SVG rendering options
 * @returns SVG element containing the DataMatrix barcode
 */
export function matrixToSvg(matrixResult: DataMatrixResult, options?: SvgOptions): SVGSVGElement {
  const opts = options || {};
  const { matrix, width: matrixWidth, height: matrixHeight } = matrixResult;
  
  // Parse options with defaults
  const palette = opts.pal || ['#000'];
  const dimension = Math.abs(opts.dim!) || 256;
  let padding = Math.abs(opts.pad!);
  padding = (padding > -1) ? padding : 2;
  const useOptimizedPath = !opts.vrb;

  // Resolve colors
  const foregroundColor = resolveColor(palette[0], '#000')!;
  const backgroundColor = resolveColor(palette[1], null);

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
 *   msg: "Your message",
 *   dim: 256,
 *   rct: false,
 *   pad: 2,
 *   pal: ["#000000", "#f2f4f8"],
 *   vrb: false
 * });
 *
 * @param options - Configuration options or just a string message
 * @returns SVG element containing the DataMatrix barcode
 */
export function DATAMatrix(options: DataMatrixOptions | string): SVGSVGElement {
  // Parse options
  const opts: DataMatrixOptions = ('string' == typeof options) ? { msg: options } : options || {};
  
  // Generate the barcode matrix
  const matrixResult = encodeToMatrix(opts.msg || '', opts.rct);
  
  // Convert to SVG with the same options
  return matrixToSvg(matrixResult, {
    dim: opts.dim,
    pad: opts.pad,
    pal: opts.pal,
    vrb: opts.vrb
  });
}

export default DATAMatrix;
