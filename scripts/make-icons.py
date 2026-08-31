#!/usr/bin/env python3
"""
Generate the PWA icon set.

Placeholder brand art: a bowling ball on a dark ground. Replace these with the
real Lane Log assets when the design lands -- the sizes and filenames here are
what the manifest and the iOS meta tags expect.
"""
import math
import struct
import zlib
from pathlib import Path

BG = (13, 17, 23)
BALL = (233, 226, 213)
HOLE = (13, 17, 23)
ACCENT = (232, 93, 47)

SS = 4  # supersample factor, for antialiasing without an image library
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def write_png(path, width, height, pixels):
    """pixels: flat list of (r, g, b) rows -> minimal RGB PNG."""
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("3B", *px) for px in row) for row in pixels
    )

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def blend(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render(size, inset, rounded, ring):
    """Draw one icon at `size`, with the ball occupying `inset` of the canvas."""
    n = size * SS
    cx = cy = n / 2
    ball_r = n * inset / 2
    corner = n * 0.22 if rounded else 0

    # Finger holes, placed as a real ball has them.
    holes = [
        (cx - ball_r * 0.30, cy - ball_r * 0.34, ball_r * 0.150),
        (cx + ball_r * 0.06, cy - ball_r * 0.44, ball_r * 0.150),
        (cx - ball_r * 0.12, cy + ball_r * 0.02, ball_r * 0.185),
    ]

    rows = []
    for y in range(n):
        row = []
        for x in range(n):
            px = BG

            if rounded:
                # Rounded-square mask so the non-maskable icons are not bare squares.
                dx = max(corner - x, x - (n - corner), 0)
                dy = max(corner - y, y - (n - corner), 0)
                if math.hypot(dx, dy) > corner:
                    row.append((0, 0, 0))
                    continue

            d = math.hypot(x - cx, y - cy)
            if d <= ball_r:
                # Vertical gradient reads as a lit sphere without a shader.
                px = blend(BALL, blend(BALL, (0, 0, 0), 0.28), (y - (cy - ball_r)) / (2 * ball_r))
                for hx, hy, hr in holes:
                    if math.hypot(x - hx, y - hy) <= hr:
                        px = HOLE
                        break
            elif ring and ball_r < d <= ball_r * 1.14:
                px = ACCENT

            row.append(px)
        rows.append(row)

    # Box-downsample the supersampled buffer.
    out = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    p = rows[y * SS + sy][x * SS + sx]
                    for i in range(3):
                        acc[i] += p[i]
            row.append(tuple(v // (SS * SS) for v in acc))
        out.append(row)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = [
        # name, size, ball inset, rounded corners, accent ring
        ("icon-192.png", 192, 0.68, True, True),
        ("icon-512.png", 512, 0.68, True, True),
        # Maskable art must survive an aggressive circular crop, so the ball
        # sits well inside the safe zone and the canvas stays a full square.
        ("icon-512-maskable.png", 512, 0.46, False, False),
        ("badge-72.png", 72, 0.80, False, False),
        ("apple-touch-icon.png", 180, 0.68, True, True),
        ("favicon-32.png", 32, 0.74, True, False),
    ]
    for name, size, inset, rounded, ring in jobs:
        write_png(OUT / name, size, size, render(size, inset, rounded, ring))
        print(f"  {name}  {size}x{size}")


if __name__ == "__main__":
    main()
