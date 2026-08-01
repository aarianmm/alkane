#!/usr/bin/env python3
"""
Generate The Alkane's brand raster images from the benzene-ring mark.

public/logo.svg and public/favicon.svg are the source of truth for the mark
itself. There's no SVG rasteriser on this machine, so headless Chrome renders
an HTML wrapper around those same paths at the target pixel size, and Pillow
composites/downsamples the result (plus draws the og.png card, which is pure
Pillow text/shape work).

Outputs (all written to public/):
  favicon.ico          16x16, 32x32, 48x48 (transparent)
  apple-touch-icon.png 180x180 (opaque white background)
  icon-192.png         192x192 (opaque white background)
  icon-512.png         512x512 (opaque white background)
  og.png               1200x630 social share card

Re-run with:
  python3 tools/generate-images.py
"""

import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

# Brand palette
ACCENT_BLUE = (37, 99, 235)      # #2563eb
INK = (26, 29, 33)               # #1a1d21
SOFT_INK = (75, 85, 99)          # #4b5563
FAINT = (107, 114, 128)          # #6b7280
PAPER = (255, 255, 255)          # #ffffff

SS = 4  # supersample factor for all raster renders

FONT_DIR = Path("/System/Library/Fonts/Supplemental")


def _find_font(candidates):
    for name in candidates:
        path = FONT_DIR / name
        if path.exists():
            return path
    # Last-resort system fallback
    sfns = Path("/System/Library/Fonts/SFNS.ttf")
    if sfns.exists():
        return sfns
    return None


BOLD_FONT_PATH = _find_font(["Arial Bold.ttf", "Helvetica.ttc"])
REGULAR_FONT_PATH = _find_font(["Arial.ttf", "Helvetica.ttc"])


def font(size, bold=False):
    path = BOLD_FONT_PATH if bold else REGULAR_FONT_PATH
    if path is None:
        return ImageFont.load_default()
    return ImageFont.truetype(str(path), size)


# ---------------------------------------------------------------------------
# Benzene mark rendering — rasterised from the same paths as public/favicon.svg
# so every asset stays in sync with the one hand-written source of truth.
# ---------------------------------------------------------------------------

_SVG_SOURCE = (PUBLIC / "favicon.svg").read_text()
_BENZENE_PATHS = "".join(re.findall(r"<path[^>]*/>", _SVG_SOURCE))
if not _BENZENE_PATHS:
    raise RuntimeError("Could not extract benzene mark paths from public/favicon.svg")


def render_benzene_mark(size, bg=None, padding_frac=0.06, color="#2563eb"):
    """Rasterise the benzene ring mark at `size` px square via headless Chrome.

    Returns an RGBA image (transparent) if bg is None, else an RGB image
    flattened onto the given CSS background colour.
    """
    mark_px = round(size * (1 - 2 * padding_frac))
    body_bg = bg if bg is not None else "transparent"
    html = f"""<!doctype html><html><head><style>
html,body{{margin:0;padding:0;background:{body_bg};}}
svg{{display:block;}}
</style></head><body>
<div style="width:{size}px;height:{size}px;display:flex;align-items:center;justify-content:center;">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21.695833 24.341668" width="{mark_px}" height="{mark_px}">
  <g transform="translate(-52.096355,-76.493618)" fill="{color}">
    {_BENZENE_PATHS}
  </g>
</svg>
</div>
</body></html>"""

    with tempfile.TemporaryDirectory() as tmp:
        html_path = Path(tmp) / "mark.html"
        png_path = Path(tmp) / "mark.png"
        html_path.write_text(html)
        subprocess.run(
            [
                str(CHROME),
                "--headless",
                "--disable-gpu",
                f"--screenshot={png_path}",
                f"--window-size={size},{size}",
                "--default-background-color=00000000",
                "--hide-scrollbars",
                f"file://{html_path}",
            ],
            check=True,
            capture_output=True,
        )
        img = Image.open(png_path)
        return img.convert("RGBA") if bg is None else img.convert("RGB")


def make_favicon_ico():
    sizes = [16, 32, 48]
    biggest = render_benzene_mark(48, bg=None, padding_frac=0.08)
    out_path = PUBLIC / "favicon.ico"
    biggest.save(out_path, format="ICO", sizes=[(s, s) for s in sizes])
    return out_path


def make_opaque_icon(size, name):
    img = render_benzene_mark(size, bg="#ffffff", padding_frac=0.24)
    out_path = PUBLIC / name
    img.save(out_path, format="PNG")
    return out_path


