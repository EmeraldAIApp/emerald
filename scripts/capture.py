#!/usr/bin/env python3
r"""Page QA screenshots (Playwright sync, real Chrome if present; otherwise Playwright's Chromium).

Per size (desktop 1440x814 = the boards' aspect ratio, tablet 768x1024, mobile 390x844 @2x):
  - scrolls the whole page once (loads the lazy plates),
  - per section (#try #lineup #book #how #token #roadmap) brings it to the top of the viewport, finishes the animations
    (document.getAnimations().forEach(a => a.finish())) and saves <out>/<size>-<state>-<section>.png,
  - also saves <out>/<size>-<state>-full.png.
States: idle (freshly loaded) and red (click on the "Permit2 drainer" chip, waits for data-verdict="red" and the end of the stream).

Pages: --url http://localhost:5173/?noboot is Emerald.exe (the home page; ?noboot skips its first-visit boot screen),
--url http://localhost:5173/classic/ is the classic landing. Both share the section ids and the red-verdict wait.

usage: python scripts/capture.py --url http://localhost:5173/?noboot --out refs/qa/gate [--sizes desktop,mobile,tablet] [--states idle,red]
"""
from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

SIZES = {
    "desktop": {"viewport": {"width": 1440, "height": 814}, "device_scale_factor": 1},
    "tablet": {"viewport": {"width": 768, "height": 1024}, "device_scale_factor": 2, "is_mobile": True, "has_touch": True},
    "mobile": {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 2, "is_mobile": True, "has_touch": True},
}
SECTIONS = ["try", "lineup", "book", "how", "token", "roadmap"]


def settle(page: Page) -> None:
    page.evaluate("document.getAnimations().forEach(a => { try { a.finish() } catch (e) {} })")
    page.wait_for_timeout(250)


def load(page: Page, url: str) -> None:
    page.goto(url, wait_until="networkidle")
    page.evaluate("document.fonts.ready")
    height = page.evaluate("document.documentElement.scrollHeight")
    for y in range(0, height, 600):  # the plates are loading=lazy
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(120)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_load_state("networkidle")


def to_red(page: Page) -> None:
    page.click('[data-sample="permit2-drainer"]')
    page.wait_for_selector('.hero__panel[data-verdict="red"], .exe-chat[data-verdict="red"]', timeout=30_000)
    page.wait_for_selector('[data-explain][aria-busy="false"]', timeout=60_000)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="http://localhost:5173")
    ap.add_argument("--out", default="refs/qa/gate")
    ap.add_argument("--sizes", default="desktop,mobile,tablet")
    ap.add_argument("--states", default="idle,red")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="chrome")
        except Exception:
            browser = p.chromium.launch()
        for size in a.sizes.split(","):
            for state in a.states.split(","):
                ctx = browser.new_context(**SIZES[size])
                page = ctx.new_page()
                load(page, a.url)
                if state == "red":
                    to_red(page)
                for sec in SECTIONS:
                    page.evaluate(f"document.getElementById('{sec}').scrollIntoView({{block: 'start', behavior: 'instant'}})")
                    settle(page)
                    page.screenshot(path=str(out / f"{size}-{state}-{sec}.png"))
                page.evaluate("window.scrollTo(0, 0)")
                settle(page)
                page.screenshot(path=str(out / f"{size}-{state}-full.png"), full_page=True)
                print(f"{size}-{state}: ok")
                ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
