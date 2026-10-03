#!/usr/bin/env python3
r"""Measures the bracelet screen on each plate and writes web/src/light/plates.generated.ts.

Per plate (rows of refs/plates/prompts/plates.tsv):
  1. seed = screen_center_pct from the tsv (or --seed name=x,y in plate px);
  2. flood-fill of the navy glass from the seed: pixels at RGB distance < --tol from the seed's 9x9 mean color,
     connected, inside a --win px window;
  3. quad = extreme points of the region (min x+y, max x-y, max x+y, min x-y) = top-left, top-right, bottom-right,
     bottom-left. --quad name=x0,y0,x1,y1,x2,y2,x3,y3 overrides it by hand;
  4. draws refs/qa/plates/<name>-quad.png (crop with the quad in red) to check it by eye.
Hand-measured quads live in scripts/plates-extra.json ("screen": [[x,y]x4], tl, tr, br, bl) so that re-measuring every
plate never overwrites them with the flood-fill; the --quad flag still wins over the file.
Lineup extras: scripts/plates-extra.json {"lineup-desktop": {"dots": [[x,y]x6], "marks": [[x,y]x7]}, "lineup-mobile": {"dots": [[x,y]x6]}}.
Light: if web/public/plates/<name>-light.json exists (scripts/light-mask.py), copies its --sx/--sy/--wx/--wy.

usage: python scripts/measure-plates.py [--src refs/plates] [--only hero-desktop,how-desktop] [--seed hero-desktop=560,1070]
                                        [--quad book-desktop=..8 numbers..] [--tol 38] [--win 900]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TSV = ROOT / "refs/plates/prompts/plates.tsv"
EXTRA = ROOT / "scripts/plates-extra.json"
OUT_TS = ROOT / "web/src/light/plates.generated.ts"
QA = ROOT / "refs/qa/plates"
PUBLIC = ROOT / "web/public/plates"


def rows() -> list[dict[str, str]]:
    lines = TSV.read_text(encoding="utf-8").strip().splitlines()
    head = lines[0].split("\t")
    return [dict(zip(head, l.split("\t"))) for l in lines[1:]]


def parse_kv(items: list[str] | None, n: int) -> dict[str, list[float]]:
    out: dict[str, list[float]] = {}
    for it in items or []:
        name, nums = it.split("=", 1)
        vals = [float(v) for v in nums.split(",")]
        if len(vals) != n:
            raise SystemExit(f"{name}: expected {n} numbers")
        out[name] = vals
    return out


def flood(rgb: np.ndarray, seed: tuple[int, int], tol: float, win: int) -> np.ndarray:
    h, w, _ = rgb.shape
    sx, sy = seed
    x0, x1 = max(0, sx - win // 2), min(w, sx + win // 2)
    y0, y1 = max(0, sy - win // 2), min(h, sy + win // 2)
    crop = rgb[y0:y1, x0:x1]
    ref = rgb[max(0, sy - 4):sy + 5, max(0, sx - 4):sx + 5].reshape(-1, 3).mean(axis=0)
    mask = np.linalg.norm(crop - ref, axis=2) < tol
    grow = np.zeros_like(mask)
    grow[sy - y0, sx - x0] = True
    for _ in range(2000):
        d = grow.copy()
        d[1:] |= grow[:-1]
        d[:-1] |= grow[1:]
        d[:, 1:] |= grow[:, :-1]
        d[:, :-1] |= grow[:, 1:]
        d &= mask
        if (d == grow).all():
            break
        grow = d
    full = np.zeros((h, w), dtype=bool)
    full[y0:y1, x0:x1] = grow
    return full


def quad_of(region: np.ndarray) -> list[list[int]]:
    ys, xs = np.nonzero(region)
    if len(xs) < 50:
        raise ValueError("region too small: check the seed (--seed) or raise --tol")
    s, d = xs + ys, xs - ys
    pick = lambda i: [int(xs[i]), int(ys[i])]  # noqa: E731
    return [pick(np.argmin(s)), pick(np.argmax(d)), pick(np.argmax(s)), pick(np.argmin(d))]


def preview(img: Image.Image, quad: list[list[int]], name: str, pts: list[list[float]]) -> Path:
    QA.mkdir(parents=True, exist_ok=True)
    xs = [p[0] for p in quad] + [p[0] for p in pts]
    ys = [p[1] for p in quad] + [p[1] for p in pts]
    box = (max(0, min(xs) - 160), max(0, min(ys) - 160), min(img.width, max(xs) + 160), min(img.height, max(ys) + 160))
    crop = img.crop(box).convert("RGB")
    dr = ImageDraw.Draw(crop)
    dr.polygon([(x - box[0], y - box[1]) for x, y in quad], outline=(255, 59, 47), width=3)
    for x, y in pts:
        dr.ellipse((x - box[0] - 6, y - box[1] - 6, x - box[0] + 6, y - box[1] + 6), outline=(60, 230, 140), width=3)
    dst = QA / f"{name}-quad.png"
    crop.save(dst)
    return dst


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=str(ROOT / "refs/plates"))
    ap.add_argument("--only", default="")
    ap.add_argument("--seed", action="append")
    ap.add_argument("--quad", action="append")
    ap.add_argument("--tol", type=float, default=38.0)
    ap.add_argument("--win", type=int, default=900)
    a = ap.parse_args()
    seeds, quads = parse_kv(a.seed, 2), parse_kv(a.quad, 8)
    extra = json.loads(EXTRA.read_text(encoding="utf-8")) if EXTRA.exists() else {}
    only = {n for n in a.only.split(",") if n}

    plates: dict[str, dict] = {}
    if OUT_TS.exists() and only:  # keep the plates that were not requested
        prev = OUT_TS.read_text(encoding="utf-8").split("= ", 1)[1].rsplit("\n", 1)[0]
        plates = json.loads(prev)
    for row in rows():
        name = row["name"]
        if only and name not in only:
            continue
        src = Path(a.src) / f"{name}.png"
        if not src.exists():
            print(f"{name}: missing {src}, skipping")
            continue
        img = Image.open(src).convert("RGB")
        rgb = np.asarray(img, dtype=np.float32)
        ex = extra.get(name, {})
        if name in quads:
            v = [int(round(x)) for x in quads[name]]
            quad = [v[0:2], v[2:4], v[4:6], v[6:8]]
        elif "screen" in ex:
            if len(ex["screen"]) != 4:
                raise SystemExit(f"{name}.screen: expected 4 points, got {len(ex['screen'])}")
            quad = [[int(round(x)), int(round(y))] for x, y in ex["screen"]]
        else:
            if name in seeds:
                sx, sy = (int(v) for v in seeds[name])
            else:
                px, py = (float(v) for v in row["screen_center_pct"].split(","))
                sx, sy = int(px / 100 * img.width), int(py / 100 * img.height)
            try:
                quad = quad_of(flood(rgb, (sx, sy), a.tol, a.win))
            except ValueError as e:  # one failing plate does not break measuring the rest
                print(f"{name}: {e} (seed {sx},{sy}). Run again with --only {name} --seed {name}=X,Y")
                continue
        geo: dict = {"w": img.width, "h": img.height, "screen": quad}
        for key, n in (("dots", 6), ("marks", 7)):
            if key in ex:
                if len(ex[key]) != n:
                    raise SystemExit(f"{name}.{key}: expected {n} points, got {len(ex[key])}")
                geo[key] = ex[key]
        light = PUBLIC / f"{name}-light.json"
        if light.exists():
            css = json.loads(light.read_text(encoding="utf-8"))["css"]
            geo["light"] = {"sx": css["--sx"], "sy": css["--sy"], "wx": css["--wx"], "wy": css["--wy"]}
        plates[name] = geo
        print(f"{name}: screen {quad} -> {preview(img, quad, name, ex.get('dots', []) + ex.get('marks', []))}")
        if row.get("mask_mode") == "neutral" and not light.exists():
            xs, ys = [p[0] for p in quad], [p[1] for p in quad]
            x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
            w, h = x1 - x0, y1 - y0
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            print(
                f"  light: python scripts/light-mask.py {src.as_posix()} --mode neutral --screen {cx:.0f},{cy:.0f} "
                f"--screen-box {x0},{y0},{x1},{y1} --roi {cx + 0.13 * w:.0f},{cy + 0.75 * h:.0f},{3.8 * w:.0f},{3 * h:.0f} "
                f"--name {name} --out-dir web/public/plates --preview"
            )

    OUT_TS.write_text(
        "// GENERATED by scripts/measure-plates.py. Do not edit by hand: run the script again.\n"
        "import type { PlateGeo } from './plates.js'\n\n"
        f"export const PLATES: Record<string, PlateGeo> = {json.dumps(plates, indent=2)}\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT_TS} ({len(plates)} plates)")


if __name__ == "__main__":
    main()
