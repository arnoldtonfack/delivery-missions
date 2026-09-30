import {
  businessToday,
  dateOnlyToDate,
  dateToDateOnly,
} from '../business-date.util';

describe('business-date.util', () => {
  it('businessToday uses Africa/Douala (UTC+1), not UTC', () => {
    // 23:30 UTC le 30 → déjà 00:30 le 1er octobre à Douala.
    expect(businessToday(new Date('2026-09-30T23:30:00Z'))).toBe('2026-10-01');
    expect(businessToday(new Date('2026-09-30T22:59:59Z'))).toBe('2026-09-30');
  });

  it('round-trips a YYYY-MM-DD day through a UTC-midnight Date', () => {
    const date = dateOnlyToDate('2026-02-28');

    expect(date.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(dateToDateOnly(date)).toBe('2026-02-28');
  });
});
