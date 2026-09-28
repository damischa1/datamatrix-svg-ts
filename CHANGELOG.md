# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.3] - 2026-09-28

Bug fixes found by decoding the output with an independent reader (ZXing). The
first and third bugs are inherited from the original
[datamatrix-svg](https://github.com/datalog/datamatrix-svg); previous tests only
compared the output with that library, so they could not catch them.

Symbols for unaffected messages are identical to 1.0.2.

### Fixed

- **Messages of exactly 250 bytes in Base256 mode decoded incorrectly.** The
  length was written as a single byte 0, which means "data runs to the end of
  the symbol", so scanners read the padding as data (250 bytes came back as
  278). Base256 is chosen for byte-heavy input, such as text with many
  non-ASCII characters (`ä`, `€`, CJK, emoji).
- **Backtick (`` ` ``) decoded as `9` in TEXT mode.** TEXT mode is chosen for
  mostly lowercase text: ``hello`world`` was read as `hello9world`.
- **Huge input threw `RangeError: Maximum call stack size exceeded`** instead of
  `DataMatrixError` with code `MESSAGE_TOO_LONG`. Input over 3116 bytes is now
  rejected up front, before any encoding work.

If you have printed codes with such content, regenerate them.

### Documentation

- `rectangular: true` falls back to a square symbol when the data does not fit
  in the largest rectangle (16×48, 49 data codewords). This is existing
  behaviour, now documented together with how to detect it
  (`width === height`).
- `dimension` is the output height; rectangular symbols are wider.
- Capacity table (3116 digits, about 2300 uppercase characters, 1555 bytes)
  replaces the inaccurate "~1556 bytes".
- Notes on UTF-8 without ECI (some hardware scanners assume ISO-8859-1), runtime
  support (ESM, Node.js 18+, `encodeToMatrix()` works without a DOM) and the
  minimum quiet zone.
- JSDoc license corrected to MIT.

### Package

- Source files are published so the shipped declaration and source maps
  resolve (go to definition opens the TypeScript source).
- `exports` uses a `default` condition and exposes `./package.json`; the
  redundant `module` field is removed. Resolution is unchanged for ESM
  consumers and bundlers.
- The package is validated with publint and arethetypeswrong, and installed
  and smoke-tested on Node.js 18 and 20 in CI.

### Internal

- Round-trip tests decode every generated symbol with ZXing: all encoding modes,
  every symbol size at its exact capacity, Base256 length boundaries and the
  maximum capacity.
- API tests for the SVG output (geometry, quiet zone, size, colors) and errors.
- GitHub Actions CI: typecheck, tests and build on Node.js 22, 24 and 26.
- Separate build config (`tsconfig.build.json`); tests are type-checked.

## [1.0.2] - 2026-01-28

### Fixed

- Add `.js` extensions to ESM imports so the package loads in Node.js.

## [1.0.1] - 2026-01-08

### Added

- `DataMatrixError` with `code` (`EMPTY_MESSAGE`, `MESSAGE_TOO_LONG`).
- `allowEmptyMessage` option.

## [1.0.0] - 2026-01-08

- TypeScript rewrite of datamatrix-svg with a documented API
  (`DATAMatrix`, `encodeToMatrix`, `matrixToSvg`) and support for all SVG color
  values.

[1.0.3]: https://github.com/damischa1/datamatrix-svg-ts/compare/0f6f4bd...v1.0.3
[1.0.2]: https://github.com/damischa1/datamatrix-svg-ts/commit/0f6f4bd
[1.0.1]: https://github.com/damischa1/datamatrix-svg-ts/commit/9a96b58
[1.0.0]: https://github.com/damischa1/datamatrix-svg-ts/commit/1c49e54