def text_size(draw, text, f):
    l, t, r, b = draw.textbbox((0, 0), text, font=f)
    return r - l, b - t, l, t


def draw_text_centered_v(draw, x, cy, text, f, fill, anchor_left=True):
    """Draw text so its vertical centre sits at cy; x is the left edge (or
    right edge if anchor_left is False, in which case x is the right edge)."""
    w, h, l, t = text_size(draw, text, f)
    if anchor_left:
        pos = (x - l, cy - h / 2 - t)
    else:
        pos = (x - w - l, cy - h / 2 - t)
    draw.text(pos, text, font=f, fill=fill)
    return w, h


def fit_font(draw, text, max_width, bold, start_size, min_size=24):
    size = start_size
    while size > min_size:
        f = font(size, bold=bold)
        w, _, _, _ = text_size(draw, text, f)
        if w <= max_width:
            return f
        size -= 2
    return font(min_size, bold=bold)


def draw_text_centered_h(draw, cx, y_top, text, f, fill):
    """Draw text horizontally centred on cx, top edge at y_top. Returns (w, h)."""
    w, h, l, t = text_size(draw, text, f)
    draw.text((cx - w / 2 - l, y_top - t), text, font=f, fill=fill)
    return w, h


SAFE_MARGIN = 60  # nothing important may fall within this many px of any edge


def check_safe_area(img, margin=SAFE_MARGIN, bg=(255, 255, 255), tolerance=6):
    """Scan the outer margin bands of `img` and return a list of (x, y)
    pixel coordinates that are not background colour, i.e. safe-area
    violations. An empty list means the margins are clean."""
    rgb = img.convert("RGB")
    W, H = rgb.size
    px = rgb.load()

    def is_bg(x, y):
        r, g, b = px[x, y]
        return (
            abs(r - bg[0]) <= tolerance
            and abs(g - bg[1]) <= tolerance
            and abs(b - bg[2]) <= tolerance
        )

    violations = []
    xs = list(range(0, margin)) + list(range(W - margin, W))
    ys = list(range(0, margin)) + list(range(H - margin, H))
    for x in xs:
        for y in range(0, H):
            if not is_bg(x, y):
                violations.append((x, y))
                break
    for y in ys:
        for x in range(0, W):
            if not is_bg(x, y):
                violations.append((x, y))
                break
    return violations


