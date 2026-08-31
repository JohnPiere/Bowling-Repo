/**
 * Platform sniffing, kept in one place.
 *
 * Feature detection is the right default, but installability and push on iOS
 * genuinely cannot be feature-detected — the APIs are absent in a Safari tab
 * and present in the same browser once the app is on the Home Screen — so a
 * narrow amount of UA inspection is unavoidable here.
 */

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac; the touch points give it away.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent);
}

/** True when running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // Safari's non-standard flag, still the only signal on iOS.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}
