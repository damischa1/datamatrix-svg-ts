/**
 * Public API and SVG rendering behaviour.
 */
import { describe, expect, it } from 'vitest';
import defaultExport, {
  DATAMatrix,
  DataMatrixError,
  encodeToMatrix,
  matrixToSvg,
  matrixToSvgString,
  toSvgString,
  type DataMatrixOptions,
  type DataMatrixResult,
} from '../src/index.js';

/** Rebuilds the module matrix from the rectangles in an SVG path. */
function modulesFromPath(d: string, width: number, height: number): number[][] {
  const grid = Array.from({ length: height }, () => new Array<number>(width).fill(0));
  for (const [, x, y, run] of d.matchAll(/M(\d+),(\d+)h(\d+)v1h-\d+v-1z/g)) {
    for (let i = 0; i < Number(run); i++) grid[Number(y)]![Number(x) + i] = 1;
  }
  return grid;
}

function dense(result: DataMatrixResult): number[][] {
  return Array.from({ length: result.height }, (_, y) =>
    Array.from({ length: result.width }, (_, x) => (result.matrix[y]?.[x] ? 1 : 0))
  );
}

const barcodePath = (svg: SVGSVGElement) => svg.querySelector('path[transform]')!;

describe('entry point', () => {
  it('exports DATAMatrix as the default export', () => {
    expect(defaultExport).toBe(DATAMatrix);
  });

  it('accepts a plain string or an options object', () => {
    expect(DATAMatrix('ABC').outerHTML).toBe(DATAMatrix({ message: 'ABC' }).outerHTML);
  });
});

