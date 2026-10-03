#!/usr/bin/env python3
r"""The verdict light (brief §7): spill-light mask for the bracelet screen.

From a photographic plate, builds a luminance mask of the area where the screen spills light onto the skin and the
wood. The web uses it as the `mask-image` of the CSS color layers (multiply + screen).

Modes:
  neutral  final plate: the screen spills neutral/cool white light. Mask = V (brightness) x neutrality
           (drops the moonlight, which is blue-violet) x an influence ellipse around the screen.
  sky      plate whose spill came out sky blue (#7fbcff) instead of white: mask = V x cyan-ness (G - R), which
           separates the screen's sky blue from the moon's violet. Use it with --bake-neutral.
  red      prototype over a board already tinted red (hero-desktop-v2): mask = redness (R - max(G,B)).
  diff     two plates (screen on / screen off, same shot): mask = V(lit) - V(unlit), heavily blurred,
           so it tolerates a misalignment of a few px between the two.

Output in --out-dir:
  <name>-mask.png   grayscale mask (L), at --scale of the original resolution (default 0.25). The CSS uses it
                    with `mask-mode: luminance`.
  <name>-mask-a.png the same as alpha over white (RGBA) for `mask-mode: alpha`, the browsers' default.
  <name>-mask-a.webp same in WebP with alpha (the one that is served: a few KB; the mask is low frequency).
  <name>-light.json screen coordinates in % of the plate (for --sx/--sy) and the parameters used.
  With --bake-neutral <path.avif|.png>: the plate with the spill neutralized (V with a slight cool tint), which is
  the one served if the model did not give a white spill. The CSS always tints on top (at rest, sky blue).
  With --preview also: <name>-preview.png with the neutral/sky/amber/red/emerald strip emulating the CSS.

  <name>-light.json also carries --wx/--wy: radii of the wave ellipse so that at --r: 100% it covers the whole --roi.

Example (the prototype of refs/qa/luz-prototipo.png, over the board with painted UI):
  python scripts/light-mask.py refs/direcciones-v2/A-el-reloj/hero-desktop-v2.png --mode red \
      --screen 567,1071 --screen-box 440,995,695,1155 --roi 600,1190,960,480 \
      --exclude 1440,300,2688,1520 --name hero-desktop --out-dir refs/qa/luz --preview

Final plate (empty screen with a neutral white spill; measure --screen/--screen-box/--roi on the plate):
  python scripts/light-mask.py refs/plates/hero-desktop.png --mode neutral --screen X,Y --screen-box x0,y0,x1,y1 \
      --roi cx,cy,rx,ry --name hero-desktop --out-dir web/public/plates --preview
If the spill came out sky blue: --mode sky --blur 26 --open 11 --gamma 0.6 --bake-neutral web/public/plates/<name>.avif
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# Colors from brief §3 (the light of each verdict).
LIGHTS = {
    "neutral": None,
    "sky": "#7fbcff",       # at rest (--dv-ink)
    "amber": "#FFB02E",     # 🟡 (--amber)
    "red": "#FF3B2F",       # 🔴 (--alert)
    "emerald": "#3CE68C",   # 🟢 soft (--emerald), only as light
}
# Intensity of each layer per verdict (the same numbers go to the CSS as --mul / --glow; web/test/light.test.ts checks it).
LAYER = {
    "sky": (1.00, 0.22),
    "amber": (1.00, 0.30),
    "red": (1.00, 0.28),
    "emerald": (0.85, 0.18),  # "soft emerald": less multiply, less glow
}


def hex_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


def pair(s: str, n: int) -> tuple[float, ...]:
    v = tuple(float(x) for x in s.split(","))
    if len(v) != n:
        raise argparse.ArgumentTypeError(f"expected {n} comma-separated numbers: {s}")
    return v


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Float Gaussian blur (FFT with reflected padding): no banding from blurring in 8 bits."""
    if sigma <= 0:
        return a
    p = int(3 * sigma) + 1
    pad = np.pad(a, p, mode="reflect")
    fy = np.fft.fftfreq(pad.shape[0])[:, None]
    fx = np.fft.rfftfreq(pad.shape[1])[None, :]
    k = np.exp(-2 * (np.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
    out = np.fft.irfft2(np.fft.rfft2(pad) * k, s=pad.shape)
    return out[p:-p, p:-p].astype(np.float32)


def morph_open(a: np.ndarray, size: int) -> np.ndarray:
    """Morphological opening (min then max): erases thin lines (the loupe hairlines) and keeps the wide spill."""
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    im = im.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))
    return np.asarray(im, dtype=np.float32) / 255.0


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / max(e1 - e0, 1e-6), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ellipse_falloff(h: int, w: int, cx: float, cy: float, rx: float, ry: float, power: float = 1.6) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    return np.clip(1.0 - d, 0.0, 1.0) ** (1.0 / power)