def make_og_image():
    W, H = 1200, 630
    s = SS
    img = Image.new("RGB", (W * s, H * s), PAPER)
    draw = ImageDraw.Draw(img)
    cx = 600 * s  # horizontal centre of the whole card
    center_y = 315 * s  # vertical centre of the whole card (== safe-area centre)

    # ---------------------------------------------------------------
    # Compute every block's height first (logical px * s), then stack
    # them centred as one group so the composition is balanced instead
    # of pinned to arbitrary y-coordinates.
    # ---------------------------------------------------------------

    # 1) Wordmark row: small mark + "The Alkane"
    f_wordmark = font(round(34 * s), bold=True)
    wordmark_text = "The Alkane"
    ww, wh, wl, wt = text_size(draw, wordmark_text, f_wordmark)
    mark_gap = 14 * s
    mark_d = 44 * s
    wordmark_row_h = max(mark_d, wh)

    # 2) Molecule structure (2-methylbutane skeletal formula)
    #    Main chain C1-C2-C3-C4 zig-zags at the conventional ~120 degree
    #    bond angle; the methyl branch runs straight up from the C2 apex,
    #    which also lands the two chain bonds + the branch bond at ~120
    #    degrees apart all the way round (a proper three-way branch, not
    #    a straight extension of the incoming chain bond).
    dx, dy = 95 * s, 58 * s
    bond_len = (dx ** 2 + dy ** 2) ** 0.5  # branch bond matches chain bond length
    struct_w = 3 * dx
    struct_h = bond_len + dy  # from branch tip (Cb) down to C1/C3
    stroke_w = round(10 * s)
    dot_r = round(7.5 * s)

    # 3) Divider arrow (points down, chain -> name)
    arrow_h = 44 * s
    aw = round(4.5 * s)
    arrow_head = 13 * s

    # 4) Big compound name, sized to fit within the safe area width
    max_name_width = (1200 - 2 * SAFE_MARGIN - 40) * s  # a little extra breathing room
    f_name = fit_font(draw, "2-methylbutane", max_name_width, True, start_size=round(100 * s))
    nw, nh, nl, nt = text_size(draw, "2-methylbutane", f_name)

    # 5) Strapline, also fitted defensively in case of font metric surprises
    max_strap_width = (1200 - 2 * SAFE_MARGIN - 40) * s
    f_strap = fit_font(
        draw, "Draw a molecule. Get its IUPAC name.", max_strap_width, False, start_size=round(28 * s)
    )
    sw, sh, sl, st = text_size(draw, "Draw a molecule. Get its IUPAC name.", f_strap)

    # ---- Stack all blocks, centred as a group on center_y ----
    gap_a = 30 * s   # wordmark -> structure
    gap_b = 30 * s   # structure -> arrow
    gap_c = 22 * s   # arrow -> name
    gap_d = 20 * s   # name -> strapline

    total_h = (
        wordmark_row_h + gap_a + struct_h + gap_b + arrow_h + gap_c + nh + gap_d + sh
    )
    y = center_y - total_h / 2

    wordmark_cy = y + wordmark_row_h / 2
    y += wordmark_row_h + gap_a

    struct_top = y
    apex_y = struct_top + bond_len  # y of C2 / C4 (the "up" vertices)
    y += struct_h + gap_b

    arrow_y1 = y
    arrow_y2 = y + arrow_h
    y += arrow_h + gap_c

    name_cy = y + nh / 2
    y += nh + gap_d

    strap_cy = y + sh / 2
    y += sh

    # ---- 1) Draw wordmark row ----
    group_w = mark_d + mark_gap + ww
    mark_cx = cx - group_w / 2 + mark_d / 2
    text_x = mark_cx + mark_d / 2 + mark_gap
    mark_img = render_benzene_mark(round(mark_d), bg=None, padding_frac=0.04)
    mark_box = (round(mark_cx - mark_d / 2), round(wordmark_cy - mark_d / 2))
    img.paste(mark_img, mark_box, mark_img)
    draw_text_centered_v(draw, text_x, wordmark_cy, wordmark_text, f_wordmark, INK)

    # ---- 2) Draw molecule structure, centred on cx ----
    x0 = cx - 1.5 * dx  # C1 x-position
    C1 = (x0, apex_y + dy)
    C2 = (x0 + dx, apex_y)
    C3 = (x0 + 2 * dx, apex_y + dy)
    C4 = (x0 + 3 * dx, apex_y)
    Cb = (C2[0], apex_y - bond_len)  # branch runs straight up from C2

    bonds = [(C1, C2), (C2, C3), (C3, C4), (C2, Cb)]
    for (a, b) in bonds:
        draw.line([a, b], fill=INK, width=stroke_w)
        for (px, py) in (a, b):
            r = stroke_w / 2
            draw.ellipse([px - r, py - r, px + r, py + r], fill=INK)

    for v in (C1, C2, C3, C4, Cb):
        px, py = v
        draw.ellipse([px - dot_r, py - dot_r, px + dot_r, py + dot_r], fill=ACCENT_BLUE)

    # ---- 3) Divider arrow, centred on cx ----
    draw.line([(cx, arrow_y1), (cx, arrow_y2)], fill=FAINT, width=aw)
    draw.line([(cx, arrow_y2), (cx - arrow_head, arrow_y2 - arrow_head)], fill=FAINT, width=aw)
    draw.line([(cx, arrow_y2), (cx + arrow_head, arrow_y2 - arrow_head)], fill=FAINT, width=aw)

    # ---- 4) Big compound name, centred on cx ----
    draw_text_centered_v(draw, cx - nw / 2, name_cy, "2-methylbutane", f_name, ACCENT_BLUE)

    # ---- 5) Strapline, centred on cx ----
    draw_text_centered_h(draw, cx, strap_cy - sh / 2, "Draw a molecule. Get its IUPAC name.", f_strap, SOFT_INK)

    img = img.resize((W, H), Image.LANCZOS)

    violations = check_safe_area(img)
    if violations:
        raise RuntimeError(
            f"og.png safe-area check failed: {len(violations)} margin pixel(s) "
            f"are not background, e.g. {violations[:5]}"
        )

    out_path = PUBLIC / "og.png"
    img.save(out_path, format="PNG")
    return out_path


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)

    made = []
    made.append(make_favicon_ico())
    made.append(make_opaque_icon(180, "apple-touch-icon.png"))
    made.append(make_opaque_icon(192, "icon-192.png"))
    made.append(make_opaque_icon(512, "icon-512.png"))
    made.append(make_og_image())

    print("Generated:")
    for p in made:
        print(" -", p)


if __name__ == "__main__":
    main()
