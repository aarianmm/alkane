#!/usr/bin/env python3
"""
Generate The Alkane's brand raster images with Pillow.

There's no SVG rasteriser on this machine, so the same zig-zag mark that's
hand-written in public/logo.svg / public/favicon.svg is redrawn here directly
with Pillow primitives. Everything is drawn at 4x supersample and downscaled
with LANCZOS so edges/text stay smooth.

Outputs (all written to public/):
  favicon.ico          16x16, 32x32, 48x48 (transparent)
  apple-touch-icon.png 180x180 (opaque white background)
  icon-192.png         192x192 (opaque white background)
  icon-512.png         512x512 (opaque white background)
  og.png               1200x630 social share card

Re-run with:
  python3 tools/generate-images.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# Brand palette
ACCENT_BLUE = (37, 99, 235)      # #2563eb
DARK_BLUE = (29, 78, 216)        # #1d4ed8
INK = (26, 29, 33)               # #1a1d21
SOFT_INK = (75, 85, 99)          # #4b5563
FAINT = (107, 114, 128)          # #6b7280
PAPER = (255, 255, 255)          # #ffffff
SOFT_PAPER = (247, 248, 250)     # #f7f8fa
LINE = (229, 231, 235)           # #e5e7eb
TINT = (234, 241, 255)           # #eaf1ff

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


def draw_zigzag_mark(draw, cx, cy, scale, favicon_style=False):
    """Draw the zig-zag alkane mark centred at (cx, cy).

    `scale` maps the 64x64 SVG viewBox unit to pixels. `favicon_style` uses
    the thicker/simpler favicon.svg geometry instead of logo.svg's.
    """
    if favicon_style:
        pts = [(8, 44), (24, 20), (40, 44), (56, 20)]
        stroke_w = 8.5
        dot_r = 4.6
    else:
        pts = [(8, 42), (20, 20), (32, 42), (44, 20), (56, 42)]
        stroke_w = 6.0
        dot_r = 3.4

    # Map viewBox (0..64) coords to pixel space, centred at (cx, cy)
    def to_px(p):
        x, y = p
        return (cx + (x - 32) * scale, cy + (y - 32) * scale)

    px_pts = [to_px(p) for p in pts]
    width = max(1, round(stroke_w * scale))

    for (x1, y1), (x2, y2) in zip(px_pts, px_pts[1:]):
        draw.line([(x1, y1), (x2, y2)], fill=ACCENT_BLUE, width=width)
        # round joins/caps
        r = width / 2
        draw.ellipse([x1 - r, y1 - r, x1 + r, y1 + r], fill=ACCENT_BLUE)
        draw.ellipse([x2 - r, y2 - r, x2 + r, y2 + r], fill=ACCENT_BLUE)

    r = dot_r * scale
    for (x, y) in px_pts:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=DARK_BLUE)


def render_icon(size, bg=None, padding_frac=0.20, favicon_style=False):
    """Render the mark at `size` px, optionally over an opaque background."""
    big = size * SS
    mode = "RGB" if bg is not None else "RGBA"
    fill = bg if bg is not None else (0, 0, 0, 0)
    img = Image.new(mode, (big, big), fill)
    draw = ImageDraw.Draw(img)

    # scale so the 64x64 mark (with padding) fills the canvas
    usable = big * (1 - 2 * padding_frac)
    scale = usable / 64
    draw_zigzag_mark(draw, big / 2, big / 2, scale, favicon_style=favicon_style)

    return img.resize((size, size), Image.LANCZOS)


def make_favicon_ico():
    sizes = [16, 32, 48]
    imgs = [render_icon(s, bg=None, padding_frac=0.10, favicon_style=True) for s in sizes]
    # Largest first as the base image; Pillow's ICO writer resizes it for
    # every requested size, so render at the biggest size for best quality.
    biggest = imgs[-1]
    out_path = PUBLIC / "favicon.ico"
    biggest.save(out_path, format="ICO", sizes=[(s, s) for s in sizes])
    return out_path


def make_opaque_icon(size, name):
    img = render_icon(size, bg=PAPER, padding_frac=0.24, favicon_style=False)
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
    draw_zigzag_mark(draw, mark_cx, wordmark_cy, mark_d / 64, favicon_style=False)
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
