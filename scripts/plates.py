#!/usr/bin/env python3
r"""Plates -> web/public/plates: AVIF per width, fallback JPG, LQIP (lqip.json) and og.jpg.

Source per plate: refs/plates/<name>-neutral.png if it exists (spill neutralized by light-mask.py --bake-neutral),
otherwise refs/plates/<name>.png. Pillow 12.2 encodes AVIF natively (verified 2026-09-30).
Widths: plates 16:9 (2688x1520) -> 1280/1920/2688; plates 9:16 (1520x2688) -> 780/1170/1520.
Budget: the largest AVIF of each plate <= 180 KB (otherwise, lower --q).

usage: python scripts/plates.py [--only hero-desktop,hero-mobile] [--q 52]
"""
from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TSV = ROOT / "refs/plates/prompts/plates.tsv"
SRC = ROOT / "refs/plates"
OUT = ROOT / "web/public/plates"
PORTRAIT = {"hero-mobile", "lineup-mobile"}
WIDTHS = {"landscape": (1280, 1920, 2688), "portrait": (780, 1170, 1520)}
BUDGET = 180_000


def names() -> list[str]:
    return [l.split("\t")[0] for l in TSV.read_text(encoding="utf-8").strip().splitlines()[1:]]


def source(name: str) -> Path | None:
    for cand in (SRC / f"{name}-neutral.png", SRC / f"{name}.png"):
        if cand.exists():
            return cand
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="")
    ap.add_argument("--q", type=int, default=55)
    a = ap.parse_args()
    only = {n for n in a.only.split(",") if n}
    OUT.mkdir(parents=True, exist_ok=True)
    lqip_file = OUT / "lqip.json"
    lqip: dict[str, str] = json.loads(lqip_file.read_text(encoding="utf-8")) if lqip_file.exists() else {}
    over = []
    for name in names():
        if only and name not in only:
            continue
        src = source(name)
        if not src:
            print(f"{name}: missing refs/plates/{name}.png, skipping")
            continue
        im = Image.open(src).convert("RGB")
        widths = WIDTHS["portrait" if name in PORTRAIT else "landscape"]
        for w in widths:
            h = round(w * im.height / im.width)
            dst = OUT / f"{name}-{w}.avif"
            im.resize((w, h), Image.LANCZOS).save(dst, quality=a.q, speed=4)
            print(f"{dst.name:28s} {dst.stat().st_size / 1024:7.1f} KB")
            if w == widths[-1] and dst.stat().st_size > BUDGET:
                over.append(dst.name)
        w0 = widths[0]
        jpg = OUT / f"{name}-{w0}.jpg"
        im.resize((w0, round(w0 * im.height / im.width)), Image.LANCZOS).save(jpg, quality=82, optimize=True, progressive=True)
        buf = io.BytesIO()
        im.resize((24, round(24 * im.height / im.width)), Image.LANCZOS).save(buf, "JPEG", quality=50)
        lqip[name] = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        if name == "hero-desktop":
            og = im.resize((1200, round(1200 * im.height / im.width)), Image.LANCZOS)
            top = (og.height - 630) // 2
            og.crop((0, top, 1200, top + 630)).save(OUT / "og.jpg", quality=85, optimize=True, progressive=True)
            print("og.jpg", (OUT / "og.jpg").stat().st_size // 1024, "KB")
    lqip_file.write_text(json.dumps(lqip, indent=1), encoding="utf-8")
    print(f"lqip.json: {len(lqip)} plates")
    if over:
        raise SystemExit(f"over budget ({BUDGET // 1000} KB): {', '.join(over)}. Repeat with --q 48")


if __name__ == "__main__":
    main()
