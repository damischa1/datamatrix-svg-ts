/**
 * DataMatrix ECC 200 Encoder
 * 
 * This module handles the encoding of messages into DataMatrix matrix format.
 * It supports multiple encoding modes (ASCII, C40, TEXT, X12, EDIFACT, Base256)
 * and uses Reed-Solomon error correction.
 * 
 * @module encoder
 */

// ============================================================================
// Errors
// ============================================================================

/**
 * Error codes for DataMatrix validation errors.
 * These represent expected, recoverable error conditions.
 */
export type DataMatrixErrorCode = 'EMPTY_MESSAGE' | 'MESSAGE_TOO_LONG';

/**
 * Custom error class for DataMatrix validation errors.
 * 
 * This error is thrown for expected, recoverable conditions:
 * - EMPTY_MESSAGE: The input message is empty (and allowEmptyMessage is false)
 * - MESSAGE_TOO_LONG: The encoded message exceeds DataMatrix capacity (at most
 *   3116 digits, about 2300 alphanumeric characters or 1555 bytes of UTF-8/binary data)
 * 
 * Other errors (programming bugs) will throw standard Error.
 * 
 * @example
 * ```typescript
 * try {
 *   const svg = DATAMatrix(message);
 * } catch (e) {
 *   if (e instanceof DataMatrixError) {
 *     // Handle validation error
 *     console.log(`Validation failed: ${e.code} - ${e.message}`);
 *   } else {
 *     // Unexpected programming error
 *     throw e;
 *   }
 * }
 * ```
 */
export class DataMatrixError extends Error {
  /** Error code identifying the specific validation failure */
  readonly code: DataMatrixErrorCode;

  constructor(code: DataMatrixErrorCode, message: string) {
    super(message);
    this.name = 'DataMatrixError';
    this.code = code;
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, DataMatrixError.prototype);
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Result of encoding a message into a DataMatrix matrix
 */
export interface DataMatrixResult {
  /**
   * Module values by row and column, `matrix[y][x]`: 1 = dark, 0 = light.
   * Every row has exactly `width` entries (before 1.1.0 rows could be sparse,
   * with `undefined` for light modules).
   */
  readonly matrix: readonly (readonly number[])[];
  /** Width of the barcode in modules (including finder pattern) */
  readonly width: number;
  /** Height of the barcode in modules (including finder pattern) */
  readonly height: number;
}

/**
 * Internal symbol size calculation result
 */
interface SymbolSize {
  /** Total symbol width in modules (excluding separators) */
  symbolWidth: number;
  /** Total symbol height in modules (excluding separators) */
  symbolHeight: number;
  /** Number of horizontal regions */
  numColRegions: number;
  /** Number of vertical regions */
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
  96, 2, 96,  // Backtick is value 0 in Set 2 (Shift 3)
  122, 9, 83, // Lowercase a-z in basic set
  127, 2, 96, // {|}~DEL in Set 2 (Shift 3)
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

/**
 * Upper bound for the input size in bytes: the largest symbol (144x144) holds
 * 1558 data codewords, and the densest encoding packs two digits per codeword.
 */
const MAX_ENCODABLE_BYTES = 1558 * 2;

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
// ASCII Encoding
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

// ============================================================================
// Base256 Encoding
// ============================================================================

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
  
  // Length encoding with 255-state randomizing algorithm.
  // Lengths 1-249 use a single length byte; 250+ need two bytes
  // (floor(length / 250) + 249, length % 250). A single byte of 0 would
  // mean "data continues to the end of the symbol", so 250 must not use it.
  if (textLength >= 250) {
    // High byte, pre-randomized for position 2: (249 + n) + 44 ≡ 37 + n (mod 256)
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

// ============================================================================
// EDIFACT Encoding
// ============================================================================

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
    : codewords.concat(encodeAscii(text.substring(alignedLength === 0 ? 0 : alignedLength - 1)));
}

// ============================================================================
// C40/TEXT/X12 Encoding
// ============================================================================

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
  // encodingTable is a compile-time constant, safe to use !
  const modeSwitchCodeword = encodingTable[0]!;
  const codewords: number[] = [modeSwitchCodeword]; // Mode switch codeword

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

    // Find character in encoding table (compile-time constant)
    for (tableIndex = 1; encodingTable[tableIndex]! < charCode; tableIndex += 3);

    // Compile-time constant table, safe to use !
    const shiftValue = encodingTable[tableIndex + 1]!;
    const baseValue = encodingTable[tableIndex + 2]!;

