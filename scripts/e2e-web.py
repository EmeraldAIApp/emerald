#!/usr/bin/env python3
r"""Web E2E against the mock (npm run dev:mock): the chat state machine in the real DOM, on both pages.

--url is the site origin. The classic landing (/classic/) walks idle -> red (real chip) -> quota -> bad_input ->
llm-error -> server, an XSS attempt, reduced-motion, the mobile menu and the nav fit at six desktop/tablet widths.
The home page (/ = Emerald.exe) gets a smoke pass: idle, a red chip, the Classic view link, its og card and no
horizontal scroll on a phone. Prints PASS/FAIL per check and exits with code 1 if anything fails.

With --real (plan 1 API behind the Vite proxy) it only runs the two real chips on /classic/: it spends 2 quota checks.

usage: python scripts/e2e-web.py [--url http://localhost:5173] [--real]
"""
from __future__ import annotations

import argparse
import sys

from playwright.sync_api import Page, sync_playwright

FAILS: list[str] = []

# What the web shows when the LLM stream fails after the verdict (web/src/chat/render.ts EXPLAIN_FAILED). It is 69
# characters long, so a bare length check would pass on it: an explanation only counts when this text is absent.
EXPLAIN_FAILED = "The written explanation failed"


# Nav fit probe (runs in the page): text items that wrap onto 2+ lines, how far the row passes the nav's content box,
# and the logo mark's width against its clamp(26px, 2.2vw, 38px) (it collapses first when the row overflows).
NAV_FIT_JS = """
() => {
  const q = (s) => document.querySelector(s)
  const shown = (el) => getComputedStyle(el).display !== 'none'
  const nav = q('.nav'), cs = getComputedStyle(nav), nr = nav.getBoundingClientRect()
  const kids = [...nav.children].filter(shown)
  const right = Math.max(...kids.map((e) => e.getBoundingClientRect().right))
  const multi = []
  for (const el of nav.querySelectorAll('.nav__links a, .nav__chip, .nav__open, .nav__brand span')) {
    if (!shown(el)) continue
    const r = document.createRange()
    r.selectNodeContents(el)
    if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) multi.push(el.textContent.trim())
  }
  return {
    multi,
    over: right - (nr.right - parseFloat(cs.paddingRight)),
    page: document.documentElement.scrollWidth,
    mark: q('.nav__brand .mark').getBoundingClientRect().width,
    wantMark: Math.min(38, Math.max(26, 0.022 * innerWidth)),
  }
}
"""


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail and not ok else ""))
    if not ok:
        FAILS.append(name)


def ask(page: Page, text: str) -> None:
    page.fill("#chat-input", text)
    page.press("#chat-input", "Enter")


def screen(page: Page) -> str:
    return page.inner_text("[data-screen]")


def explained(page: Page) -> bool:
    """True when the streamed explanation is real text and not the fallback line."""
    text = page.inner_text("[data-explain]")
    return len(text) > 40 and EXPLAIN_FAILED not in text


