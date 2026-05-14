#!/usr/bin/env python3
"""Extract transparent icon PNGs from a chroma-key icon sheet."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Iterable

from PIL import Image


KEY_COLORS = {
    "green": (0, 255, 0),
    "magenta": (255, 0, 255),
}
NO_KEY = (-1, -1, -1)


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    out_dir = Path(args.out_dir)
    image = Image.open(input_path).convert("RGBA")
    key_color = resolve_key_color(image, args.key)
    out_dir.mkdir(parents=True, exist_ok=True)

    assets = []
    cells = load_cells(args, image)
    for cell_info in cells:
        name = cell_info["name"]
        cell = image.crop(cell_info["box"])
        keyed = (
            cell
            if key_color == NO_KEY
            else remove_chroma_key(
                cell,
                key_color,
                tolerance=args.tolerance,
                softness=args.softness,
                despill=args.despill,
            )
        )
        if should_remove_isolated_light_background(cell_info):
            keyed = remove_edge_neutral_background(
                keyed,
                color_tolerance=args.edge_background_tolerance,
                tolerance=args.neutral_tolerance,
                max_chroma=args.neutral_chroma,
                min_luma=args.neutral_luma,
            )
            keyed = remove_isolated_light_background(
                keyed,
                max_chroma=args.neutral_chroma,
                min_luma=args.isolated_light_luma,
            )
            keyed = remove_icon_light_halo(
                keyed,
                max_chroma=args.icon_halo_chroma,
                min_luma=args.icon_halo_luma,
            )
        keyed = remove_key_spill(
            keyed,
            key_color,
            threshold=args.spill_threshold,
        )
        trimmed = trim_transparent(keyed, padding_ratio=args.padding)
        output_path = out_dir / f"{name}.png"
        trimmed.save(output_path)

        assets.append(
            {
                "name": name,
                "file": output_path.name,
                "cell": cell_info.get("cell"),
                "cellBox": cell_info["box"],
                "size": {"width": trimmed.width, "height": trimmed.height},
                "transparent": True,
            }
        )

    manifest = {
        "source": str(input_path),
        "grid": args.grid,
        "keyColor": rgb_to_hex(key_color),
        "assets": assets,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Extracted {len(assets)} icons to {out_dir}")
    print(f"Key color: {rgb_to_hex(key_color)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Turn a green/magenta-screen icon sheet into transparent PNG assets."
    )
    parser.add_argument("--input", required=True, help="Input PNG/JPG icon sheet.")
    parser.add_argument("--out-dir", required=True, help="Output directory.")
    parser.add_argument(
        "--names",
        help="Comma-separated asset names, in row-major grid order.",
    )
    parser.add_argument("--grid", help="Grid size, for example 5x2.")
    parser.add_argument(
        "--manifest",
        help="asset-sheet-1.0 JSON manifest. Uses cropSearchBBox or sheetBBox.",
    )
    parser.add_argument(
        "--key",
        default="auto",
        help="auto, none, green, magenta, or a hex color like #00ff00.",
    )
    parser.add_argument(
        "--padding",
        type=float,
        default=0.18,
        help="Transparent padding to add around the trimmed icon, as a ratio of icon size.",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=72,
        help="Color distance treated as chroma background.",
    )
    parser.add_argument(
        "--softness",
        type=float,
        default=34,
        help="Extra distance range used to feather antialiased chroma edges.",
    )
    parser.add_argument(
        "--despill",
        type=float,
        default=0.35,
        help="Reduce key-color spill on semitransparent edges. Use 0 to disable.",
    )
    parser.add_argument(
        "--spill-threshold",
        type=float,
        default=30,
        help="Extra green/magenta edge spill strength to remove after keying.",
    )
    parser.add_argument(
        "--edge-background-tolerance",
        type=float,
        default=48,
        help="Distance from sampled cell-edge background color to remove.",
    )
    parser.add_argument(
        "--neutral-tolerance",
        type=float,
        default=54,
        help="Edge-connected near-white/gray background color distance to remove.",
    )
    parser.add_argument(
        "--neutral-chroma",
        type=float,
        default=30,
        help="Maximum RGB channel spread for removable neutral backgrounds.",
    )
    parser.add_argument(
        "--neutral-luma",
        type=float,
        default=118,
        help="Minimum luma for removable white/gray backgrounds.",
    )
    parser.add_argument(
        "--isolated-light-luma",
        type=float,
        default=205,
        help="Minimum luma for non-edge-connected white/gray icon tile backgrounds.",
    )
    parser.add_argument(
        "--icon-halo-luma",
        type=float,
        default=168,
        help="Minimum luma for light icon tile halos to remove only on icon assets.",
    )
    parser.add_argument(
        "--icon-halo-chroma",
        type=float,
        default=42,
        help="Maximum channel spread for light icon tile halos.",
    )
    return parser.parse_args()


def load_cells(args: argparse.Namespace, image: Image.Image) -> list[dict]:
    if args.manifest:
        return load_manifest_cells(Path(args.manifest), image.size)

    if not args.names or not args.grid:
        raise SystemExit("Use either --manifest or both --names and --grid.")

    names = parse_names(args.names)
    columns, rows = parse_grid(args.grid)
    expected = columns * rows
    if len(names) != expected:
        raise SystemExit(
            f"--names has {len(names)} names, but --grid {args.grid} has {expected} cells."
        )

    return [
        {
            "box": cell_box(image.size, index % columns, index // columns, columns, rows),
            "cell": [index % columns, index // columns],
            "name": name,
        }
        for index, name in enumerate(names)
    ]


def load_manifest_cells(
    manifest_path: Path, image_size: tuple[int, int]
) -> list[dict]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assets = manifest.get("assets")
    if not isinstance(assets, list) or not assets:
        raise SystemExit("--manifest must include a non-empty assets array.")

    sheet_size = manifest.get("sheetSize") or {}
    source_width = safe_number(sheet_size.get("width"), image_size[0])
    source_height = safe_number(sheet_size.get("height"), image_size[1])
    scale_x = image_size[0] / source_width
    scale_y = image_size[1] / source_height

    cells = []
    for index, asset in enumerate(assets):
        if not isinstance(asset, dict):
            continue
        name = str(asset.get("id") or asset.get("name") or f"asset_{index + 1:03d}")
        bbox = asset.get("cropSearchBBox") or asset.get("sheetBBox")
        if not valid_bbox(bbox):
            continue
        subject_bbox = asset.get("sheetBBox") if valid_bbox(asset.get("sheetBBox")) else bbox
        scaled_box = scale_bbox(bbox, scale_x, scale_y, image_size)
        scaled_subject_box = scale_bbox(subject_bbox, scale_x, scale_y, image_size)
        cells.append(
            {
                "box": scaled_box,
                "cell": asset.get("cell"),
                "name": name,
                "prompt": str(asset.get("prompt") or ""),
                "remove_isolated_light": should_treat_as_icon_tile(
                    name,
                    str(asset.get("prompt") or ""),
                    scaled_subject_box,
                ),
            }
        )

    if not cells:
        raise SystemExit("--manifest did not include usable cropSearchBBox or sheetBBox values.")
    return cells


def should_remove_isolated_light_background(cell_info: dict) -> bool:
    return bool(cell_info.get("remove_isolated_light"))


def should_treat_as_icon_tile(
    name: str,
    prompt: str,
    box: tuple[int, int, int, int],
) -> bool:
    text = f"{name} {prompt}".lower()
    product_keywords = [
        "avatar",
        "banner",
        "background",
        "coffee",
        "cosmetic",
        "image",
        "logo",
        "photo",
        "product",
        "shoe",
        "skincare",
        "商品",
        "产品",
        "照片",
        "图片",
        "横幅",
        "海报",
        "背景",
    ]
    icon_keywords = [
        "cart",
        "category",
        "fullscreen",
        "glyph",
        "grid",
        "home",
        "icon",
        "message",
        "nav",
        "outline",
        "profile",
        "scan",
        "search",
        "tab",
        "tabbar",
        "user",
        "个人",
        "分类",
        "扫码",
        "搜索",
        "消息",
        "图标",
        "购物车",
        "导航",
        "首页",
    ]
    if any(keyword in text for keyword in product_keywords):
        return False
    if any(keyword in text for keyword in icon_keywords):
        return True

    left, top, right, bottom = box
    return max(right - left, bottom - top) <= 96


def safe_number(value: object, fallback: int) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return float(fallback)
    return parsed if parsed > 0 else float(fallback)


def valid_bbox(value: object) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 4
        and all(isinstance(item, (int, float)) for item in value)
    )


def scale_bbox(
    bbox: list[float],
    scale_x: float,
    scale_y: float,
    image_size: tuple[int, int],
) -> tuple[int, int, int, int]:
    image_width, image_height = image_size
    left = clamp_int(math.floor(bbox[0] * scale_x), 0, image_width - 1)
    top = clamp_int(math.floor(bbox[1] * scale_y), 0, image_height - 1)
    right = clamp_int(math.ceil((bbox[0] + bbox[2]) * scale_x), left + 1, image_width)
    bottom = clamp_int(
        math.ceil((bbox[1] + bbox[3]) * scale_y), top + 1, image_height
    )
    return left, top, right, bottom


def clamp_int(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def parse_names(value: str) -> list[str]:
    names = [part.strip() for part in value.split(",") if part.strip()]
    if not names:
        raise SystemExit("--names must include at least one name.")
    return names


def parse_grid(value: str) -> tuple[int, int]:
    pieces = value.lower().split("x")
    if len(pieces) != 2:
        raise SystemExit("--grid must look like 5x2.")
    try:
        columns, rows = int(pieces[0]), int(pieces[1])
    except ValueError as error:
        raise SystemExit("--grid must contain positive integers.") from error
    if columns <= 0 or rows <= 0:
        raise SystemExit("--grid must contain positive integers.")
    return columns, rows


def resolve_key_color(image: Image.Image, key: str) -> tuple[int, int, int]:
    normalized = key.strip().lower()
    if normalized == "none":
        return NO_KEY
    if normalized == "auto":
        return auto_key_color(image)
    if normalized in KEY_COLORS:
        return KEY_COLORS[normalized]
    if normalized.startswith("#") and len(normalized) == 7:
        try:
            return (
                int(normalized[1:3], 16),
                int(normalized[3:5], 16),
                int(normalized[5:7], 16),
            )
        except ValueError as error:
            raise SystemExit(f"Invalid --key hex color: {key}") from error
    raise SystemExit("--key must be auto, none, green, magenta, or #rrggbb.")


def auto_key_color(image: Image.Image) -> tuple[int, int, int]:
    samples = edge_samples(image)
    averages = {
        name: sum(color_distance(sample, color) for sample in samples) / len(samples)
        for name, color in KEY_COLORS.items()
    }
    return KEY_COLORS[min(averages, key=averages.get)]


def edge_samples(image: Image.Image) -> list[tuple[int, int, int]]:
    width, height = image.size
    rgba = image.load()
    step = max(1, min(width, height) // 80)
    samples: list[tuple[int, int, int]] = []

    for x in range(0, width, step):
        samples.append(rgba[x, 0][:3])
        samples.append(rgba[x, height - 1][:3])
    for y in range(0, height, step):
        samples.append(rgba[0, y][:3])
        samples.append(rgba[width - 1, y][:3])
    return samples or [(0, 255, 0)]


def crop_grid_cell(
    image: Image.Image, column: int, row: int, columns: int, rows: int
) -> Image.Image:
    box = cell_box(image.size, column, row, columns, rows)
    return image.crop(box)


def cell_box(
    image_size: tuple[int, int], column: int, row: int, columns: int, rows: int
) -> tuple[int, int, int, int]:
    width, height = image_size
    left = math.floor(width * column / columns)
    top = math.floor(height * row / rows)
    right = math.floor(width * (column + 1) / columns)
    bottom = math.floor(height * (row + 1) / rows)
    return left, top, right, bottom


def remove_chroma_key(
    image: Image.Image,
    key_color: tuple[int, int, int],
    *,
    tolerance: float,
    softness: float,
    despill: float,
) -> Image.Image:
    output = image.copy()
    pixels = output.load()
    width, height = output.size
    soft_end = tolerance + max(0, softness)

    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue

            distance = color_distance((red, green, blue), key_color)
            if distance <= tolerance:
                pixels[x, y] = (red, green, blue, 0)
                continue

            if distance < soft_end:
                fade = (distance - tolerance) / max(1, softness)
                alpha = round(alpha * fade)
                red, green, blue = despill_pixel((red, green, blue), key_color, despill)
                pixels[x, y] = (red, green, blue, alpha)

    return output


def remove_edge_neutral_background(
    image: Image.Image,
    *,
    color_tolerance: float,
    tolerance: float,
    max_chroma: float,
    min_luma: float,
) -> Image.Image:
    output = image.copy()
    pixels = output.load()
    width, height = output.size
    sampled_background = estimate_visible_edge_background(output)
    visited = bytearray(width * height)
    removable = bytearray(width * height)
    queue: list[int] = []

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if visited[index]:
            return
        visited[index] = 1
        red, green, blue, alpha = pixels[x, y]
        if (
            alpha <= 8
            or is_sampled_edge_background_pixel(
                red,
                green,
                blue,
                alpha,
                sampled_background,
                tolerance=color_tolerance,
            )
            or is_neutral_background_pixel(
            red,
            green,
            blue,
            alpha,
            tolerance=tolerance,
            max_chroma=max_chroma,
            min_luma=min_luma,
            )
        ):
            removable[index] = 1
            queue.append(index)

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(1, height - 1):
        enqueue(0, y)
        enqueue(width - 1, y)

    cursor = 0
    while cursor < len(queue):
        index = queue[cursor]
        cursor += 1
        x = index % width
        y = index // width
        if x > 0:
            enqueue(x - 1, y)
        if x < width - 1:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y < height - 1:
            enqueue(x, y + 1)

    for y in range(height):
        for x in range(width):
            if removable[y * width + x]:
                red, green, blue, _alpha = pixels[x, y]
                pixels[x, y] = (red, green, blue, 0)

    return output


def estimate_visible_edge_background(
    image: Image.Image,
) -> tuple[int, int, int] | None:
    width, height = image.size
    pixels = image.load()
    samples: list[tuple[int, int, int]] = []

    def add(x: int, y: int) -> None:
        red, green, blue, alpha = pixels[x, y]
        if alpha > 8:
            samples.append((red, green, blue))

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(1, height - 1):
        add(0, y)
        add(width - 1, y)

    if len(samples) < 4:
        return None

    return (
        median([sample[0] for sample in samples]),
        median([sample[1] for sample in samples]),
        median([sample[2] for sample in samples]),
    )


def is_sampled_edge_background_pixel(
    red: int,
    green: int,
    blue: int,
    alpha: int,
    sampled_background: tuple[int, int, int] | None,
    *,
    tolerance: float,
) -> bool:
    if alpha <= 8:
        return True
    if sampled_background is None:
        return False
    return color_distance((red, green, blue), sampled_background) <= tolerance


def remove_isolated_light_background(
    image: Image.Image,
    *,
    max_chroma: float,
    min_luma: float,
) -> Image.Image:
    output = image.copy()
    pixels = output.load()
    width, height = output.size

    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha <= 8:
                continue

            max_channel = max(red, green, blue)
            min_channel = min(red, green, blue)
            luma = red * 0.299 + green * 0.587 + blue * 0.114
            if luma >= min_luma and max_channel - min_channel <= max_chroma:
                pixels[x, y] = (red, green, blue, 0)

    return output


def remove_icon_light_halo(
    image: Image.Image,
    *,
    max_chroma: float,
    min_luma: float,
) -> Image.Image:
    output = image.copy()
    pixels = output.load()
    width, height = output.size

    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha <= 8:
                continue
            max_channel = max(red, green, blue)
            min_channel = min(red, green, blue)
            luma = red * 0.299 + green * 0.587 + blue * 0.114
            if luma < min_luma or max_channel - min_channel > max_chroma:
                continue
            if is_near_darker_foreground(pixels, x, y, width, height):
                pixels[x, y] = (red, green, blue, 0)

    return output


def is_near_darker_foreground(
    pixels,
    x: int,
    y: int,
    width: int,
    height: int,
) -> bool:
    radius = 2
    for next_y in range(max(0, y - radius), min(height, y + radius + 1)):
        for next_x in range(max(0, x - radius), min(width, x + radius + 1)):
            red, green, blue, alpha = pixels[next_x, next_y]
            if alpha <= 8:
                continue
            luma = red * 0.299 + green * 0.587 + blue * 0.114
            if luma < 150 and max(red, green, blue) - min(red, green, blue) <= 80:
                return True
    return False


def is_neutral_background_pixel(
    red: int,
    green: int,
    blue: int,
    alpha: int,
    *,
    tolerance: float,
    max_chroma: float,
    min_luma: float,
) -> bool:
    if alpha <= 8:
        return True
    max_channel = max(red, green, blue)
    min_channel = min(red, green, blue)
    luma = red * 0.299 + green * 0.587 + blue * 0.114
    if luma < min_luma or max_channel - min_channel > max_chroma:
        return False

    # Neutral backgrounds from image models are often slightly warm/cool, not exactly gray.
    nearest_neutral = round((red + green + blue) / 3)
    return color_distance((red, green, blue), (nearest_neutral, nearest_neutral, nearest_neutral)) <= tolerance


def remove_key_spill(
    image: Image.Image,
    key_color: tuple[int, int, int],
    *,
    threshold: float,
) -> Image.Image:
    if key_color == NO_KEY:
        return image

    output = image.copy()
    pixels = output.load()
    width, height = output.size
    key_channel = max(range(3), key=lambda index: key_color[index])

    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha <= 0:
                continue

            channels = [red, green, blue]
            other_average = sum(
                channels[index] for index in range(3) if index != key_channel
            ) / 2
            spill = channels[key_channel] - other_average
            if spill <= threshold:
                continue

            if alpha < 245 or has_transparent_neighbor(pixels, x, y, width, height):
                if alpha < 120 and spill > threshold * 1.15:
                    pixels[x, y] = (red, green, blue, 0)
                    continue
                channels[key_channel] = round(other_average + threshold * 0.35)
                pixels[x, y] = (
                    max(0, min(255, channels[0])),
                    max(0, min(255, channels[1])),
                    max(0, min(255, channels[2])),
                    alpha,
                )

    return output


def has_transparent_neighbor(
    pixels,
    x: int,
    y: int,
    width: int,
    height: int,
) -> bool:
    for next_x, next_y in (
        (x - 1, y),
        (x + 1, y),
        (x, y - 1),
        (x, y + 1),
    ):
        if 0 <= next_x < width and 0 <= next_y < height:
            if pixels[next_x, next_y][3] <= 8:
                return True
    return False


def despill_pixel(
    color: tuple[int, int, int], key_color: tuple[int, int, int], amount: float
) -> tuple[int, int, int]:
    if amount <= 0:
        return color

    red, green, blue = color
    key_channel = max(range(3), key=lambda index: key_color[index])
    channels = [red, green, blue]
    other_average = sum(
        channels[index] for index in range(3) if index != key_channel
    ) / 2
    limit = other_average + 18
    if channels[key_channel] > limit:
        channels[key_channel] = round(
            channels[key_channel] * (1 - amount) + limit * amount
        )
    return tuple(max(0, min(255, value)) for value in channels)


def trim_transparent(image: Image.Image, *, padding_ratio: float) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))

    left, top, right, bottom = bbox
    content_width = right - left
    content_height = bottom - top
    padding = max(1, round(max(content_width, content_height) * padding_ratio))

    cropped = image.crop(bbox)
    output = Image.new(
        "RGBA",
        (content_width + padding * 2, content_height + padding * 2),
        (0, 0, 0, 0),
    )
    output.alpha_composite(cropped, (padding, padding))
    return output


def color_distance(
    first: tuple[int, int, int], second: tuple[int, int, int]
) -> float:
    return math.sqrt(
        (first[0] - second[0]) ** 2
        + (first[1] - second[1]) ** 2
        + (first[2] - second[2]) ** 2
    )


def rgb_to_hex(color: Iterable[int]) -> str:
    red, green, blue = color
    if (red, green, blue) == NO_KEY:
        return "none"
    return f"#{red:02x}{green:02x}{blue:02x}"


if __name__ == "__main__":
    main()
