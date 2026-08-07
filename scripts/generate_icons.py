from pathlib import Path
from PIL import Image, ImageDraw


OUTPUT = Path(__file__).resolve().parents[1] / "public" / "icons"


def draw_icon(size: int) -> None:
    scale = 4
    canvas_size = size * scale
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    margin = 8 * scale / 128
    radius = 34 * scale / 128
    box = (margin * size, margin * size, (scale - margin) * size, (scale - margin) * size)
    draw.rounded_rectangle(box, radius=radius * size, fill=(220, 76, 76, 255))

    factor = canvas_size / 128
    ring = tuple(int(value * factor) for value in (30, 31, 98, 99))
    draw.ellipse(ring, outline=(255, 255, 255, 85), width=max(1, int(8 * factor)))
    draw.arc(ring, start=-90, end=225, fill=(255, 255, 255, 255), width=max(1, int(8 * factor)))
    draw.line(
        [(64 * factor, 50 * factor), (64 * factor, 71 * factor), (78 * factor, 80 * factor)],
        fill=(255, 255, 255, 255),
        width=max(1, int(7 * factor)),
        joint="curve",
    )
    draw.ellipse(
        tuple(int(value * factor) for value in (60, 67, 68, 75)),
        fill=(255, 255, 255, 255),
    )

    image.resize((size, size), Image.Resampling.LANCZOS).save(OUTPUT / f"icon{size}.png")


for icon_size in (16, 32, 48, 128):
    draw_icon(icon_size)
