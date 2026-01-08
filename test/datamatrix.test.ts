import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import DATAMatrixTS from '../src/datamatrix-svg';

// Setup global document for both JS and TS versions
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(global as any).document = dom.window.document;

// Import the original JS version (kept as reference for comparison)
const DATAMatrixJS = require('./datamatrix.js');

describe('DataMatrix SVG Generation', () => {
  const testCases = [
    // === Short data ===
    { name: 'Single char', msg: 'A' },
    { name: 'Two chars', msg: 'AB' },
    { name: 'Three chars', msg: 'ABC' },
    { name: 'Single digit', msg: '5' },
    { name: 'Two digits', msg: '42' },
    
    // === Basic text ===
    { name: 'Simple text', msg: 'Hello World!' },
    { name: 'Lowercase only', msg: 'abcdefghijklmnopqrstuvwxyz' },
    { name: 'Uppercase only', msg: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
    { name: 'Mixed case', msg: 'AbCdEfGhIjKlMnOpQrStUvWxYz' },
    
    // === Numeric data ===
    { name: 'Short numbers', msg: '123' },
    { name: 'Numbers', msg: '1234567890' },
    { name: 'Long numbers', msg: '12345678901234567890' },
    { name: 'Phone number', msg: '+358401234567' },
    { name: 'Decimal numbers', msg: '123.456.789' },
    { name: 'Digit pairs optimized', msg: '00112233445566778899' },
    
    // === Special ASCII characters ===
    { name: 'Punctuation', msg: '.,;:!?' },
    { name: 'Symbols', msg: '@#$%^&*()' },
    { name: 'Brackets', msg: '[]{}()<>' },
    { name: 'Math symbols', msg: '+-*/=~' },
    { name: 'Quotes', msg: '"\'`' },
    { name: 'Mixed symbols', msg: 'Test!@#$%^&*()123' },
    { name: 'Backslash and pipe', msg: '\\|/' },
    
    // === URL and technical data ===
    { name: 'URL', msg: 'https://example.com' },
    { name: 'Long URL', msg: 'https://example.com/path/to/resource?query=value&foo=bar' },
    { name: 'Email', msg: 'test@example.com' },
    { name: 'IP address', msg: '192.168.1.1' },
    { name: 'UUID', msg: '550e8400-e29b-41d4-a716-446655440000' },
    { name: 'JSON-like', msg: '{"key":"value","num":123}' },
    
    // === UTF-8 / International characters ===
    { name: 'Finnish chars', msg: 'Äiti ja isä' },
    { name: 'Finnish: ääkköset', msg: 'äöåÄÖÅ' },
    { name: 'Swedish', msg: 'Räksmörgås' },
    { name: 'German', msg: 'Größe und Maße' },
    { name: 'French', msg: 'Café résumé' },
    { name: 'Spanish', msg: 'Año español ñ' },
    { name: 'Czech', msg: 'Příliš žluťoučký' },
    { name: 'Polish', msg: 'Zażółć gęślą' },
    { name: 'Russian', msg: 'Привет мир' },
    { name: 'Greek', msg: 'Ελληνικά' },
    { name: 'Japanese hiragana', msg: 'こんにちは' },
    { name: 'Japanese katakana', msg: 'カタカナ' },
    { name: 'Chinese', msg: '你好世界' },
    { name: 'Korean', msg: '안녕하세요' },
    { name: 'Arabic', msg: 'مرحبا' },
    { name: 'Hebrew', msg: 'שלום' },
    { name: 'Emoji', msg: '😀🎉🚀' },
    { name: 'Mixed emoji and text', msg: 'Hello 👋 World 🌍!' },
    
    // === Extended ASCII (128-255) ===
    { name: 'Copyright symbol', msg: '© 2024' },
    { name: 'Registered trademark', msg: '® Brand™' },
    { name: 'Currency symbols', msg: '€£¥$¢' },
    { name: 'Degree and fractions', msg: '45°C ½ ¼ ¾' },
    { name: 'Math extended', msg: '± × ÷ √' },
    
    // === Long data ===
    { name: 'Medium text (50 chars)', msg: 'This is a medium length text string for testing!!' },
    { name: 'Long text (100 chars)', msg: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.' },
    { name: 'Very long text (200 chars)', msg: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi.' },
    { name: 'Repeated pattern', msg: 'ABCABCABCABCABCABCABCABCABCABC' },
    { name: 'Long numbers', msg: '11111111112222222222333333333344444444445555555555' },
    
    // === Edge cases ===
    { name: 'Space only', msg: ' ' },
    { name: 'Multiple spaces', msg: '   ' },
    { name: 'Leading/trailing spaces', msg: '  hello  ' },
    { name: 'Tab character', msg: 'a\tb' },
    { name: 'Newline', msg: 'line1\nline2' },
    { name: 'Carriage return', msg: 'line1\rline2' },
    { name: 'CRLF', msg: 'line1\r\nline2' },
    { name: 'Null-like string', msg: 'null' },
    { name: 'Empty-like strings', msg: 'undefined' },
    
    // === Binary-like data ===
    { name: 'Hex string', msg: '0x1A2B3C4D5E6F' },
    { name: 'Binary string', msg: '01010101' },
    { name: 'Base64-like', msg: 'SGVsbG8gV29ybGQh' },
    
    // === Real-world use cases ===
    { name: 'Product code', msg: 'SKU-12345-ABC' },
    { name: 'Serial number', msg: 'SN:2024-001-XYZ' },
    { name: 'Date ISO', msg: '2024-12-25T10:30:00Z' },
    { name: 'Date Finnish', msg: '25.12.2024' },
    { name: 'Postal code FI', msg: 'FI-00100 Helsinki' },
    { name: 'IBAN', msg: 'FI2112345600000785' },
    { name: 'Credit card format', msg: '4111-1111-1111-1111' },
    { name: 'MAC address', msg: '00:1A:2B:3C:4D:5E' },
    { name: 'VIN', msg: 'WVWZZZ3CZWE123456' },
  ];

  testCases.forEach(({ name, msg }) => {
    it(`should generate identical SVG for: ${name}`, () => {
      // Generate with JS version
      const svgJS = DATAMatrixJS(msg);
      const svgJSString = svgJS.outerHTML;

      // Generate with TS version
      const svgTS = DATAMatrixTS(msg);
      const svgTSString = svgTS.outerHTML;

      // Compare
      expect(svgTSString).toBe(svgJSString);

      // Log for visual inspection
      console.log(`\n=== ${name}: "${msg}" ===`);
      console.log('JS:', svgJSString.substring(0, 200) + '...');
      console.log('TS:', svgTSString.substring(0, 200) + '...');
      console.log('Match:', svgTSString === svgJSString ? '✅ IDENTICAL' : '❌ DIFFERENT');
    });
  });

  it('should generate identical SVG with options', () => {
    // Use old API for JS version
    const jsOptions = {
      msg: 'Test message',
      dim: 200,
      pad: 4,
      pal: ['#000000', '#ffffff'],
    };

    // Use new API for TS version
    const tsOptions = {
      message: 'Test message',
      dimension: 200,
      padding: 4,
      palette: { foreground: '#000000' as const, background: '#ffffff' as const },
    };

    const svgJS = DATAMatrixJS(jsOptions);
    const svgTS = DATAMatrixTS(tsOptions);

    const svgJSString = svgJS.outerHTML;
    const svgTSString = svgTS.outerHTML;

    expect(svgTSString).toBe(svgJSString);

    console.log('\n=== With Options ===');
    console.log('JS:', svgJSString);
    console.log('TS:', svgTSString);
  });

  it('should generate identical rectangular DataMatrix', () => {
    // Use old API for JS version
    const jsOptions = {
      msg: '12345',
      rct: true,
    };

    // Use new API for TS version
    const tsOptions = {
      message: '12345',
      rectangular: true,
    };

    const svgJS = DATAMatrixJS(jsOptions);
    const svgTS = DATAMatrixTS(tsOptions);

    const svgJSString = svgJS.outerHTML;
    const svgTSString = svgTS.outerHTML;

    expect(svgTSString).toBe(svgJSString);

    console.log('\n=== Rectangular ===');
    console.log('JS:', svgJSString);
    console.log('TS:', svgTSString);
  });
});

describe('Output Sample SVGs', () => {
  it('generates sample SVG files for comparison', () => {
    const msg = 'Hello DataMatrix!';
    
    const svgJS = DATAMatrixJS(msg);
    const svgTS = DATAMatrixTS(msg);

    // Create test-output directory
    const outputDir = join(__dirname, '..', 'test-output');
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch (e) {
      // Directory may already exist
    }

    // Save SVG files for visual comparison
    const svgJSString = svgJS.outerHTML;
    const svgTSString = svgTS.outerHTML;

    writeFileSync(join(outputDir, 'sample-js.svg'), svgJSString);
    writeFileSync(join(outputDir, 'sample-ts.svg'), svgTSString);

    // Also save with different test cases
    const testCases = [
      { name: 'simple', msg: 'Hello World!' },
      { name: 'numbers', msg: '1234567890' },
      { name: 'url', msg: 'https://example.com' },
      { name: 'finnish', msg: 'Äiti ja isä' },
    ];

    testCases.forEach(({ name, msg }) => {
      const js = DATAMatrixJS(msg);
      const ts = DATAMatrixTS(msg);
      writeFileSync(join(outputDir, `${name}-js.svg`), js.outerHTML);
      writeFileSync(join(outputDir, `${name}-ts.svg`), ts.outerHTML);
    });

    console.log('\n' + '='.repeat(60));
    console.log('SAMPLE SVG OUTPUT COMPARISON');
    console.log('='.repeat(60));
    console.log(`\nSVG files saved to: ${outputDir}`);
    console.log('Files created:');
    console.log('  - sample-js.svg / sample-ts.svg');
    testCases.forEach(({ name }) => {
      console.log(`  - ${name}-js.svg / ${name}-ts.svg`);
    });
    
    console.log('\n--- JavaScript Version (datamatrix.js) ---');
    console.log(svgJSString);
    
    console.log('\n--- TypeScript Version (datamatrix-svg.ts) ---');
    console.log(svgTSString);
    
    console.log('\n--- Comparison ---');
    console.log('Identical:', svgJSString === svgTSString ? '✅ YES' : '❌ NO');
    console.log('='.repeat(60));

    expect(svgTSString).toBe(svgJSString);
  });
});
