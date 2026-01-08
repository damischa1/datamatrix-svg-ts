/**
 * DataMatrix SVG Generator
 * 
 * TypeScript implementation based on:
 * https://github.com/datalog/datamatrix-svg
 * Original JavaScript version by Constantine
 * 
 * Original work licensed under MIT License
 * Copyright (c) 2020 Constantine
 * 
 * This TypeScript port maintains the same MIT license.
 */

export interface DataMatrixOptions {
  /** The message to encode */
  msg: string;
  /** Use rectangular format */
  rct?: boolean;
  /** Symbol dimension (default: 256) */
  dim?: number;
  /** Padding (default: 2) */
  pad?: number;
  /** Color palette [foreground, background] */
  pal?: [string, string?];
  /** Verbose SVG output (not optimized) */
  vrb?: boolean;
}

export interface DataMatrixResult {
  /** Width of the matrix including padding */
  width: number;
  /** Height of the matrix including padding */
  height: number;
  /** The matrix data (2D array of 0s and 1s) */
  matrix: number[][];
  /** SVG path data */
  path: string;
}

/**
 * Generate a DataMatrix barcode
 * @param options - Configuration options or just a string message
 * @returns DataMatrix result with matrix data and SVG path
 */
export function generateDataMatrix(options: DataMatrixOptions | string): DataMatrixResult {
  const M: number[][] = [];
  let xx = 0;
  let yy = 0;

  const bit = (x: number, y: number): void => {
    M[y] = M[y] || [];
    M[y][x] = 1;
  };

  const toAscii = (t: string): number[] => {
    const r: number[] = [];
    const l = t.length;

    for (let i = 0; i < l; i++) {
      const c = t.charCodeAt(i);
      const c1 = (i + 1 < l) ? t.charCodeAt(i + 1) : 0;

      if (c > 47 && c < 58 && c1 > 47 && c1 < 58) {
        /* 2 digits */
        r.push((c - 48) * 10 + c1 + 82); /* - 48 + 130 = 82 */
        i++;
      } else if (c > 127) {
        /* extended char */
        r.push(235);
        r.push((c - 127) & 255);
      } else {
        r.push(c + 1); /* char */
      }
    }

    return r;
  };

  const toBase = (t: string): number[] => {
    const r: number[] = [231]; /* switch to Base 256 */
    const l = t.length;

    if (250 < l) {
      r.push((37 + (l / 250 | 0)) & 255); /* length high byte (in 255 state algo) */
    }

    r.push((l % 250 + 149 * (r.length + 1) % 255 + 1) & 255); /* length low byte (in 255 state algo) */

    for (let i = 0; i < l; i++) {
      r.push((t.charCodeAt(i) + 149 * (r.length + 1) % 255 + 1) & 255); /* data in 255 state algo */
    }

    return r;
  };

  const toEdifact = (t: string): number[] => {
    const n = t.length;
    const l = (n + 1) & -4;
    let cw = 0;
    let ch: number;
    const r: number[] = (l > 0) ? [240] : []; /* switch to Edifact */

    for (let i = 0; i < l; i++) {
      if (i < l - 1) {
        /* encode char */
        ch = t.charCodeAt(i);
        if (ch < 32 || ch > 94) return []; /* not in set */
      } else {
        ch = 31; /* return to ASCII */
      }

      cw = cw * 64 + (ch & 63);

      if ((i & 3) === 3) {
        /* 4 data in 3 words */
        r.push(cw >> 16);
        r.push((cw >> 8) & 255);
        r.push(cw & 255);
        cw = 0;
      }
    }

    return l > n ? r : r.concat(toAscii(t.substr(l === 0 ? 0 : l - 1))); /* last chars */
  };

  const toText = (t: string, s: number[]): number[] => {
    let cc = 0;
    let cw = 0;
    const l = t.length;
    const r: number[] = [s[0]]; /* start switch */

    const push = (v: number): void => {
      /* pack 3 chars in 2 codes */
      cw = 40 * cw + v;

      /* add code */
      if (cc++ === 2) {
        r.push(++cw >> 8);
        r.push(cw & 255);
        cc = cw = 0;
      }
    };

    let i: number;
    for (i = 0; i < l; i++) {
      /* last char in ASCII is shorter */
      if (cc === 0 && i === l - 1) break;

      let ch = t.charCodeAt(i);

      if (ch > 127 && r[0] !== 238) {
        /* extended char */
        push(1);
        push(30);
        ch -= 128; /* hi bit in C40 & TEXT */
      }

      let j: number;
      for (j = 1; ch > s[j]; j += 3); /* select char set */

      const x = s[j + 1]; /* shift */

      if (x === 8 || (x === 9 && cc === 0 && i === l - 1)) return []; /* char not in set or padding fails */

      if (x < 5 && cc === 2 && i === l - 1) break; /* last char in ASCII */
      if (x < 5) push(x); /* shift */

      push(ch - s[j + 2]); /* char offset */
    }

    if (cc === 2 && r[0] !== 238) {
      /* add pad */
      push(0);
    }

    r.push(254); /* return to ASCII */

    if (cc > 0 || i < l) {
      return r.concat(toAscii(t.substr(i - cc))); /* last chars */
    }

    return r;
  };

  const encodeMsg = (text: string, rct?: boolean): void => {
    text = unescape(encodeURI(text));

    /* C40 encoding table */
    const c40Table = [
      230,
      31, 0, 0,
      32, 9, 29,
      47, 1, 33,
      57, 9, 44,
      64, 1, 43,
      90, 9, 51,
      95, 1, 69,
      127, 2, 96,
      255, 1, 0
    ];

    /* TEXT encoding table */
    const textTable = [
      239,
      31, 0, 0,
      32, 9, 29,
      47, 1, 33,
      57, 9, 44,
      64, 1, 43,
      90, 2, 64,
      95, 1, 69,
      122, 9, 83,
      127, 2, 96,
      255, 1, 0
    ];

    /* X12 encoding table */
    const x12Table = [
      238,
      12, 8, 0,
      13, 9, 13,
      31, 8, 0,
      32, 9, 29,
      41, 8, 0,
      42, 9, 41,
      47, 8, 0,
      57, 9, 44,
      64, 8, 0,
      90, 9, 51,
      255, 8, 0
    ];

    let enc = toAscii(text);
    let el = enc.length;

    let k = toText(text, c40Table);
    let l = k.length;
    if (l > 0 && l < el) {
      enc = k;
      el = l;
    }

    k = toText(text, textTable);
    l = k.length;
    if (l > 0 && l < el) {
      enc = k;
      el = l;
    }

    k = toText(text, x12Table);
    l = k.length;
    if (l > 0 && l < el) {
      enc = k;
      el = l;
    }

    k = toEdifact(text);
    l = k.length;
    if (l > 0 && l < el) {
      enc = k;
      el = l;
    }

    k = toBase(text);
    l = k.length;
    if (l > 0 && l < el) {
      enc = k;
      el = l;
    }

    let h: number;
    let w: number;
    let nc = 1;
    let nr = 1;
    let fw: number;
    let fh: number;
    let i: number;
    let j = -1;
    let c: number;
    let r: number;
    let s: number;
    let b = 1;
    let x: number;

    const rs = new Array(70);
    const rc = new Array(70);
    const lg = new Array(256);
    const ex = new Array(255);

    let kArr: number[];

    if (rct && el < 50) {
      /* rect */
      kArr = [
        16, 7,
        28, 11,
        24, 14,
        32, 18,
        32, 24,
        44, 28
      ];

      do {
        w = kArr[++j]; /* width */
        h = 6 + (j & 12); /* height */
        l = (w * h) / 8; /* bytes count in symbol */
      } while (l - kArr[++j] < el); /* could we fill the rect? */

      /* column regions */
      if (w > 25) nc = 2;
    } else {
      /* square */
      w = h = 6;
      i = 2; /* size increment */
      kArr = [5, 7, 10, 12, 14, 18, 20, 24, 28, 36, 42, 48, 56, 68, 84, 112, 144, 192, 224, 272, 336, 408, 496, 620];

      do {
        if (++j === kArr.length) {
          xx = 0;
          yy = 0;
          return; /* msg is too long */
        }

        if (w > 11 * i) i = (4 + i) & 12; /* advance increment */

        w = h += i;
        l = (w * h) >> 3;
      } while (l - kArr[j] < el);

      if (w > 27) nr = nc = 2 * ((w / 54) | 0) + 2; /* regions */
      if (l > 255) b = 2 * (l >> 9) + 2; /* blocks */
    }

    s = kArr[j]; /* rs checkwords */
    fw = w / nc; /* region size */
    fh = h / nr;

    /* first padding */
    if (el < l - s) enc[el++] = 129;

    /* more padding */
    while (el < l - s) {
      enc[el++] = (((149 * el) % 253) + 130) % 254;
    }

    /* Reed Solomon error detection and correction */
    s /= b;

    /* log / exp table of Galois field */
    for (j = 1, i = 0; i < 255; i++) {
      ex[i] = j;
      lg[j] = i;
      j += j;

      if (j > 255) j ^= 301; /* 301 == a^8 + a^5 + a^3 + a^2 + 1 */
    }

    /* RS generator polynomial */
    for (rs[s] = 0, i = 1; i <= s; i++) {
      for (j = s - i, rs[j] = 1; j < s; j++) {
        rs[j] = rs[j + 1] ^ ex[(lg[rs[j]] + i) % 255];
      }
    }

    /* RS correction data for each block */
    for (c = 0; c < b; c++) {
      for (i = 0; i <= s; i++) rc[i] = 0;
      for (i = c; i < el; i += b) {
        for (j = 0, x = rc[0] ^ enc[i]; j < s; j++) {
          rc[j] = rc[j + 1] ^ (x ? ex[(lg[rs[j]] + lg[x]) % 255] : 0);
        }
      }

      /* interleaved correction data */
      for (i = 0; i < s; i++) {
        enc[el + c + i * b] = rc[i];
      }
    }

    /* layout perimeter finder pattern */
    /* horizontal */
    for (i = 0; i < h + 2 * nr; i += fh + 2) {
      for (j = 0; j < w + 2 * nc; j++) {
        bit(j, i + fh + 1);
        if ((j & 1) === 0) bit(j, i);
      }
    }

    /* vertical */
    for (i = 0; i < w + 2 * nc; i += fw + 2) {
      for (j = 0; j < h; j++) {
        bit(i, j + ((j / fh) | 0) * 2 + 1);
        if ((j & 1) === 1) bit(i + fw + 1, j + ((j / fh) | 0) * 2);
      }
    }

    s = 2; /* step */
    c = 0; /* column */
    r = 4; /* row */
    const bLayout = [
      /* nominal byte layout */
      0, 0,
      -1, 0,
      -2, 0,
      0, -1,
      -1, -1,
      -2, -1,
      -1, -2,
      -2, -2
    ];

    /* diagonal steps */
    for (i = 0; i < l; r -= s, c += s) {
      let kLayout: number[];

      if (r === h - 3 && c === -1) {
        kLayout = [
          /* corner A layout */
          w, 6 - h,
          w, 5 - h,
          w, 4 - h,
          w, 3 - h,
          w - 1, 3 - h,
          3, 2,
          2, 2,
          1, 2
        ];
      } else if (r === h + 1 && c === 1 && (w & 7) === 0 && (h & 7) === 6) {
        kLayout = [
          /* corner D layout */
          w - 2, -h,
          w - 3, -h,
          w - 4, -h,
          w - 2, -1 - h,
          w - 3, -1 - h,
          w - 4, -1 - h,
          w - 2, -2,
          -1, -2
        ];
      } else {
        if (r === 0 && c === w - 2 && (w & 3)) continue; /* corner B: omit upper left */
        if (r < 0 || c >= w || r >= h || c < 0) {
          /* outside */
          s = -s; /* turn around */
          r += 2 + s / 2;
          c += 2 - s / 2;

          while (r < 0 || c >= w || r >= h || c < 0) {
            r -= s;
            c += s;
          }
        }
        if (r === h - 2 && c === 0 && (w & 3)) {
          kLayout = [
            /* corner B layout */
            w - 1, 3 - h,
            w - 1, 2 - h,
            w - 2, 2 - h,
            w - 3, 2 - h,
            w - 4, 2 - h,
            0, 1,
            0, 0,
            0, -1
          ];
        } else if (r === h - 2 && c === 0 && (w & 7) === 4) {
          kLayout = [
            /* corner C layout */
            w - 1, 5 - h,
            w - 1, 4 - h,
            w - 1, 3 - h,
            w - 1, 2 - h,
            w - 2, 2 - h,
            0, 1,
            0, 0,
            0, -1
          ];
        } else if (r === 1 && c === w - 1 && (w & 7) === 0 && (h & 7) === 6) {
          continue; /* omit corner D */
        } else {
          kLayout = bLayout; /* nominal L-shape layout */
        }
      }

      /* layout each bit */
      for (el = enc[i++], j = 0; el > 0; j += 2, el >>= 1) {
        if (el & 1) {
          let x = c + kLayout[j];
          let y = r + kLayout[j + 1];

          /* wrap around */
          if (x < 0) {
            x += w;
            y += 4 - ((w + 4) & 7);
          }
          if (y < 0) {
            y += h;
            x += 4 - ((h + 4) & 7);
          }

          /* region gap */
          bit(x + 2 * ((x / fw) | 0) + 1, y + 2 * ((y / fh) | 0) + 1);
        }
      }
    }

    /* unfilled corner */
    for (i = w; i & 3; i--) {
      bit(i, i);
    }

    xx = w + 2 * nc;
    yy = h + 2 * nr;
  };

  // Parse options
  const q: DataMatrixOptions = typeof options === 'string' ? { msg: options } : options || { msg: '' };
  const pd = Math.abs(q.pad ?? 2);

  encodeMsg(q.msg || '', q.rct);

  // Generate path
  let path = '';
  let y = yy;

  while (y--) {
    let d = 0;
    let x = xx;

    while (x--) {
      if (M[y] && M[y][x]) {
        d++;
        if (!M[y][x - 1]) {
          path += 'M' + x + ',' + y + 'h' + d + 'v1h-' + d + 'v-1z';
          d = 0;
        }
      }
    }
  }

  return {
    width: xx + pd * 2,
    height: yy + pd * 2,
    matrix: M,
    path
  };
}