describe('matrixToSvg', () => {
  const result = encodeToMatrix('Hello DataMatrix!');

  it('draws exactly the modules of the matrix', () => {
    const d = barcodePath(matrixToSvg(result)).getAttribute('d')!;
    expect(modulesFromPath(d, result.width, result.height)).toEqual(dense(result));
  });

  it('draws the same modules in verbose mode', () => {
    const d = barcodePath(matrixToSvg(result, { verbose: true })).getAttribute('d')!;
    expect(modulesFromPath(d, result.width, result.height)).toEqual(dense(result));
  });

  it('adds the quiet zone to the viewBox and offsets the barcode', () => {
    const svg = matrixToSvg(result, { padding: 3 });
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${result.width + 6} ${result.height + 6}`);
    expect(barcodePath(svg).getAttribute('transform')).toBe('matrix(1,0,0,1,3,3)');
  });

  it('supports padding 0', () => {
    const svg = matrixToSvg(result, { padding: 0 });
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${result.width} ${result.height}`);
  });

  it('defaults to 256 px height with a 2-module quiet zone', () => {
    const svg = matrixToSvg(result);
    expect(svg.getAttribute('height')).toBe('256');
    expect(svg.getAttribute('width')).toBe('256');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${result.width + 4} ${result.height + 4}`);
  });

  it('uses dimension as the height; rectangular symbols get a proportional width', () => {
    const rect = encodeToMatrix('12345', true); // 18 x 8 modules, 22 x 12 with quiet zone
    const svg = matrixToSvg(rect, { dimension: 120 });
    expect(svg.getAttribute('height')).toBe('120');
    expect(svg.getAttribute('width')).toBe('220');
  });

  it('applies foreground and optional background colors', () => {
    const plain = matrixToSvg(result);
    expect(plain.getAttribute('fill')).toBe('#000');
    expect(plain.querySelectorAll('path')).toHaveLength(1);

    const colored = matrixToSvg(result, {
      palette: { foreground: 'currentColor', background: '#fff' },
    });
    expect(colored.getAttribute('fill')).toBe('currentColor');
    const [background] = colored.querySelectorAll('path');
    expect(background!.getAttribute('fill')).toBe('#fff');
  });

  it('produces a standalone SVG document', () => {
    const svg = matrixToSvg(result);
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
  });
});

describe('toSvgString / matrixToSvgString', () => {
  const variants: DataMatrixOptions[] = [
    { message: 'Hello DataMatrix!' },
    { message: 'Äiti ja isä', dimension: 100, padding: 0 },
    { message: '12345', rectangular: true, padding: 1 },
    { message: 'colors', palette: { foreground: 'currentColor', background: '#fff' } },
    { message: 'verbose', verbose: true },
    { message: 'Äiti', encoding: 'iso-8859-1', eci: true },
  ];

  for (const options of variants) {
    it(`matches the DOM output: ${JSON.stringify(options)}`, () => {
      expect(toSvgString(options)).toBe(DATAMatrix(options).outerHTML);
      const result = encodeToMatrix(options.message, options);
      expect(matrixToSvgString(result, options)).toBe(matrixToSvg(result, options).outerHTML);
    });
  }

  it('accepts a plain string', () => {
    expect(toSvgString('ABC')).toBe(DATAMatrix('ABC').outerHTML);
  });

  it('escapes attribute values', () => {
    const markup = toSvgString({ message: 'x', palette: { foreground: 'url("#a&b")' } });
    expect(markup).toContain('fill="url(&quot;#a&amp;b&quot;)"');
  });

  it('parses as SVG', () => {
    const doc = new DOMParser().parseFromString(toSvgString('parse me'), 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.tagName).toBe('svg');
    expect(doc.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('throws the same errors as DATAMatrix', () => {
    expect(() => toSvgString('')).toThrow(DataMatrixError);
  });
});

describe('option validation', () => {
  const result = encodeToMatrix('options');
  const viewBox = (padding: number) => `0 0 ${result.width + 2 * padding} ${result.height + 2 * padding}`;

  it('uses the default padding for negative or non-numeric values', () => {
    for (const padding of [-3, NaN, Infinity]) {
      expect(matrixToSvg(result, { padding }).getAttribute('viewBox')).toBe(viewBox(2));
    }
  });

  it('uses the default dimension for zero, negative or non-numeric values', () => {
    for (const dimension of [0, -100, NaN]) {
      expect(matrixToSvg(result, { dimension }).getAttribute('height')).toBe('256');
    }
  });

  it('accepts numeric strings from untyped callers', () => {
    const svg = matrixToSvg(result, { padding: '1' as unknown as number, dimension: '64' as unknown as number });
    expect(svg.getAttribute('viewBox')).toBe(viewBox(1));
    expect(svg.getAttribute('height')).toBe('64');
  });
});

describe('encodeToMatrix', () => {
  it('returns the symbol size including the finder pattern', () => {
    const result = encodeToMatrix('A');
    expect([result.width, result.height]).toEqual([10, 10]);
  });

  it('uses a rectangular symbol when requested and the data fits', () => {
    const result = encodeToMatrix('12345', true);
    expect([result.width, result.height]).toEqual([18, 8]);
  });

  it('returns a dense 0/1 matrix of exactly width x height in every symbol size', () => {
    // 2n digits need n codewords; these lengths hit every square and rectangular size
    const squareCapacities = [3, 5, 8, 12, 18, 22, 30, 36, 44, 62, 86, 114, 144, 174, 204,
      280, 368, 456, 576, 696, 816, 1050, 1304, 1558];
    const rectangularCapacities = [5, 10, 16, 22, 32, 49];
    const results = [
      ...squareCapacities.map((n) => encodeToMatrix('1'.repeat(2 * n))),
      ...rectangularCapacities.map((n) => encodeToMatrix('1'.repeat(2 * n), true)),
    ];
    expect(new Set(results.map((r) => `${r.width}x${r.height}`)).size).toBe(30);

    for (const { matrix, width, height } of results) {
      expect(matrix).toHaveLength(height);
      for (const row of matrix) {
        expect(row).toHaveLength(width);
        expect(row.every((v) => v === 0 || v === 1)).toBe(true);
      }
    }
  });

  it('accepts an options object and the older positional arguments', () => {
    expect(encodeToMatrix('12345', { rectangular: true })).toEqual(encodeToMatrix('12345', true));
    expect(encodeToMatrix('', { allowEmptyMessage: true })).toEqual(encodeToMatrix('', false, true));
  });

  it('passes encoding options through DATAMatrix', () => {
    const plain = DATAMatrix('Äiti').outerHTML;
    expect(DATAMatrix({ message: 'Äiti', encoding: 'iso-8859-1' }).outerHTML).not.toBe(plain);
    expect(DATAMatrix({ message: 'Äiti', eci: true }).outerHTML).not.toBe(plain);
  });

  it('works without a DOM', () => {
    const { document } = globalThis;
    // @ts-expect-error -- simulate a non-browser runtime
    delete globalThis.document;
    try {
      expect(encodeToMatrix('no DOM needed').width).toBeGreaterThan(0);
    } finally {
      globalThis.document = document;
    }
  });
});

describe('errors', () => {
  const codeOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(DataMatrixError);
      expect(e).toBeInstanceOf(Error);
      return (e as DataMatrixError).code;
    }
    throw new Error('expected a DataMatrixError');
  };

  it('rejects an empty message by default', () => {
    expect(codeOf(() => DATAMatrix(''))).toBe('EMPTY_MESSAGE');
    expect(codeOf(() => encodeToMatrix(''))).toBe('EMPTY_MESSAGE');
  });

  it('allows an empty message when asked to', () => {
    expect(encodeToMatrix('', false, true).width).toBe(10);
    expect(DATAMatrix({ message: '', allowEmptyMessage: true }).tagName).toBe('svg');
  });

  it('rejects a message that does not fit', () => {
    expect(codeOf(() => DATAMatrix('A'.repeat(3000)))).toBe('MESSAGE_TOO_LONG');
  });

  it('rejects a huge message with MESSAGE_TOO_LONG, not a stack overflow', () => {
    expect(codeOf(() => encodeToMatrix('x'.repeat(500_000)))).toBe('MESSAGE_TOO_LONG');
  });

  it('has a useful name and message', () => {
    const error = new DataMatrixError('EMPTY_MESSAGE', 'Message cannot be empty');
    expect(error.name).toBe('DataMatrixError');
    expect(String(error)).toBe('DataMatrixError: Message cannot be empty');
  });
});
