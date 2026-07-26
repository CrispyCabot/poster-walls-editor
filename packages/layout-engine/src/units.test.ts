import { describe, expect, it } from 'vitest';
import { formatLength, parseLength } from './units.js';

describe('formatLength', () => {
  it('renders inches with no trailing zeros', () => {
    expect(formatLength(62, 'inches')).toBe('62"');
    expect(formatLength(62.5, 'inches')).toBe('62.5"');
    expect(formatLength(62.0, 'inches')).toBe('62"');
  });

  it('renders feet and inches', () => {
    expect(formatLength(62, 'feet-inches')).toBe('5\' 2"');
    expect(formatLength(24, 'feet-inches')).toBe('2\'');
    expect(formatLength(8, 'feet-inches')).toBe('8"');
  });

  it('rounds to two decimals rather than emitting float noise', () => {
    expect(formatLength(0.1 + 0.2, 'inches')).toBe('0.3"');
  });

  it('handles zero', () => {
    expect(formatLength(0, 'inches')).toBe('0"');
    expect(formatLength(0, 'feet-inches')).toBe('0"');
  });
});

describe('parseLength', () => {
  it('parses bare numbers as inches', () => {
    expect(parseLength('62')).toBe(62);
    expect(parseLength('62.5')).toBe(62.5);
  });

  it('parses inch marks', () => {
    expect(parseLength('62"')).toBe(62);
  });

  it('parses feet and inches', () => {
    expect(parseLength(`5' 2"`)).toBe(62);
    expect(parseLength(`5'2`)).toBe(62);
    expect(parseLength(`5'`)).toBe(60);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseLength('  62  ')).toBe(62);
  });

  it('rejects garbage', () => {
    expect(parseLength('abc')).toBeNull();
    expect(parseLength('')).toBeNull();
    expect(parseLength('-5')).toBeNull();
  });
});