def exe(browser, home: str) -> None:
    """Emerald.exe at /: the same checker inside the retro desktop."""
    page = browser.new_page(viewport={"width": 1440, "height": 814})
    page.goto(home, wait_until="networkidle")
    check("exe: / serves Emerald.exe", page.evaluate("document.body.classList.contains('exe')"))
    check("exe: indexable", page.locator('meta[name="robots"]').count() == 0)
    check("exe: own og card", (page.get_attribute('meta[property="og:image"]', "content") or "").endswith("/og-exe.jpg"))
    check("exe: idle", page.get_attribute(".exe-chat", "data-verdict") == "idle" and "Ready." in screen(page))
    check("exe: 2 real chips", page.locator("[data-chips] .dv__chip").count() == 2)
    page.wait_for_function("document.querySelector('[data-quota]').textContent.trim().length > 0")
    check("exe: quota line", "today" in page.inner_text("[data-quota]"))
    check("exe: Classic view -> /classic/", page.locator('.icons a[href="/classic/"]').count() == 1)
    page.click('[data-sample="permit2-drainer"]')
    page.wait_for_selector('.exe-chat[data-verdict="red"]', timeout=30_000)
    page.wait_for_selector('[data-explain][aria-busy="false"]', timeout=60_000)
    check("exe red: headline", "Don’t sign." in screen(page))
    check("exe red: full explanation", explained(page))
    page.click('.icons a[href="/classic/"]')
    page.wait_for_load_state("networkidle")
    check("exe: Classic view opens the classic landing", page.locator(".hero__panel").count() == 1)
    page.close()

    mob = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    mob.goto(home, wait_until="networkidle")
    overflow = mob.evaluate("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth")
    check("exe mobile: no horizontal scroll", overflow <= 0, f"{overflow}px too wide")
    mob.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5173")
    ap.add_argument("--real", action="store_true")
    args = ap.parse_args()
    base = args.url.rstrip("/")
    url = base + "/classic/"
    # ?noboot skips the first-visit boot screen of Emerald.exe (a fresh browser profile always counts as a first visit).
    home = base + "/?noboot"
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="chrome")
        except Exception:
            browser = p.chromium.launch()

        page = browser.new_page(viewport={"width": 1440, "height": 814})
        page.goto(url, wait_until="networkidle")
        check("classic: noindex", page.get_attribute('meta[name="robots"]', "content") == "noindex")
        check("idle: panel without verdict", page.get_attribute(".hero__panel", "data-verdict") == "idle")
        check("idle: Ready.", "Ready." in screen(page))
        check("idle: 2 real chips", page.locator("[data-chips] .dv__chip").count() == 2)
        page.wait_for_function("document.querySelector('[data-quota]').textContent.trim().length > 0")
        check("idle: quota line", "today" in page.inner_text("[data-quota]"))

        if args.real:
            for sample in ("permit2-drainer", "poisoned-address"):
                page.click(f'[data-sample="{sample}"]')
                page.wait_for_selector('.hero__panel[data-verdict="red"]', timeout=60_000)
                page.wait_for_selector('[data-explain][aria-busy="false"]', timeout=90_000)
                check(f"real {sample}: red", "Don’t sign." in screen(page))
                check(f"real {sample}: LLM explanation", explained(page))
                check(f"real {sample}: says what it could not check", "Couldn’t check:" in screen(page))
                page.goto(url, wait_until="networkidle")
            browser.close()
            print(f"\n{len(FAILS)} FAIL")
            sys.exit(1 if FAILS else 0)

        page.click('[data-sample="permit2-drainer"]')
        page.wait_for_selector('.hero__panel[data-verdict="red"]', timeout=30_000)
        page.wait_for_selector('[data-explain][aria-busy="false"]', timeout=60_000)
        check("red: headline", "Don’t sign." in screen(page))
        check("red: Couldn't check row", "Couldn’t check:" in screen(page))
        check("red: full explanation", explained(page))
        check("red: bracelet mini-screen", page.get_attribute("#try .mini--chat", "data-verdict") == "red")
        check("red: S3 with 5 checks", page.locator("[data-checks] .dv__check").count() == 5)
        check("red: S3 in red", page.locator("[data-checks] .dv__verdict.is-red").count() == 1)
        check("red: Check button enabled when done", page.is_enabled(".dv__submit"))
        check("red: accessible announcement", "Don’t sign." in page.inner_text("[data-announce]"))

        ask(page, "/quota")
        page.wait_for_selector("text=Daily limit")
        check("quota: light back to idle", page.get_attribute(".hero__panel", "data-verdict") == "idle")
        ask(page, "/bad")
        page.wait_for_selector("text=That doesn’t look like a transaction, signature, address or token.")
        check("bad_input", True)
        ask(page, "/llm-error")
        page.wait_for_selector("text=The written explanation failed, but the verdict above is still valid.", timeout=30_000)
        check("llm-error: the color stays", page.get_attribute(".hero__panel", "data-verdict") == "yellow")
        ask(page, "/down")
        page.wait_for_selector("text=Engine error")
        check("server error", True)

        ask(page, '<img src=x onerror="window.__pwned=1">')
        page.wait_for_selector('.hero__panel[data-verdict="yellow"]')
        page.wait_for_timeout(300)
        check("xss: the input does not run", page.evaluate("window.__pwned === undefined"))
        check("xss: no <img> on the screen", page.locator("[data-screen] img").count() == 0)
        page.close()

        rm = browser.new_page(viewport={"width": 1440, "height": 814}, reduced_motion="reduce")
        rm.goto(url, wait_until="networkidle")
        rm.click('[data-sample="poisoned-address"]')
        rm.wait_for_selector('.hero__panel[data-verdict="red"]', timeout=30_000)
        rm.wait_for_timeout(150)
        # --c-prev is never empty (the CSS starts it at --dv-ink): the check requires the --alert red.
        check("reduced-motion: red light without animation", rm.evaluate(
            "(() => { const s = document.querySelector('#try .stage'); return s.getAnimations().length === 0 && getComputedStyle(s).getPropertyValue('--c-prev').trim().toLowerCase() === '#ff3b2f' })()"))
        rm.close()

        mob = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        mob.goto(url, wait_until="networkidle")
        check("mobile: short placeholder", mob.get_attribute("#chat-input", "placeholder") == "Paste a transaction or address")
        check("mobile: links hidden", not mob.is_visible(".nav__links a >> nth=0"))
        mob.click("[data-nav-toggle]")
        check("mobile: menu opens", mob.is_visible(".nav__links a >> nth=0") and mob.get_attribute("[data-nav-toggle]", "aria-expanded") == "true")
        # Measure against clientWidth, not innerWidth: with mobile emulation innerWidth grows to fit overflowing content,
        # so "scrollWidth - innerWidth" is 0 even when the page is wider than the screen.
        overflow = mob.evaluate("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth")
        check("mobile: no horizontal scroll", overflow <= 0, f"{overflow}px too wide")
        mob.close()

        # Nav: every visible item on one line, nothing past the nav's content box, and the logo mark not squeezed by the flex row.
        for width in (768, 1100, 1280, 1440, 1536, 1920):
            nv = browser.new_page(viewport={"width": width, "height": 900})
            nv.goto(url, wait_until="networkidle")
            nv.evaluate("document.fonts.ready")
            res = nv.evaluate(NAV_FIT_JS)
            check(f"nav {width}: one line per item", not res["multi"], str(res["multi"]))
            check(f"nav {width}: no overflow", res["over"] <= 0.5 and res["page"] <= width, f"{res['over']}px / page {res['page']}px")
            check(f"nav {width}: logo mark intact", res["mark"] >= res["wantMark"] - 0.5, f"{res['mark']}px")
            nv.close()

        exe(browser, home)
        browser.close()
    print(f"\n{len(FAILS)} FAIL")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
