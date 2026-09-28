// @vitest-environment node
/**
 * The string renderer and the encoder must work without a DOM.
 */
import { expect, it } from 'vitest';
import { encodeToMatrix, matrixToSvgString, toSvgString } from '../src/index.js';

it('has no DOM in this environment', () => {
  expect(typeof document).toBe('undefined');
});

it('renders SVG markup without a DOM', () => {
  const markup = toSvgString({ message: 'Hello from Node', palette: { background: 'white' } });
  expect(markup).toMatch(/^<svg viewBox="0 0 22 22" width="256" height="256" fill="#000" .*<\/svg>$/);
  expect(markup.match(/<path /g)).toHaveLength(2);
});

it('renders a matrix without a DOM', () => {
  expect(matrixToSvgString(encodeToMatrix('x'), { padding: 1 })).toContain('viewBox="0 0 12 12"');
});