def rect_hold(h: int, w: int, box: tuple[float, ...], feather: float) -> np.ndarray:
    """1 outside the rectangle, 0 inside, with a soft edge of `feather` px."""
    x0, y0, x1, y1 = box
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = np.maximum(np.maximum(x0 - xx, xx - x1), 0)
    dy = np.maximum(np.maximum(y0 - yy, yy - y1), 0)
    d = np.sqrt(dx ** 2 + dy ** 2)
    inside = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
    out = smoothstep(0, feather, d)
    out[inside] = 0.0
    return out


def build_mask(rgb: np.ndarray, args) -> np.ndarray:
    h, w, _ = rgb.shape
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    v = rgb.max(axis=2)
    if args.mode == "red":
        raw = np.clip(r - np.maximum(g, b), 0, 1)
    elif args.mode == "sky":
        cyan = np.clip((g - r) / np.maximum(v, 1e-3), 0, 1)
        raw = v * smoothstep(0.04, 0.22, cyan)
    elif args.mode == "neutral":
        # moonlight: B dominates R. White/neutral spill: R ≈ G ≈ B.
        blueness = np.clip((b - r) / np.maximum(v, 1e-3), 0, 1)
        raw = v * (1.0 - smoothstep(0.08, 0.35, blueness))
    else:  # diff
        unlit = np.asarray(Image.open(args.unlit).convert("RGB").resize((w, h), Image.LANCZOS), dtype=np.float32) / 255
        pre = max(w / 200, 4)  # tolerates misalignment
        raw = np.clip(blur(v, pre) - blur(unlit.max(axis=2), pre), 0, 1)

    raw = morph_open(raw, args.open)
    lo, hi = np.percentile(raw[raw > 0.01], [args.lo_pct, args.hi_pct]) if (raw > 0.01).any() else (0, 1)
    m = smoothstep(float(lo), float(hi), raw) ** args.gamma

    if args.roi:
        cx, cy, rx, ry = args.roi
        m *= ellipse_falloff(h, w, cx, cy, rx, ry)
    if args.screen_box:
        m *= rect_hold(h, w, args.screen_box, feather=args.feather)
    for box in args.exclude or []:
        m *= rect_hold(h, w, box, feather=args.feather * 3)
    return np.clip(blur(m, args.blur), 0, 1)


# --- mix-blend-mode emulation (W3C Compositing Level 1, in sRGB like the browsers) ---
def lum(c):
    return 0.3 * c[..., 0:1] + 0.59 * c[..., 1:2] + 0.11 * c[..., 2:3]


def clip_color(c):
    l = lum(c)
    n = c.min(axis=-1, keepdims=True)
    x = c.max(axis=-1, keepdims=True)
    c = np.where(n < 0, l + (c - l) * l / np.maximum(l - n, 1e-6), c)
    c = np.where(x > 1, l + (c - l) * (1 - l) / np.maximum(x - l, 1e-6), c)
    return c


def blend(mode: str, cb: np.ndarray, cs: np.ndarray) -> np.ndarray:
    cs = np.broadcast_to(cs, cb.shape)
    if mode == "multiply":
        return cb * cs
    if mode == "screen":
        return cb + cs - cb * cs
    if mode == "color-dodge":
        return np.where(cs >= 1, 1.0, np.minimum(1.0, cb / np.maximum(1 - cs, 1e-6)))
    if mode == "color":
        return clip_color(cs + (lum(cb) - lum(cs)))
    raise ValueError(mode)


def composite(cb, mode, color, alpha):
    a = alpha[..., None]
    return cb * (1 - a) + blend(mode, cb, color) * a


def apply_light(plate: np.ndarray, mask: np.ndarray, name: str, wave: float = 1.0) -> np.ndarray:
    """The same thing the CSS does: a multiply layer (tints the spill) + a screen layer (bloom), both masked."""
    if LIGHTS[name] is None:
        return plate
    c = hex_rgb(LIGHTS[name])
    mul, glow = LAYER[name]
    out = composite(plate, "multiply", c, mask * mul * wave)
    out = composite(out, "screen", c, (mask ** 1.5) * glow * wave)
    return np.clip(out, 0, 1)


