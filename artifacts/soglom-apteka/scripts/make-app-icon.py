"""Launcher icon: logo mark with generous safe padding inside white circle."""
from __future__ import annotations

import os
from PIL import Image, ImageDraw

SRC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "images"))
SIZE = 1024
# Keep clear margin so syringe tips never touch the circular mask (Android adaptive + launcher).
LOGO_FRAC = 0.56
DISK_RADIUS = int(SIZE * 0.48)


def main() -> None:
    candidates = ["vaksina-mark-clean.png", "brand-symbol.png", "icon-old-black-full.png"]
    base_path = next(
        (os.path.join(SRC_DIR, c) for c in candidates if os.path.exists(os.path.join(SRC_DIR, c))),
        None,
    )
    if not base_path:
        raise SystemExit("No source logo found")

    print("base", base_path, "LOGO_FRAC", LOGO_FRAC)
    src = Image.open(base_path).convert("RGBA")
    sw, sh = src.size
    scale = min((SIZE * LOGO_FRAC) / sw, (SIZE * LOGO_FRAC) / sh)
    nw, nh = max(1, int(sw * scale)), max(1, int(sh * scale))
    fitted = src.resize((nw, nh), Image.Resampling.LANCZOS)

    white_disk = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    cx = cy = SIZE // 2
    ImageDraw.Draw(white_disk).ellipse(
        (cx - DISK_RADIUS, cy - DISK_RADIUS, cx + DISK_RADIUS, cy + DISK_RADIUS),
        fill=(255, 255, 255, 255),
    )

    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ox, oy = (SIZE - nw) // 2, (SIZE - nh) // 2
    layer.paste(fitted, (ox, oy), fitted)

    canvas = Image.alpha_composite(white_disk, layer)

    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).ellipse(
        (cx - DISK_RADIUS, cy - DISK_RADIUS, cx + DISK_RADIUS, cy + DISK_RADIUS),
        fill=255,
    )
    out.paste(canvas, (0, 0), mask)

    print("center", out.getpixel((SIZE // 2, SIZE // 2)), "size", nw, nh)

    for name in ("adaptive-icon.png", "icon.png"):
        path = os.path.join(SRC_DIR, name)
        out.save(path, "PNG")
        print("wrote", path)


if __name__ == "__main__":
    main()
