#!/usr/bin/env python3
"""Self-hosted fonts for the landing (brief §4): downloads the TTFs from github.com/google/fonts, trims the axes and
subsets them to WOFF2 in web/public/fonts/. Requires fonttools + brotli (pip install fonttools brotli).

Why not the Google Fonts CSS: its "latin" subset does NOT include the arrow U+2192, and the chapter 16 device-view
uses it ("Gladias →"). Here the subset includes it for IBM Plex Mono. Funnel has no arrow: "Read Snowmoon →" uses an SVG.

usage: python scripts/fonts.py [--out web/public/fonts]
"""
from __future__ import annotations

import argparse
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl"
# (output file, path in google/fonts, wght range to keep, or None if the font is static)
FONTS = [
    ("FunnelDisplay-500-600.woff2", "funneldisplay/FunnelDisplay%5Bwght%5D.ttf", (500, 600)),
    ("FunnelSans-400-500.woff2", "funnelsans/FunnelSans%5Bwght%5D.ttf", (400, 500)),
    ("IBMPlexMono-Medium.woff2", "ibmplexmono/IBMPlexMono-Medium.ttf", None),
    ("IBMPlexMono-Bold.woff2", "ibmplexmono/IBMPlexMono-Bold.ttf", None),
]
# Basic Latin + Latin-1 + typography (’ “ ” … · – —) + arrows ← ↑ → ↓ + € ™
UNICODES = "U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-2019,U+201C-201D,U+2022,U+2026,U+2032-2033,U+2190-2193,U+2212,U+20AC,U+2122"
# no "liga": Pixelify Sans has an fi ligature that reads as "A" ("Looks Ane.")
FEATURES = ["kern", "calt", "ccmp", "locl", "case", "tnum", "zero", "ss03"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="web/public/fonts")
    out = Path(ap.parse_args().out)
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name, src, wght in FONTS:
            ttf = Path(tmp) / Path(src).name.replace("%5B", "[").replace("%5D", "]")
            urllib.request.urlretrieve(f"{RAW}/{src}", ttf)
            font = TTFont(ttf)
            if wght:
                font = instancer.instantiateVariableFont(font, {"wght": wght})
            opts = subset.Options()
            opts.flavor = "woff2"
            opts.layout_features = FEATURES
            opts.drop_tables += ["meta"]
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=subset.parse_unicodes(UNICODES))
            sub.subset(font)
            dst = out / name
            subset.save_font(font, str(dst), opts)
            cmap = TTFont(dst).getBestCmap()
            print(f"{dst}  {dst.stat().st_size / 1024:.1f} KB  U+2192: {'ok' if 0x2192 in cmap else 'missing'}")


if __name__ == "__main__":
    main()
