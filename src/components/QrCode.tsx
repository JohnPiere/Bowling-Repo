/**
 * A QR-shaped placeholder.
 *
 * Deliberately not a real encoder: it draws the three finder squares and a
 * deterministic field so the screen reads correctly, and it is obviously a
 * placeholder rather than a code that scans to the wrong thing. Swap in a real
 * encoder when joining by QR is wired up.
 */

const GRID = 21;

export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const cell = size / GRID;

  // Seeded from the value so the same code always draws the same field.
  let seed = 0;
  for (const char of value) seed = (seed * 31 + char.charCodeAt(0)) % 100000;

  const modules: { x: number; y: number }[] = [];

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const finder = finderModule(x, y);
      if (finder !== null) {
        if (finder) modules.push({ x, y });
        continue;
      }
      if ((x * 7 + y * 13 + x * y * 3 + seed) % 11 > 5) modules.push({ x, y });
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GRID} ${GRID}`}
      role="img"
      aria-label={`QR placeholder for invite code ${value}`}
      style={{ background: '#e9e9ed', borderRadius: 8, padding: cell / 2, boxSizing: 'content-box' }}
    >
      {modules.map((m) => (
        <rect key={`${m.x}-${m.y}`} x={m.x} y={m.y} width={1} height={1} fill="#161826" />
      ))}
    </svg>
  );
}

/** true = dark module, false = light, null = not part of a finder. */
function finderModule(x: number, y: number): boolean | null {
  for (const [fx, fy] of [
    [3, 3],
    [17, 3],
    [3, 17],
  ]) {
    const dx = Math.abs(x - fx);
    const dy = Math.abs(y - fy);
    if (dx > 3 || dy > 3) continue;
    const ring = Math.max(dx, dy);
    // Solid centre, a light ring, then the dark border.
    return ring !== 1 && ring !== 3;
  }
  return null;
}