    // Check if character is valid in this encoding
    if (8 == shiftValue || (9 == shiftValue && 0 == charCount && i == textLength - 1)) {
      return []; // Character not in set or padding would fail
    }

    // Handle last character edge case
    if (shiftValue < 5 && charCount == 2 && i == textLength - 1) break;

    // Add shift if needed (values 0-4 are valid shifts)
    if (shiftValue < 5) packValue(shiftValue);

    // Add character value (offset from table)
    packValue(charCode - baseValue);
  }

  // Add padding if needed (not for X12 mode)
  if (2 == charCount && 238 !== codewords[0]) {
    packValue(0);
  }

  codewords.push(254); // Return to ASCII mode

  // Encode remaining characters in ASCII
  if (charCount > 0 || i < textLength) {
    return codewords.concat(encodeAscii(text.substring(i - charCount)));
  }

  return codewords;
}

// ============================================================================
// Encoding Selection
// ============================================================================

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
  const initialEncoding = encodingStrategies[0]?.() ?? [];
  return encodingStrategies.reduce((best, encode) => {
    const result = encode();
    return (result.length > 0 && result.length < best.length) ? result : best;
  }, initialEncoding);
}

// ============================================================================
// Symbol Size Calculation
// ============================================================================

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
    // RECTANGULAR_SIZES is a compile-time constant
    do {
      const nextWidth = RECTANGULAR_SIZES[++symbolIndex];
      if (nextWidth === undefined) return null; // No suitable size found
      symbolWidth = nextWidth;
      symbolHeight = 6 + (symbolIndex & 12); // Data region heights: 6, 6, 10, 10, 14, 14
      totalCodewords = symbolWidth * symbolHeight / 8;
    } while (totalCodewords - RECTANGULAR_SIZES[++symbolIndex]! < encodedLength);

    rsCheckwords = RECTANGULAR_SIZES[symbolIndex]!;

    // Wide rectangles need 2 column regions
    if (symbolWidth > 25) numColRegions = 2;
  } else {
    // Square symbols
    symbolWidth = symbolHeight = 6;
    let sizeIncrement = 2;

    // Find smallest square that fits the data
    // SQUARE_RS_CHECKWORDS is a compile-time constant
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
    } while (totalCodewords - SQUARE_RS_CHECKWORDS[symbolIndex]! < encodedLength);

    totalCodewords = (symbolWidth * symbolHeight) >> 3;
    rsCheckwords = SQUARE_RS_CHECKWORDS[symbolIndex]!;

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

// ============================================================================
// Padding
// ============================================================================

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

