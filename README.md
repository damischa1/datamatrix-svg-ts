# DataMatrix SVG Generator

TypeScript implementation of a DataMatrix 2D barcode generator.

## Credits

This project is based on the excellent JavaScript implementation by Constantine:
- **Original repository:** https://github.com/datalog/datamatrix-svg
- **Original license:** MIT License
- **Original author:** Copyright (c) 2020 Constantine

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Usage

```typescript
import { generateDataMatrixSVG, generateDataMatrix } from 'datamatrix-svg';

// Simple usage - just pass a string
const svg = generateDataMatrixSVG('Hello World!');

// With options
const svg2 = generateDataMatrixSVG({
  msg: 'Your message here',
  dim: 256,        // Output dimension (default: 256)
  pad: 2,          // Padding (default: 2)
  pal: ['#000', '#fff'],  // [foreground, background]
  rct: false,      // Use rectangular format
  vrb: false       // Verbose SVG (not optimized)
});

// Get raw matrix data
const result = generateDataMatrix('Test');
console.log(result.matrix);  // 2D array of 0s and 1s
console.log(result.path);    // SVG path data
console.log(result.width);   // Matrix width
console.log(result.height);  // Matrix height
```

## API

### `generateDataMatrixSVG(options: DataMatrixOptions | string): string`

Generates a complete SVG string for a DataMatrix barcode.

### `generateDataMatrix(options: DataMatrixOptions | string): DataMatrixResult`

Generates the raw matrix data and SVG path.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `msg` | string | `''` | The message to encode |
| `dim` | number | `256` | Output dimension in pixels |
| `pad` | number | `2` | Padding around the barcode |
| `pal` | `[string, string?]` | `['#000']` | Color palette [foreground, background] |
| `rct` | boolean | `false` | Use rectangular format |
| `vrb` | boolean | `false` | Generate verbose (non-optimized) SVG |

## License

MIT License - Same as the original project.
