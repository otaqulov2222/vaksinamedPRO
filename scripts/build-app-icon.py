"""Build transparent app icons from brand-symbol.png (no solid placeholder circle)."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SYMBOL = ROOT / "artifacts/soglom-apteka/assets/images/brand-symbol.png"


def make_icon(symbol: Image.Image, size: int = 512, pad_ratio: float = 0.08) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    max_side = int(size * (1 - 2 * pad_ratio))
    w, h = symbol.size
    scale = min(max_side / w, max_side / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = symbol.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def main() -> None:
    symbol = Image.open(SYMBOL).convert("RGBA")
    icon = make_icon(symbol, 512, 0.08)

    targets = [
        ROOT / "artifacts/soglom-apteka/assets/images/icon.png",
        ROOT / "desktop/icon.png",
    ]
    for path in targets:
        icon.save(path, "PNG")
        print(f"wrote {path} {icon.size} {icon.mode}")

    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_images = [make_icon(symbol, s, 0.08) for s in ico_sizes]
    ico_path = ROOT / "desktop/icon.ico"
    ico_images[-1].save(ico_path, format="ICO", sizes=[(s, s) for s in ico_sizes])
    print(f"wrote {ico_path}")


if __name__ == "__main__":
    main()