// ============================================================================
// Reed-Solomon Error Correction
// ============================================================================

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

  // GF tables are mathematically complete (255 values each)
  // polynomial indices are bounded by rsPerBlock
  for (let col = 1; col <= rsPerBlock; col++) {
    polynomial[rsPerBlock - col] = 1;
    for (let row = rsPerBlock - col; row < rsPerBlock; row++) {
      const polyVal = polynomial[row]!;
      const nextPoly = polynomial[row + 1]!;
      const logVal = logTable[polyVal]!;
      const expIdx = (logVal + col) % 255;
      polynomial[row] = nextPoly ^ expTable[expIdx]!;
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

  // Build Galois field tables (mathematically complete)
  const { logTable, expTable } = buildGaloisFieldTables();

  // Build RS generator polynomial
  const rsPolynomial = buildRsGeneratorPolynomial(rsPerBlock, logTable, expTable);

  // Calculate RS codewords for each interleaved block
  for (let col = 0; col < numBlocks; col++) {
    const rsRemainder = new Array(rsPerBlock + 1).fill(0);

    // Process data codewords for this block
    // All arrays here are internally managed with known bounds
    for (let i = col; i < encodedLength; i += numBlocks) {
      const feedback = rsRemainder[0]! ^ encodedData[i]!;
      for (let j = 0; j < rsPerBlock; j++) {
        const nextRemainder = rsRemainder[j + 1]!;
        if (feedback) {
          // feedback !== 0: need to do GF multiplication
          // GF tables and rsPolynomial are mathematically complete
          const polyLog = logTable[rsPolynomial[j]!]!;
          const feedbackLog = logTable[feedback]!;
          const expIdx = (polyLog + feedbackLog) % 255;
          rsRemainder[j] = nextRemainder ^ expTable[expIdx]!;
        } else {
          // feedback === 0: XOR with 0 is identity
          rsRemainder[j] = nextRemainder;
        }
      }
    }

    // Interleave RS codewords into output
    for (let i = 0; i < rsPerBlock; i++) {
      encodedData[encodedLength + col + i * numBlocks] = rsRemainder[i]!;
    }
  }
}

// ============================================================================
// Finder Pattern
// ============================================================================

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

// ============================================================================
// Data Placement
// ============================================================================

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
    // encodedData validated by caller, placementPattern indices are fixed (0-15)
    for (let codeword = encodedData[dataIndex++]!, bitIndex = 0; codeword > 0; bitIndex += 2, codeword >>= 1) {
      if (codeword & 1) {
        let tempX = col + placementPattern[bitIndex]!;
        let tempY = row + placementPattern[bitIndex + 1]!;

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

// ============================================================================
// Main Encoding Function
// ============================================================================

/**
 * Encodes a message into a DataMatrix pixel matrix
 * 
 * This function handles the complete encoding process:
 * 1. Converts message to UTF-8
 * 2. Selects the most efficient encoding mode
 * 3. Calculates optimal symbol size
 * 4. Adds padding and Reed-Solomon error correction
 * 5. Generates the matrix with finder pattern and data placement
 *
 * @example
 * // Encode a simple message
 * const result = encodeMessage('Hello World!');
 * console.log(result.width, result.height); // dimensions in modules
 *
 * @example
 * // For rectangular symbols
 * const result = encodeMessage('ABC123', true);
 *
 * @example
 * // Allow empty message (produces minimal DataMatrix)
 * const result = encodeMessage('', false, true);
 *
 * @param text - The message to encode
 * @param useRectangular - Prefer a rectangular symbol; falls back to square if the data
 *   does not fit in the largest rectangle (default: false)
 * @param allowEmptyMessage - Allow empty message without throwing error (default: false)
 * @returns DataMatrixResult containing the pixel matrix and dimensions
 * @throws {DataMatrixError} code='EMPTY_MESSAGE' - When message is empty and allowEmptyMessage is false
 * @throws {DataMatrixError} code='MESSAGE_TOO_LONG' - When the message does not fit in the largest (144x144) symbol
 */
export function encodeMessage(text: string, useRectangular?: boolean, allowEmptyMessage?: boolean): DataMatrixResult {
  // Validate input
  if ((!text || text.length === 0) && !allowEmptyMessage) {
    throw new DataMatrixError('EMPTY_MESSAGE', 'Message cannot be empty');
  }


  // Convert to UTF-8 bytes using TextEncoder
  const utf8Bytes = new TextEncoder().encode(text);

  // Nothing longer than MAX_ENCODABLE_BYTES can ever fit, so reject it before
  // running every encoder over a potentially huge input.
  if (utf8Bytes.length > MAX_ENCODABLE_BYTES) {
    throw new DataMatrixError(
      'MESSAGE_TOO_LONG',
      `Message too long: ${utf8Bytes.length} bytes exceeds DataMatrix capacity`
    );
  }

  // One char per byte (0-255). A loop instead of String.fromCharCode(...bytes),
  // which overflows the call stack on large inputs.
  let utf8Text = '';
  for (const byte of utf8Bytes) utf8Text += String.fromCharCode(byte);

  // Step 1: Select best encoding mode
  const encodedData = selectBestEncoding(utf8Text);

  // Step 2: Calculate symbol size
  const symbolSize = calculateSymbolSize(encodedData.length, useRectangular);
  if (!symbolSize) {
    throw new DataMatrixError('MESSAGE_TOO_LONG', `Message too long: encoded length ${encodedData.length} exceeds DataMatrix capacity`);
  }

  // Step 3: Add padding codewords
  addPadding(encodedData, symbolSize.totalCodewords, symbolSize.rsCheckwords);

  // Step 4: Calculate Reed-Solomon error correction
  calculateReedSolomon(encodedData, symbolSize.rsCheckwords, symbolSize.numBlocks);

  // Final dimensions including region separators
  const matrixWidth = symbolSize.symbolWidth + 2 * symbolSize.numColRegions;
  const matrixHeight = symbolSize.symbolHeight + 2 * symbolSize.numRowRegions;

  /** Module matrix, all light (0) until set */
  const matrix: number[][] = Array.from({ length: matrixHeight }, () => new Array<number>(matrixWidth).fill(0));

  /** Sets a dark module at the specified position */
  const setBit = function(x: number, y: number): void {
    matrix[y]![x] = 1;
  };

  // Step 5: Draw finder pattern
  drawFinderPattern(setBit, symbolSize);

  // Step 6: Place data codewords
  placeDataCodewords(setBit, encodedData, symbolSize);

  return { matrix, width: matrixWidth, height: matrixHeight };
}
