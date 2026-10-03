#!/usr/bin/env python3
r"""Motion pass E2E (Task 20): the verdict light wave and the reveals of the classic landing (/classic/), against the mock.

  0. At rest (freshly loaded, no verdict) no wave and no screen refresh runs: the wow answers
     the input, it never runs on its own.
  1. With motion: when the red verdict arrives an --r animation appears on the hero stage; when it ends,
     the "prev" light stays red (#FF3B2F) and no animations are left hanging.
  2. With reduced-motion: no animation; the light changes anyway.
  3. Screenshot-safe: no section content is left at opacity 0 after the animations finish.

--url is the site origin; the checks run on <url>/classic/.

usage: python scripts/e2e-motion.py [--url http://localhost:5173]
"""
from __future__ import annotations

import argparse
import sys

from playwright.sync_api import sync_playwright

STAGE = "document.querySelector('#try .stage')"
HAS_WAVE = f"{STAGE}.getAnimations().some(a => a.effect.getKeyframes().some(k => '--r' in k))"
PREV = f"getComputedStyle({STAGE}).getPropertyValue('--c-prev').trim().toLowerCase()"
# Installed before the page loads: records every wave (--r) and every refresh (.is-refresh) from the first frame.
RECORD = """
window.__motion = [];
const animate = Element.prototype.animate;
Element.prototype.animate = function (k, o) {
  try { if (JSON.stringify(k).includes('--r')) window.__motion.push('wave'); } catch (e) {}
  return animate.call(this, k, o);
};
new MutationObserver((ms) => { for (const m of ms) if (m.target.classList && m.target.classList.contains('is-refresh')) window.__motion.push('refresh'); })
  .observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5173")
    url = ap.parse_args().url.rstrip("/") + "/classic/"
    fails: list[str] = []

    def check(name: str, ok: bool) -> None:
        print(("PASS " if ok else "FAIL ") + name)
        if not ok:
            fails.append(name)

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="chrome")
        except Exception:
            browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 814})
        page.add_init_script(RECORD)
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(1200)
        check("rest: no wave and no refresh without a verdict", page.evaluate("window.__motion.length") == 0)
        page.click('[data-sample="permit2-drainer"]')
        try:
            page.wait_for_function(HAS_WAVE, timeout=15_000, polling=20)
            check("wave: --r animation on the hero", True)
        except Exception:
            check("wave: --r animation on the hero", False)
        page.wait_for_function(f"!({HAS_WAVE})", timeout=5_000)
        check("wave: the red light stays as prev", page.evaluate(PREV) == "#ff3b2f")

        page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        page.wait_for_timeout(900)
        page.evaluate("document.getAnimations().forEach(a => { try { a.finish() } catch (e) {} })")
        hidden = page.evaluate(
            "[...document.querySelectorAll('main .sec__in > *')].filter(e => getComputedStyle(e).opacity === '0').length"
        )
        check("reveals: nothing left at opacity 0", hidden == 0)
        page.close()

        rm = browser.new_page(viewport={"width": 1440, "height": 814}, reduced_motion="reduce")
        rm.goto(url, wait_until="networkidle")
        rm.click('[data-sample="permit2-drainer"]')
        rm.wait_for_selector('.hero__panel[data-verdict="red"]', timeout=30_000)
        rm.wait_for_timeout(200)
        check("reduced-motion: no wave", not rm.evaluate(HAS_WAVE))
        check("reduced-motion: red light anyway", rm.evaluate(PREV) == "#ff3b2f")
        rm.close()
        browser.close()
    print(f"\n{len(fails)} FAIL")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
