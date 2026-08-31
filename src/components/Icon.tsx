/**
 * Lucide-style stroked icons, inlined.
 *
 * Inline paths rather than an icon package: the set is small, and a PWA that
 * must work on alley wifi should not spend a request on it.
 */

export type IconName =
  | 'home' | 'play' | 'history' | 'stats' | 'users' | 'settings'
  | 'camera' | 'bell' | 'back' | 'chat' | 'ball' | 'check' | 'share';

const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  play: 'M12 4a8 8 0 100 16 8 8 0 000-16zM9.6 9.5h.01M13.4 8.8h.01M11.2 12.6h.01',
  history: 'M3 12a9 9 0 109-9 9 9 0 00-6.4 2.7L3 8M3 4v4h4M12 7v5l3.5 2',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users:
    'M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 7a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zM22 20v-2a4 4 0 00-3-3.87M16 3.13A4 4 0 0119 7a4 4 0 01-3 3.87',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.2a1.7 1.7 0 00-2.9-1.1l-.1.1a2 2 0 11-2.8-2.9l.1-.1A1.7 1.7 0 003 15H3a2 2 0 110-4h.2a1.7 1.7 0 001.1-2.9l-.1-.1a2 2 0 112.9-2.8l.1.1A1.7 1.7 0 0011 4.6V4a2 2 0 114 0v.2a1.7 1.7 0 002.9 1.1l.1-.1a2 2 0 112.8 2.9l-.1.1A1.7 1.7 0 0021 11h.1a2 2 0 110 4H21',
  camera: 'M3 8.5A2.5 2.5 0 015.5 6h1.8l1.2-2h6l1.2 2h1.8A2.5 2.5 0 0120 8.5v8A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5zM12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  back: 'M15 19l-7-7 7-7',
  chat: 'M21 12a8 8 0 01-8 8H8l-5 3 1.5-4.5A8 8 0 1121 12z',
  // A bowling ball — the prototype's "Gear" tab, i.e. equipment.
  ball: 'M12 4a8 8 0 100 16 8 8 0 000-16zM9.6 9.5h.01M13.4 8.8h.01M11.2 12.6h.01',
  check: 'M20 6L9 17l-5-5',
  share: 'M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13',
};

interface Props {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 19, strokeWidth = 1.7 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
