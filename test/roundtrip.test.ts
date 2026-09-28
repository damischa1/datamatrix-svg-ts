// @vitest-environment node
/**
 * Round-trip tests: encode with this library, decode with ZXing, and compare
 * the payload byte for byte.
 */
import { describe, expect, it } from 'vitest';
import { DataMatrixError, encodeToMatrix } from '../src/index.js';
import { decode, latin1, read, utf8 } from './helpers/decode.js';

/** Deterministic PRNG so failures are reproducible. */
function random(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function randomString(charset: string, length: number, rnd: () => number): string {
  const chars = Array.from(charset);
  return Array.from({ length }, () => chars[Math.floor(rnd() * chars.length)]).join('');
}

/** Character sets that steer the encoder into each of its modes. */
const CHARSETS: Record<string, string> = {
  digits: '0123456789',
  c40: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
  text: 'abcdefghijklmnopqrstuvwxyz0123456789 ',
  x12: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 *>\r',
  edifact: ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^',
  printable: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''),
  control: Array.from({ length: 128 }, (_, i) => String.fromCharCode(i)).join(''),
  latin: 'aäöåÄÖÅéü€ABC123 ',
  cjk: '你好世界こんにちは안녕',
  emoji: '😀🎉🚀a',
};

/** Square symbol sizes and their data capacity in codewords (ISO/IEC 16022). */
const SQUARE_CAPACITY: [size: number, dataCodewords: number][] = [
  [10, 3], [12, 5], [14, 8], [16, 12], [18, 18], [20, 22], [22, 30], [24, 36],
  [26, 44], [32, 62], [36, 86], [40, 114], [44, 144], [48, 174], [52, 204],
  [64, 280], [72, 368], [80, 456], [88, 576], [96, 696], [104, 816],
  [120, 1050], [132, 1304], [144, 1558],
];

/** Rectangular symbol sizes (height x width) and their data capacity. */
const RECTANGULAR_CAPACITY: [height: number, width: number, dataCodewords: number][] = [
  [8, 18, 5], [8, 32, 10], [12, 26, 16], [12, 36, 22], [16, 36, 32], [16, 48, 49],
];

async function expectRoundTrip(message: string, rectangular = false) {
  const result = encodeToMatrix(message, rectangular);
  expect(await decode(result)).toEqual(utf8(message));
  return result;
}

describe('round trip: random messages in every encoding mode', () => {
  for (const [name, charset] of Object.entries(CHARSETS)) {
    it(`${name}, lengths 1-40, square and rectangular`, async () => {
      const rnd = random(name.length * 7919);
      for (let length = 1; length <= 40; length++) {
        const message = randomString(charset, length, rnd);
        await expectRoundTrip(message, false);
        await expectRoundTrip(message, true);
      }
    });
  }

  it('long messages up to multi-block symbols', async () => {
    const rnd = random(42);
    for (const length of [100, 250, 400, 700, 1000, 1500]) {
      for (const charset of ['digits', 'c40', 'printable', 'latin']) {
        const message = randomString(CHARSETS[charset]!, length, rnd);
        if (utf8(message).length > 1555) continue;
        await expectRoundTrip(message);
      }
    }
  });

  it('real-world payloads', async () => {
    for (const message of [
      'SH-123456-ABC',
      'https://www.salhydro.fi/tuote/123',
      '0106412345678905\x1d10ABC123',
      'Äiti ja isä',
      'line1\r\nline2',
      'hello`world',
      'select `name` from users',
      '550e8400-e29b-41d4-a716-446655440000',
    ]) {
      await expectRoundTrip(message);
    }
  });
});

describe('round trip: Base256 length field', () => {
  // Two-byte UTF-8 characters push the encoder into Base256 mode, whose length
  // switches from one byte to two at 250.
  const bytes = (n: number) => 'ä'.repeat(Math.floor(n / 2)) + (n % 2 ? 'x' : '');

  for (const n of [248, 249, 250, 251, 252, 499, 500, 501, 750, 1000, 1250]) {
    it(`${n} bytes`, async () => {
      await expectRoundTrip(bytes(n));
    });
  }

  it('fills the largest symbol exactly at 1555 bytes', async () => {
    const result = await expectRoundTrip(bytes(1555));
    expect(result.width).toBe(144);
  });

  it('rejects 1556 bytes', () => {
    expect(() => encodeToMatrix(bytes(1556))).toThrow(DataMatrixError);
  });
});

