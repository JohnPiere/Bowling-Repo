import { useEffect, useState } from 'react';

/**
 * A real, scannable QR code.
 *
 * It encodes a join URL rather than the bare code, so scanning it with the
 * phone's own camera app opens the group directly — which is what people will
 * actually do, rather than opening Lane Log first and finding the scanner.
 *
 * The encoder is loaded on demand: showing a code is a rare thing to do, and
 * the library has no business in the bundle everyone downloads.
 */
export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const [modules, setModules] = useState<boolean[][] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void import('qrcode-generator')
      .then(({ default: qrcode }) => {
        // Type 0 picks the smallest version that fits; 'M' tolerates about
        // 15% damage, which covers a screen photographed at an angle.
        const qr = qrcode(0, 'M');
        qr.addData(value);
        qr.make();

        const count = qr.getModuleCount();
        const grid = Array.from({ length: count }, (_, row) =>
          Array.from({ length: count }, (_, col) => qr.isDark(row, col)),
        );
        if (!cancelled) setModules(grid);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  if (failed) {
    return (
      <p className="muted" style={{ textAlign: 'center' }}>
        The QR code could not be drawn. The code itself still works.
      </p>
    );
  }

  if (!modules) {
    return <div style={{ width: size, height: size }} aria-hidden="true" />;
  }

  const count = modules.length;
  // A quiet zone of four modules is part of the spec; without it many
  // scanners will not see the code at all.
  const quiet = 4;
  const span = count + quiet * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      role="img"
      aria-label={`QR code for ${value}`}
      style={{ borderRadius: 8, display: 'block' }}
      shapeRendering="crispEdges"
    >
      <rect width={span} height={span} fill="#e9e9ed" />
      {modules.map((row, y) =>
        row.map((dark, x) =>
          dark ? (
            <rect key={`${x}-${y}`} x={x + quiet} y={y + quiet} width={1} height={1} fill="#161826" />
          ) : null,
        ),
      )}
    </svg>
  );
}

/** The URL a group's QR encodes. */
export function joinUrl(code: string): string {
  return `${window.location.origin}/?join=${encodeURIComponent(code)}`;
}