/**
 * Generate a DataMatrix SVG string
 * @param options - Configuration options or just a string message
 * @returns SVG string
 */
export function generateDataMatrixSVG(options: DataMatrixOptions | string): string {
  const q: DataMatrixOptions = typeof options === 'string' ? { msg: options } : options || { msg: '' };
  const p = q.pal || ['#000'];
  const dm = Math.abs(q.dim ?? 256);
  const pd = Math.abs(q.pad ?? 2);

  const isHex = (c: string): boolean => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(c);

  const fg = isHex(p[0]) ? p[0] : '#000';
  const bg = p[1] && isHex(p[1]) ? p[1] : undefined;

  const result = generateDataMatrix(options);
  const { width: sx, height: sy, path } = result;

  const mx = [1, 0, 0, 1, pd, pd].join(',');

  let svg = `<svg viewBox="0 0 ${sx} ${sy}" width="${(dm / sy * sx) | 0}" height="${dm}" fill="${fg}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" version="1.1">`;

  if (bg) {
    svg += `<path fill="${bg}" d="M0,0v${sy}h${sx}V0H0Z"/>`;
  }

  svg += `<path transform="matrix(${mx})" d="${path}"/>`;
  svg += '</svg>';

  return svg;
}

// Default export for convenience
export default { generateDataMatrix, generateDataMatrixSVG };
