# datamatrix-svg-ts

[![CI](https://github.com/damischa1/datamatrix-svg-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/damischa1/datamatrix-svg-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/datamatrix-svg-ts)](https://www.npmjs.com/package/datamatrix-svg-ts)

A TypeScript implementation of DataMatrix ECC 200 2D barcode generator that outputs SVG.

## Background

This project is a TypeScript rewrite of the excellent [datamatrix-svg](https://github.com/datalog/datamatrix-svg) library by Constantine (MIT License).

The original JavaScript implementation is compact and efficient, but we wanted a version that is native TypeScript with clear, documented code and full type safety. The code is refactored with descriptive names and comments explaining the DataMatrix encoding algorithms, making it easier to understand and maintain.

Additionally, this version supports all SVG-compatible color values (`currentColor`, `rgb()`, `hsl()`, named colors, etc.) instead of just hex colors.

## Installation

```bash
npm install datamatrix-svg-ts
```

The package is ESM-only and has no dependencies. It runs in browsers and in Node.js 18+
(`require()` works on Node.js 20.19+ / 22.12+, which can load ES modules).
`encodeToMatrix()` needs no DOM; `DATAMatrix()` and `matrixToSvg()` create DOM nodes and
need a global `document` (a browser, or e.g. jsdom on the server).

## Quick Start

```typescript
import { DATAMatrix } from 'datamatrix-svg-ts';

// Simple usage - just pass a string
const svg = DATAMatrix('Hello World!');
document.body.appendChild(svg);
```

## Usage in React

```tsx
import { useEffect, useRef } from 'react';
import { DATAMatrix } from 'datamatrix-svg-ts';

// Simple component
function DataMatrixCode({ message }: { message: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      const svg = DATAMatrix(message);
      containerRef.current.appendChild(svg);
    }
  }, [message]);

  return <div ref={containerRef} />;
}

// With custom colors
function DataMatrixWithColors({ message }: { message: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      const svg = DATAMatrix({
        message,
        dimension: 200,
        palette: { 
          foreground: 'currentColor',  // Inherits CSS color
          background: '#f0f0f0' as const
        }
      });
      containerRef.current.appendChild(svg);
    }
  }, [message]);

  return <div ref={containerRef} style={{ color: 'navy' }} />;
}
```

## Error Handling

The library throws `DataMatrixError` for expected validation errors that can be caught and handled:

```typescript
import { DATAMatrix, DataMatrixError } from 'datamatrix-svg-ts';

try {
  const svg = DATAMatrix({ message: userInput });
} catch (e) {
  if (e instanceof DataMatrixError) {
    // Handle validation errors
    switch (e.code) {
      case 'EMPTY_MESSAGE':
        console.log('Please enter a message');
        break;
      case 'MESSAGE_TOO_LONG':
        console.log('Message exceeds DataMatrix capacity');
        break;
    }
  } else {
    // Unexpected error (programming bug) - rethrow
    throw e;
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `EMPTY_MESSAGE` | Message is empty (and `allowEmptyMessage` is false) |
| `MESSAGE_TOO_LONG` | Encoded message exceeds DataMatrix maximum capacity |

### Allowing Empty Messages

By default, empty messages throw an error. If you need to allow empty messages (produces a minimal DataMatrix), use the `allowEmptyMessage` option:

```typescript
const svg = DATAMatrix({ message: '', allowEmptyMessage: true });
```

## Two-Step API

For more control, you can separate encoding from rendering:

```typescript
import { encodeToMatrix, matrixToSvg } from 'datamatrix-svg-ts';

// Step 1: Encode message to matrix
const matrixResult = encodeToMatrix('Hello World!');

// Step 2: Render matrix to SVG
const svg = matrixToSvg(matrixResult, {
  dimension: 512,
  palette: { foreground: '#000', background: '#fff' }
});

// Or use the matrix data for custom rendering (Canvas, PNG, etc.)
// matrixResult.matrix[y][x] === 1 means black module
```

## API

### `DATAMatrix(options | string): SVGSVGElement`

Main function - generates a DataMatrix barcode as an SVG element.

**Throws:** `DataMatrixError` if message is empty or too long.

### `encodeToMatrix(message, rectangular?, allowEmptyMessage?): DataMatrixResult`

Encodes a message into a pixel matrix (for custom rendering).

**Throws:** `DataMatrixError` if message is empty (unless `allowEmptyMessage` is true) or too long.

### `matrixToSvg(matrixResult, options?): SVGSVGElement`

Converts a matrix to an SVG element.

### `DataMatrixError`

Custom error class for validation errors. Has `code` property (`DataMatrixErrorCode`) and `message`.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `message` | `string` | `''` | The message to encode |
| `dimension` | `number` | `256` | Output **height** in pixels; the width follows the aspect ratio |
| `padding` | `number` | `2` | Quiet zone in modules (the standard requires at least 1) |
| `palette` | `Palette` | `{ foreground: '#000' }` | Colors; no background by default |
| `rectangular` | `boolean` | `false` | Prefer a rectangular symbol, see below |
| `verbose` | `boolean` | `false` | One rectangle per module instead of merged horizontal runs |
| `allowEmptyMessage` | `boolean` | `false` | Allow empty message without error |

### Palette Colors

Supports all SVG color values: `#hex`, `rgb()`, `hsl()`, named colors, `currentColor`, `url(#gradient)`, etc.

### Rectangular symbols

With `rectangular: true` the smallest fitting rectangle is used: 8×18, 8×32, 12×26, 12×36,
16×36 or 16×48 modules (height × width). If the data does not fit in the largest
rectangle (49 data codewords, e.g. 98 digits or about 70 uppercase characters), a
**square symbol is used instead** without an error. Check the result if the shape matters:

```typescript
const result = encodeToMatrix(message, true);
if (result.width === result.height) {
  // Did not fit in a rectangle
}
```

`dimension` is always the height, so a rectangular symbol rendered with the default
`dimension: 256` is wider than 256 px. The SVG has a `viewBox`, so it can also be sized
freely with CSS.

### Capacity

Symbols range from 10×10 to 144×144 modules. The encoder picks the most compact encoding
mode for the whole message and the smallest symbol that fits. The largest symbol holds
at most:

| Content | Maximum |
|---------|---------|
| Digits | 3116 |
| Uppercase letters, digits and space | about 2300 |
| Other text / UTF-8 / binary | 1555 bytes |

Longer messages throw `DataMatrixError` with code `MESSAGE_TOO_LONG`.

### Non-ASCII text

Text is encoded as UTF-8 bytes without an ECI (character set) marker. Most modern readers
(ZXing-based apps, phone cameras) detect UTF-8 automatically, but some hardware scanners
default to ISO-8859-1 and show e.g. `Ã¤` for `ä`. Test with your scanners if the content
is not plain ASCII.

## Development

```bash
npm ci
npm run check   # typecheck, tests, build, publint and arethetypeswrong
```

Tests decode every generated symbol with [ZXing](https://github.com/zxing-cpp/zxing-cpp)
(`zxing-wasm`) and compare the payload byte for byte, and compare the output with the
original implementation. See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

MIT License

Based on [datamatrix-svg](https://github.com/datalog/datamatrix-svg) by Constantine.

