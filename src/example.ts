/**
 * Example usage of DataMatrix SVG Generator
 */

import { generateDataMatrix, generateDataMatrixSVG } from './index';

// Simple string encoding
const svg1 = generateDataMatrixSVG('Hello World!');
console.log('Simple DataMatrix SVG:');
console.log(svg1);
console.log('\n---\n');

// With options
const svg2 = generateDataMatrixSVG({
  msg: 'https://example.com',
  dim: 200,
  pad: 4,
  pal: ['#000000', '#ffffff']
});
console.log('DataMatrix with options:');
console.log(svg2);
console.log('\n---\n');

// Rectangular format
const svg3 = generateDataMatrixSVG({
  msg: '12345',
  rct: true,
  dim: 150
});
console.log('Rectangular DataMatrix:');
console.log(svg3);
console.log('\n---\n');

// Get raw matrix data
const result = generateDataMatrix('Test');
console.log('Matrix dimensions:', result.width, 'x', result.height);
console.log('Path data length:', result.path.length);