describe('round trip: symbol size selection', () => {
  // Digit pairs pack into one codeword each, so 2n digits need exactly n codewords.
  for (const [index, [size, capacity]] of SQUARE_CAPACITY.entries()) {
    it(`square ${size}x${size} holds ${capacity} codewords`, async () => {
      const full = await expectRoundTrip('1'.repeat(2 * capacity));
      expect([full.width, full.height]).toEqual([size, size]);

      const next = SQUARE_CAPACITY[index + 1];
      if (next) {
        const overflow = encodeToMatrix('1'.repeat(2 * capacity + 2));
        expect(overflow.width).toBe(next[0]);
      }
    });
  }

  for (const [height, width, capacity] of RECTANGULAR_CAPACITY) {
    it(`rectangular ${height}x${width} holds ${capacity} codewords`, async () => {
      const result = await expectRoundTrip('1'.repeat(2 * capacity), true);
      expect([result.width, result.height]).toEqual([width, height]);
    });
  }

  it('falls back to a square symbol when data exceeds the largest rectangle', async () => {
    const result = await expectRoundTrip('1'.repeat(2 * 49 + 2), true);
    expect(result.width).toBe(result.height);
  });

  it('accepts 3116 digits (maximum capacity) and rejects 3117', async () => {
    await expectRoundTrip('7'.repeat(3116));
    expect(() => encodeToMatrix('7'.repeat(3117))).toThrow(DataMatrixError);
  });
});

describe('round trip: encoding and ECI', () => {
  const FINNISH = 'Äiti ja isä söivät jäätelöä – Åbo';
  const LATIN1 = FINNISH.replace('–', '-');

  it('encodes ISO-8859-1 as one byte per character', async () => {
    const result = encodeToMatrix(LATIN1, { encoding: 'iso-8859-1' });
    expect(await decode(result)).toEqual(latin1(LATIN1));
    expect(result.width).toBeLessThan(encodeToMatrix(LATIN1).width);
  });

  it('rejects characters outside ISO-8859-1', () => {
    try {
      encodeToMatrix(FINNISH, { encoding: 'iso-8859-1' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DataMatrixError);
      expect((e as DataMatrixError).code).toBe('UNSUPPORTED_CHARACTER');
      expect((e as DataMatrixError).message).toContain('U+2013');
    }
  });

  for (const [encoding, eciNumber, text] of [
    ['utf-8', 26, FINNISH],
    ['iso-8859-1', 3, LATIN1],
  ] as const) {
    it(`marks ${encoding} with ECI ${eciNumber} and decodes to the original text`, async () => {
      const barcode = await read(encodeToMatrix(text, { encoding, eci: true }));
      expect(barcode?.hasECI).toBe(true);
      expect(barcode?.text).toBe(text);
    });
  }

  it('keeps Base256 randomization aligned after the ECI designator', async () => {
    // Two-byte characters force Base256 mode, whose codewords depend on their position
    for (const n of [1, 10, 124, 125, 126, 500, 776]) {
      const text = 'ä'.repeat(n);
      const barcode = await read(encodeToMatrix(text, { eci: true }));
      expect(barcode?.text).toBe(text);
    }
  });

  it('round-trips random text in every mode with ECI', async () => {
    const rnd = random(2024);
    for (const [name, charset] of Object.entries(CHARSETS)) {
      for (let length = 1; length <= 30; length += 3) {
        const text = randomString(charset, length, rnd);
        const barcode = await read(encodeToMatrix(text, { eci: true }));
        expect(barcode?.bytes, `${name}: ${JSON.stringify(text)}`).toEqual(utf8(text));
      }
    }
  });

  it('rejects an unknown encoding', () => {
    // @ts-expect-error -- invalid value from untyped callers
    expect(() => encodeToMatrix('x', { encoding: 'latin-9' })).toThrow(TypeError);
  });
});
