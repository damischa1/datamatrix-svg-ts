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

| Function | Returns | Needs a DOM |
|----------|---------|-------------|
| `DATAMatrix()` | `SVGSVGElement` | yes |
| `toSvgString()` | SVG markup (`string`) | no |
| `encodeToMatrix()` | module matrix | no |
| `matrixToSvg()` | `SVGSVGElement` | yes |
| `matrixToSvgString()` | SVG markup (`string`) | no |

## Quick Start

```typescript
import { DATAMatrix, toSvgString } from 'datamatrix-svg-ts';

// In the browser: an SVG element
document.body.appendChild(DATAMatrix('Hello World!'));

// Anywhere (server, Node.js, workers): SVG markup
const markup = toSvgString({ message: 'Hello World!', dimension: 128 });
```

## Usage in React

`toSvgString()` renders during render, so no ref or effect is needed and it works
with server-side rendering:

```tsx
import { useMemo } from 'react';
import { toSvgString, DataMatrixError } from 'datamatrix-svg-ts';

function DataMatrixCode({ value, className }: { value: string; className?: string }) {
  const markup = useMemo(() => {
    if (!value) return '';
    try {
      return toSvgString({ message: value, palette: { foreground: 'currentColor' } });
    } catch (e) {
      if (e instanceof DataMatrixError) return ''; // too long etc.
      throw e;
    }
  }, [value]);

  // The SVG has a viewBox; size it with CSS, e.g. [&>svg]:size-full
  return <span className={className} dangerouslySetInnerHTML={{ __html: markup }} />;
}
```

The markup contains only the generated SVG; the message is encoded into path data and never
inserted as text, so this is safe for any input.

With the DOM API instead:

```tsx
import { useEffect, useRef } from 'react';
import { DATAMatrix } from 'datamatrix-svg-ts';

function DataMatrixCode({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.replaceChildren(message ? DATAMatrix(message) : '');
  }, [message]);

  return <div ref={ref} />;
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
| `UNSUPPORTED_CHARACTER` | Character outside the chosen `encoding` (`'iso-8859-1'` only) |

Invalid option values are not errors: an unrecognized color, or a negative or
non-numeric `dimension` / `padding`, falls back to the default.

### Allowing Empty Messages

By default, empty messages throw an error. If you need to allow empty messages (produces a minimal DataMatrix), use the `allowEmptyMessage` option:

```typescript
const svg = DATAMatrix({ message: '', allowEmptyMessage: true });
```

## Two-Step API

For more control, you can separate encoding from rendering:

```typescript
import { encodeToMatrix, matrixToSvg, matrixToSvgString } from 'datamatrix-svg-ts';

// Step 1: Encode message to matrix
const result = encodeToMatrix('Hello World!', { rectangular: true });

// Step 2: Render matrix to SVG
const svg = matrixToSvg(result, {
  dimension: 512,
  palette: { foreground: '#000', background: '#fff' }
});
const markup = matrixToSvgString(result, { dimension: 512 });

// Or use the matrix for custom rendering (canvas, PNG, PDF, ...):
// result.matrix[y][x] is 1 (dark) or 0 (light); every row has result.width entries
```

## API

### `DATAMatrix(options | string): SVGSVGElement`

Generates a DataMatrix barcode as an SVG element.

### `toSvgString(options | string): string`

Same as `DATAMatrix()`, but returns the markup (equal to `DATAMatrix(...).outerHTML`)
and works without a DOM.

### `encodeToMatrix(message, options?): DataMatrixResult`

Encodes a message into a module matrix: `{ matrix, width, height }`. Options:
`rectangular`, `allowEmptyMessage`, `encoding`, `eci` (see the table below).
The older form `encodeToMatrix(message, rectangular?, allowEmptyMessage?)` still works
but is deprecated.

### `matrixToSvg(result, options?): SVGSVGElement` / `matrixToSvgString(result, options?): string`

Render a matrix as an SVG element or as markup. Options: `dimension`, `padding`,
`palette`, `verbose`.

### `DataMatrixError`

Custom error class for validation errors. Has `code` property (`DataMatrixErrorCode`) and `message`.
All functions that encode throw it.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `message` | `string` | `''` | The message to encode |
| `rectangular` | `boolean` | `false` | Prefer a rectangular symbol, see below |
| `encoding` | `'utf-8' \| 'iso-8859-1'` | `'utf-8'` | Byte encoding of the text, see [Non-ASCII text](#non-ascii-text) |
| `eci` | `boolean` | `false` | Add an ECI designator naming the encoding |
| `allowEmptyMessage` | `boolean` | `false` | Allow empty message without error |
| `dimension` | `number` | `256` | Output **height** in pixels; the width follows the aspect ratio |
| `padding` | `number` | `2` | Quiet zone in modules (the standard requires at least 1) |
| `palette` | `Palette` | `{ foreground: '#000' }` | Colors; no background by default |
| `verbose` | `boolean` | `false` | One rectangle per module instead of merged horizontal runs |

### Palette Colors

Supports SVG/CSS color values: hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()`,
`hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()`, named colors,
`currentColor`, `transparent`, `none` and `url(#gradient)`. Unrecognized values fall back to
the default.

### Rectangular symbols

With `rectangular: true` the smallest fitting rectangle is used: 8×18, 8×32, 12×26, 12×36,
16×36 or 16×48 modules (height × width). If the data does not fit in the largest
rectangle (49 data codewords, e.g. 98 digits or about 70 uppercase characters), a
**square symbol is used instead** without an error. Check the result if the shape matters:

```typescript
const result = encodeToMatrix(message, { rectangular: true });
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

By default text is encoded as UTF-8 bytes without an ECI (character set) marker. Most modern
readers (ZXing-based apps, phone cameras) detect UTF-8 automatically, but some hardware
scanners assume ISO-8859-1, the standard's default, and show e.g. `Ã¤` for `ä`.

Options, depending on your scanners:

```typescript
// Latin-1: one byte per character, read correctly by scanners that assume ISO-8859-1,
// and more compact. Characters outside Latin-1 (€, –, emoji) throw UNSUPPORTED_CHARACTER.
toSvgString({ message: 'Äiti ja isä', encoding: 'iso-8859-1' });

// ECI: the symbol names its encoding (ECI 26 = UTF-8, ECI 3 = ISO-8859-1), so
// ECI-aware readers need no guessing. Costs 2 codewords; readers without ECI
// support may show the designator as text.
toSvgString({ message: 'Hinta 12 €', eci: true });
```

Test with your scanners before printing labels with non-ASCII text.

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

