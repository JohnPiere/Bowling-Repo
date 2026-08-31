import { describe, expect, it } from 'vitest';
import { describeSaveFailure, formatBytes, isQuotaError } from '../src/lib/storage';

describe('isQuotaError', () => {
  it('recognises the standard quota error', () => {
    const err = new Error('nope');
    err.name = 'QuotaExceededError';
    expect(isQuotaError(err)).toBe(true);
  });

  it("recognises Firefox's spelling", () => {
    const err = new Error('nope');
    err.name = 'NS_ERROR_DOM_QUOTA_REACHED';
    expect(isQuotaError(err)).toBe(true);
  });

  it('recognises a quota mentioned in the message', () => {
    expect(isQuotaError(new Error('The quota has been exceeded.'))).toBe(true);
  });

  it('does not claim unrelated failures', () => {
    expect(isQuotaError(new Error('network down'))).toBe(false);
    expect(isQuotaError('not an error')).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe('describeSaveFailure', () => {
  it('offers to drop the photo when there is one', () => {
    const err = new Error('x');
    err.name = 'QuotaExceededError';
    expect(describeSaveFailure(err, { hasPhoto: true })).toMatch(/out of storage/);
    expect(describeSaveFailure(err, { hasPhoto: true })).toMatch(/without its photo/);
  });

  it('does not send a hand-scored game looking for a photo it never had', () => {
    const err = new Error('x');
    err.name = 'QuotaExceededError';
    const message = describeSaveFailure(err);
    expect(message).toMatch(/out of storage/);
    expect(message).not.toMatch(/photo/);
  });

  it('passes through other messages', () => {
    expect(describeSaveFailure(new Error('disk on fire'))).toBe(
      'The game could not be saved: disk on fire',
    );
  });

  it('copes with a non-Error', () => {
    expect(describeSaveFailure(42)).toBe('The game could not be saved.');
  });
});

describe('formatBytes', () => {
  it('formats across units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(1536 * 1024 * 1024)).toBe('1.5 GB');
  });

  it('drops the decimal once the number is big enough not to need it', () => {
    expect(formatBytes(15 * 1024 * 1024)).toBe('15 MB');
  });

  it('says nothing useful when it knows nothing', () => {
    expect(formatBytes(null)).toBe('—');
  });
});
