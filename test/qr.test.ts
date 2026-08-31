import { describe, expect, it } from 'vitest';
import { inviteCodeFrom } from '../src/lib/qr';

describe('inviteCodeFrom', () => {
  it('reads a code out of a join URL', () => {
    expect(inviteCodeFrom('https://lanelog.example/?join=TCRW31')).toBe('TCRW31');
  });

  it('reads a bare code', () => {
    expect(inviteCodeFrom('TCRW31')).toBe('TCRW31');
  });

  it('normalises what it finds', () => {
    expect(inviteCodeFrom('tcrw-31')).toBe('TCRW31');
    expect(inviteCodeFrom('https://x.example/?join=tcrw31')).toBe('TCRW31');
  });

  it('ignores a QR that has nothing to do with the app', () => {
    expect(inviteCodeFrom('https://example.com/some/page')).toBeNull();
    expect(inviteCodeFrom('WIFI:S=cafe;T=WPA;P=hunter2;;')).toBeNull();
  });

  it('rejects something the right shape but the wrong length', () => {
    expect(inviteCodeFrom('ABC')).toBeNull();
    expect(inviteCodeFrom('')).toBeNull();
  });

  it('takes a URL code even when the URL has other parameters', () => {
    expect(inviteCodeFrom('https://x.example/?utm=a&join=RONE47&b=2')).toBe('RONE47');
  });
});

describe('inviteCodeFrom — a URL is only an invite if it says so', () => {
  it('does not mine a code out of a URL that has no join parameter', () => {
    // Stripped of punctuation, "https://example.com/page" begins with six
    // characters that look exactly like a code.
    expect(inviteCodeFrom('https://example.com/page')).toBeNull();
    expect(inviteCodeFrom('https://lanelog.example/')).toBeNull();
  });

  it('rejects a join parameter that is not a whole code', () => {
    expect(inviteCodeFrom('https://x.example/?join=ABC')).toBeNull();
  });
});
