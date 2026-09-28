/**
 * Decodes encoder output with an independent reader (ZXing C++ via WebAssembly),
 * so tests verify what a scanner actually reads instead of comparing against
 * the original JavaScript implementation.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import type { DataMatrixResult } from '../../src/index.js';

const require = createRequire(import.meta.url);

let ready: Promise<unknown> | undefined;

/** Loads the reader from node_modules instead of the default CDN download. */
function prepare(): Promise<unknown> {
  ready ??= prepareZXingModule({
    overrides: { wasmBinary: readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) },
    fireImmediately: true,
  });
  return ready;
}

/** Rasterizes a module matrix with a quiet zone into RGBA pixels. */
export function rasterize(result: DataMatrixResult, quietZone = 2, scale = 4) {
  const width = (result.width + 2 * quietZone) * scale;
  const height = (result.height + 2 * quietZone) * scale;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);

  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      if (!result.matrix[y]?.[x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quietZone) * scale + dy) * width + (x + quietZone) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }

  return { data, width, height, colorSpace: 'srgb' as const };
}

/** Returns the decoded symbol, or null if no DataMatrix was found. */
export async function read(result: DataMatrixResult) {
  await prepare();
  const [barcode] = await readBarcodes(rasterize(result), {
    formats: ['DataMatrix'],
    tryHarder: false,
  });
  return barcode ?? null;
}

/** Returns the decoded payload bytes (without ECI designators), or null. */
export async function decode(result: DataMatrixResult): Promise<Uint8Array | null> {
  return (await read(result))?.bytes ?? null;
}

export const utf8 = (text: string) => new TextEncoder().encode(text);

export const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
