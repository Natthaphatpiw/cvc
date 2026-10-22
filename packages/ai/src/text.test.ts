import { describe, expect, it } from 'vitest';
import { truncate, wellFormed } from './text';

const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('wellFormed', () => {
  it('replaces half an emoji and keeps whole ones', () => {
    expect(wellFormed('ลดราคา 😍\uD83D')).toBe('ลดราคา 😍�');
    expect(wellFormed('\uDE0Dท้าย')).toBe('�ท้าย');
    expect(wellFormed('โปร 😍🔥 วันนี้')).toBe('โปร 😍🔥 วันนี้');
  });
});

describe('truncate', () => {
  it('never cuts an emoji in two', () => {
    const text = 'ab😍😍😍';
    for (let max = 1; max < text.length; max++) expect(LONE.test(truncate(text, max))).toBe(false);
    expect(truncate('ab😍cd', 4)).toBe('ab…');
  });
});