def neutralize(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Prototype only: simulates the neutral plate by removing the board's red (V with a slight cool tint)."""
    v = rgb.max(axis=2, keepdims=True)
    cool = np.array([0.93, 0.96, 1.0], dtype=np.float32)
    return rgb * (1 - mask[..., None]) + (v * cool) * mask[..., None]


def wave_radii(args, w: int, h: int) -> dict:
    """Radii of the wave ellipse (--wx/--wy, in % of the plate) so that at --r: 100% it covers the whole --roi."""
    if not args.roi:
        return {}
    sx, sy = args.screen
    cx, cy, rx, ry = args.roi
    wx = max(abs(cx - rx - sx), abs(cx + rx - sx)) / w
    wy = max(abs(cy - ry - sy), abs(cy + ry - sy)) / h
    return {"--wx": f"{100 * wx:.1f}%", "--wy": f"{100 * wy:.1f}%"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plate")
    ap.add_argument("--mode", choices=["neutral", "sky", "red", "diff"], default="neutral")
    ap.add_argument("--unlit", help="plate with the screen off (diff mode)")
    ap.add_argument("--screen", type=lambda s: pair(s, 2), required=True, help="screen center in px: x,y")
    ap.add_argument("--screen-box", type=lambda s: pair(s, 4), help="screen box x0,y0,x1,y1 (excluded)")
    ap.add_argument("--roi", type=lambda s: pair(s, 4), help="influence ellipse cx,cy,rx,ry in px")
    ap.add_argument("--exclude", type=lambda s: pair(s, 4), action="append", help="box to exclude (painted UI)")
    ap.add_argument("--open", type=int, default=7, help="morphological opening (px, odd)")
    ap.add_argument("--blur", type=float, default=14.0, help="final sigma (px at the original resolution)")
    ap.add_argument("--feather", type=float, default=18.0)
    ap.add_argument("--gamma", type=float, default=0.7)
    ap.add_argument("--lo-pct", type=float, default=2.0)
    ap.add_argument("--hi-pct", type=float, default=97.0)
    ap.add_argument("--scale", type=float, default=0.25, help="output scale of the mask")
    ap.add_argument("--name", default="plate")
    ap.add_argument("--out-dir", default=".")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--bake-neutral", help="writes the plate with the spill neutralized (.avif or .png)")
    args = ap.parse_args()

    src = Image.open(args.plate).convert("RGB")
    rgb = np.asarray(src, dtype=np.float32) / 255.0
    h, w, _ = rgb.shape
    mask = build_mask(rgb, args)

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    small = (max(1, round(w * args.scale)), max(1, round(h * args.scale)))
    m8 = Image.fromarray(np.clip(mask * 255 + 0.5, 0, 255).astype(np.uint8))
    m_small = m8.resize(small, Image.LANCZOS)
    m_small.save(out / f"{args.name}-mask.png", optimize=True)
    white = Image.new("L", small, 255)
    rgba = Image.merge("RGBA", (white, white, white, m_small))
    rgba.save(out / f"{args.name}-mask-a.png", optimize=True)
    rgba.save(out / f"{args.name}-mask-a.webp", quality=80, alpha_quality=70, method=6)

    sx, sy = args.screen
    meta = {
        "plate": Path(args.plate).name,
        "size": [w, h],
        "screen_px": [sx, sy],
        "css": {"--sx": f"{100 * sx / w:.2f}%", "--sy": f"{100 * sy / h:.2f}%", **wave_radii(args, w, h)},
        "mask_size": list(small),
        "mask_coverage": round(float(mask.mean()), 4),
        "params": {k: v for k, v in vars(args).items() if k not in ("plate", "out_dir", "preview")},
        "layers": {k: {"color": LIGHTS[k], "mul": LAYER[k][0], "glow": LAYER[k][1]} for k in LAYER},
    }
    (out / f"{args.name}-light.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: meta[k] for k in ("css", "mask_size", "mask_coverage")}))

    colored = args.mode in ("red", "sky")
    if args.bake_neutral:
        baked = Image.fromarray((np.clip(neutralize(rgb, np.sqrt(mask)), 0, 1) * 255 + 0.5).astype(np.uint8))
        dst = Path(args.bake_neutral)
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.suffix.lower() == ".avif":
            baked.save(dst, quality=62, speed=4)
        else:
            baked.save(dst, optimize=True)
        print("neutral plate:", dst, dst.stat().st_size, "bytes")

    if args.preview:
        base = neutralize(rgb, np.sqrt(mask)) if colored else rgb
        tiles = [rgb, np.repeat(mask[..., None], 3, axis=2)] + [apply_light(base, mask, n) for n in LIGHTS]
        tw = 640
        th = round(h * tw / w)
        strip = Image.new("RGB", (tw * len(tiles), th), "#0f0c29")
        for i, t in enumerate(tiles):
            tile = Image.fromarray((np.clip(t, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((tw, th), Image.LANCZOS)
            strip.paste(tile, (i * tw, 0))
        strip.save(out / f"{args.name}-preview.png", optimize=True)


if __name__ == "__main__":
    main()
