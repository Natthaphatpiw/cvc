import { describe, expect, it } from 'vitest';
import {
  THAI_WEEKDAYS,
  formatCompact,
  formatDateTh,
  formatNumber,
  formatPct,
  formatRelativeTh,
  formatTHB,
  formatTHBRange,
  isThaiText,
  normalizeHandle,
  segmentWords,
  thaiShare,
  toFtsText,
  toTsQuery,
} from './index';

describe('script detection', () => {
  it('measures the Thai share of letters', () => {
    expect(thaiShare('สวัสดีครับ')).toBe(1);
    expect(thaiShare('hello')).toBe(0);
    expect(thaiShare('12345 !!')).toBe(0);
    expect(thaiShare('รีวิว skincare')).toBeGreaterThan(0.3);
    expect(isThaiText('รีวิวครีมกันแดด by Ann')).toBe(true);
    expect(isThaiText('Daily vlog in Bangkok')).toBe(false);
  });
});

describe('segmentation', () => {
  it('splits Thai words with Intl.Segmenter', () => {
    expect(segmentWords('รีวิวครีมกันแดดสำหรับผิวแพ้ง่าย')).toEqual(['รีวิว', 'ครีม', 'กันแดด', 'สำหรับ', 'ผิว', 'แพ้', 'ง่าย']);
    expect(segmentWords('ครีม, กันแดด!')).toEqual(['ครีม', 'กันแดด']);
  });

  it('builds FTS text and AND queries', () => {
    expect(toFtsText('ครีมกันแดด SPF50')).toBe('ครีม กันแดด spf50');
    expect(toTsQuery('ครีมกันแดด')).toBe('ครีม & กันแดด');
    expect(toTsQuery("ครีม don't & (x)")).toBe('ครีม & dont & x');
    expect(toTsQuery('  ')).toBe('');
  });
});

describe('number formatting', () => {
  it('formats plain numbers and missing values', () => {
    expect(formatNumber(62000)).toBe('62,000');
    expect(formatNumber(0.3561, 2)).toBe('0.36');
    expect(formatNumber(null)).toBe('–');
    expect(formatNumber(undefined)).toBe('–');
    expect(formatNumber(Number.NaN)).toBe('–');
  });

  it('formats compact numbers with Latin suffixes', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(62000)).toBe('62K');
    expect(formatCompact(1240000)).toBe('1.2M');
    expect(formatCompact(15500)).toBe('15.5K');
    expect(formatCompact(999_950)).toBe('1M');
    expect(formatCompact(-2500)).toBe('-2.5K');
    expect(formatCompact(null)).toBe('–');
    expect(formatCompact(Number.NaN)).toBe('–');
  });

  it('formats THB, ranges and percentages', () => {
    expect(formatTHB(22500)).toBe('฿22,500');
    expect(formatTHB(null)).toBe('–');
    expect(formatTHBRange({ min: 15000, max: 30000 })).toBe('฿15,000–30,000');
    expect(formatTHBRange({ min: 5000, max: 5000 })).toBe('฿5,000');
    expect(formatTHBRange(null)).toBe('–');
    expect(formatPct(0.071)).toBe('7.1%');
    expect(formatPct(0.5, 0)).toBe('50%');
    expect(formatPct(undefined)).toBe('–');
  });
});

describe('dates', () => {
  it('formats Buddhist-era dates in Asia/Bangkok', () => {
    expect(formatDateTh('2026-10-21T03:00:00Z')).toBe('21 ต.ค. 2569');
    // 20:30 UTC is already the next day in Bangkok.
    expect(formatDateTh('2026-12-31T20:30:00Z')).toBe('1 ม.ค. 2570');
    expect(formatDateTh(new Date('2026-10-21T03:05:00Z'), { withTime: true })).toBe('21 ต.ค. 2569 10:05 น.');
    expect(formatDateTh('not a date')).toBe('–');
  });

  it('formats relative times', () => {
    const now = new Date('2026-10-21T10:00:00Z');
    expect(formatRelativeTh('2026-10-21T09:59:30Z', now)).toBe('เมื่อสักครู่');
    expect(formatRelativeTh('2026-10-21T09:55:00Z', now)).toBe('5 นาทีที่แล้ว');
    expect(formatRelativeTh('2026-10-21T07:00:00Z', now)).toBe('3 ชั่วโมงที่แล้ว');
    expect(formatRelativeTh('2026-10-19T10:00:00Z', now)).toBe('2 วันที่แล้ว');
    expect(formatRelativeTh('2026-10-24T10:00:00Z', now)).toBe('อีก 3 วัน');
  });

  it('lists weekdays from Monday', () => {
    expect(THAI_WEEKDAYS).toHaveLength(7);
    expect(THAI_WEEKDAYS[0]).toBe('จันทร์');
    expect(THAI_WEEKDAYS[6]).toBe('อาทิตย์');
  });
});

describe('normalizeHandle', () => {
  it('strips @, trims and lowercases', () => {
    expect(normalizeHandle('  @Creator_A ')).toBe('creator_a');
    expect(normalizeHandle('https://www.tiktok.com/@Some.One?lang=th')).toBe('some.one');
  });
});
