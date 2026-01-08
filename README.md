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

### `encodeToMatrix(message, rectangular?): DataMatrixResult`

Encodes a message into a pixel matrix (for custom rendering).

### `matrixToSvg(matrixResult, options?): SVGSVGElement`

Converts a matrix to an SVG element.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `message` | `string` | `''` | The message to encode |
| `dimension` | `number` | `256` | Output size in pixels |
| `padding` | `number` | `2` | Padding in modules |
| `palette` | `Palette` | `{ foreground: '#000' }` | Colors |
| `rectangular` | `boolean` | `false` | Rectangular format |

### Palette Colors

Supports all SVG color values: `#hex`, `rgb()`, `hsl()`, named colors, `currentColor`, `url(#gradient)`, etc.

## License

MIT License

Based on [datamatrix-svg](https://github.com/datalog/datamatrix-svg) by Constantine.
