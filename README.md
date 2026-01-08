# datamatrix-svg-ts

A TypeScript implementation of DataMatrix ECC 200 2D barcode generator that outputs SVG.

## Background

This project is a TypeScript rewrite of the excellent [datamatrix-svg](https://github.com/datalog/datamatrix-svg) library by Constantine (MIT License).

The original JavaScript implementation is compact and efficient, but we wanted a version that is native TypeScript with clear, documented code and full type safety. The code is refactored with descriptive names and comments explaining the DataMatrix encoding algorithms, making it easier to understand and maintain.

Additionally, this version supports all SVG-compatible color values (`currentColor`, `rgb()`, `hsl()`, named colors, etc.) instead of just hex colors.

## Installation

```bash
npm install datamatrix-svg-ts
```

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
        console.log('Message exceeds DataMatrix capacity (~1556 bytes)');
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
| `dimension` | `number` | `256` | Output size in pixels |
| `padding` | `number` | `2` | Padding in modules |
| `palette` | `Palette` | `{ foreground: '#000' }` | Colors |
| `rectangular` | `boolean` | `false` | Rectangular format |
| `allowEmptyMessage` | `boolean` | `false` | Allow empty message without error |

### Palette Colors

Supports all SVG color values: `#hex`, `rgb()`, `hsl()`, named colors, `currentColor`, `url(#gradient)`, etc.

## License

MIT License

Based on [datamatrix-svg](https://github.com/datalog/datamatrix-svg) by Constantine.

