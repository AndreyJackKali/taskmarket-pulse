#!/usr/bin/env python3
"""
Generates 1200x630 brand-kit-compliant Open Graph & per-view share cards
strictly using the Taskmarket brand palette, official OFL fonts, unmodified
taskmarket-lockup.png, and live numbers from docs/data/snapshot.json.
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
SNAP_PATH = os.path.join(DOCS, "data", "snapshot.json")
FONTS_DIR = os.path.join(DOCS, "fonts")
LOCKUP_PATH = os.path.join(DOCS, "assets", "taskmarket-lockup.png")

# Official Taskmarket brand palette (strictly only these colors)
GROUND = (18, 16, 14)       # #12100E
MAROON = (58, 20, 32)       # #3A1420
PANEL = (34, 30, 26)        # #221E1A
LINE = (69, 62, 55)         # #453E37
CREAM = (239, 233, 226)     # #EFE9E2
PAPER = (255, 246, 232)     # #FFF6E8
MUTED = (176, 167, 157)     # #B0A79D
MAGENTA = (231, 64, 121)    # #E74079
SALMON = (217, 160, 151)    # #D9A097

W, H = 1200, 630


def make_canvas():
    img = Image.new("RGB", (W, H), GROUND)
    px = img.load()
    for y in range(H):
        for x in range(W):
            d = ((x / 680.0) ** 2 + (y / 460.0) ** 2) ** 0.5
            t = max(0.0, 1.0 - d) ** 2.0
            if t > 0.002:
                px[x, y] = (
                    int(GROUND[0] + (MAROON[0] - GROUND[0]) * t),
                    int(GROUND[1] + (MAROON[1] - GROUND[1]) * t),
                    int(GROUND[2] + (MAROON[2] - GROUND[2]) * t),
                )
    return img


def load_fonts():
    return {
        "serif": ImageFont.truetype(os.path.join(FONTS_DIR, "InstrumentSerif-Regular.ttf"), 66),
        "serif_it": ImageFont.truetype(os.path.join(FONTS_DIR, "InstrumentSerif-Italic.ttf"), 66),
        "body_lg": ImageFont.truetype(os.path.join(FONTS_DIR, "InterTight-Variable.ttf"), 24),
        "body_sm": ImageFont.truetype(os.path.join(FONTS_DIR, "InterTight-Variable.ttf"), 18),
        "mono_lg": ImageFont.truetype(os.path.join(FONTS_DIR, "DepartureMono-Regular.otf"), 32),
        "mono_md": ImageFont.truetype(os.path.join(FONTS_DIR, "DepartureMono-Regular.otf"), 20),
        "mono_sm": ImageFont.truetype(os.path.join(FONTS_DIR, "DepartureMono-Regular.otf"), 15),
    }


def draw_header_footer(img, draw, fonts, as_of):
    lockup = Image.open(LOCKUP_PATH).convert("RGBA")
    target_w = 340
    target_h = int(lockup.height * (target_w / lockup.width))
    lockup = lockup.resize((target_w, target_h), Image.Resampling.LANCZOS)
    img.paste(lockup, (64, 48), lockup)

    addr = "taskmarket.dev"
    bbox = draw.textbbox((0, 0), addr, font=fonts["mono_md"])
    draw.text((W - 64 - (bbox[2] - bbox[0]), 66), addr, font=fonts["mono_md"], fill=CREAM)

    draw.line([(64, H - 68), (W - 64, H - 68)], fill=LINE, width=1)
    draw.text((64, H - 48), f"DATA AS OF {as_of[:16].replace('T', ' ')} UTC  ·  TEMPO (4217) & BASE (8453)", font=fonts["mono_sm"], fill=MUTED)
    note = "COMMUNITY BOUNTY VISUALIZER"
    nb = draw.textbbox((0, 0), note, font=fonts["mono_sm"])
    draw.text((W - 64 - (nb[2] - nb[0]), H - 48), note, font=fonts["mono_sm"], fill=SALMON)


def draw_headline(draw, fonts, prefix, accent_word, y=155):
    draw.text((64, y), prefix, font=fonts["serif"], fill=CREAM)
    pb = draw.textbbox((64, y), prefix, font=fonts["serif"])
    draw.text((pb[2] + 10, y), accent_word, font=fonts["serif_it"], fill=MAGENTA)


def draw_stat_card(draw, fonts, x, y, w, h, label, value, sub):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=14, fill=PANEL, outline=LINE, width=1)
    draw.text((x + 22, y + 20), label, font=fonts["body_sm"], fill=MUTED)
    draw.text((x + 22, y + 54), value, font=fonts["mono_lg"], fill=PAPER)
    draw.text((x + 22, y + 108), sub, font=fonts["body_sm"], fill=SALMON)


def render_card(out_name, prefix, accent_word, subtitle, cards, as_of, fonts):
    img = make_canvas()
    draw = ImageDraw.Draw(img)
    draw_header_footer(img, draw, fonts, as_of)
    draw_headline(draw, fonts, prefix, accent_word, y=148)
    draw.text((64, 232), subtitle, font=fonts["body_lg"], fill=MUTED)

    gap = 20
    cw = (W - 128 - gap * (len(cards) - 1)) // len(cards)
    for i, (label, val, sub) in enumerate(cards):
        cx = 64 + i * (cw + gap)
        draw_stat_card(draw, fonts, cx, 305, cw, 165, label, val, sub)

    out_path = os.path.join(DOCS, out_name)
    img.save(out_path, "PNG", optimize=True)
    print(f"[og] wrote {out_path}")


def fmt_delta(val):
    if val is None:
        return "n/a WoW"
    sign = "+" if val >= 0 else ""
    return f"{sign}{val:.1f}% WoW"


def main():
    with open(SNAP_PATH) as f:
        snap = json.load(f)
    as_of = snap["dataAsOf"]
    t = snap["chains"]["tempo"]
    b = snap["chains"]["base"]
    g = t.get("growth7d", {})
    fonts = load_fonts()

    # 1. Overview OG card (default og:image)
    render_card(
        "og-overview.png",
        "Live market pulse for",
        "agents.",
        "Server-cached Tempo (OUSD) & Base (USDC) activity, capital flow, and poster concentration.",
        [
            ("Active Agents (7d)", f"{t['headline'].get('activeAgents7d', 0):,}", fmt_delta(g.get("agentsDeltaPct"))),
            ("Open Tasks Now", f"{t['headline'].get('openTasks', 0):,}", "live escrowed pools"),
            ("Paid Workers", f"{t['headline'].get('paidWorkers', 0) + b['headline'].get('paidWorkers', 0):,}", f"Tempo {t['headline'].get('paidWorkers',0)} · Base {b['headline'].get('paidWorkers',0)}"),
            ("Distinct Posters", f"{t['analytics']['distinctPostersTotal']:,}", f"Top 5 post {t['analytics']['top5SharePct']}% (Tempo)"),
        ],
        as_of,
        fonts,
    )

    # 2. Capital Flow & Swarm card
    top_swarm = t["analytics"]["swarmConvergence"][0] if t["analytics"]["swarmConvergence"] else {"submissions": 0, "ref": "—"}
    render_card(
        "og-flow.png",
        "Posters to winners &",
        "swarm.",
        "How OUSD and USDC move from poster cohorts through task modes into settled winner payouts.",
        [
            ("Tempo Completion", f"{t['analytics']['completionRatePct']}%", f"{t['analytics']['indexedTasksCount']:,} tasks indexed"),
            ("Task Mortality", f"{t['analytics']['mortalityRatePct']}%", "expired or cancelled"),
            ("Distinct Winners", f"{t['analytics'].get('distinctWinnersTotal', 0):,}", f"Top 5 win {t['analytics'].get('top5WinnerSharePct', 0)}%"),
            ("Hottest Open Task", f"{top_swarm['submissions']} subs", f"{top_swarm['ref']} active swarm"),
        ],
        as_of,
        fonts,
    )

    # 3. Posters & Winners card
    latest_wk = t["analytics"]["distinctPostersByWeek"][-1] if t["analytics"]["distinctPostersByWeek"] else {"distinctPosters": 0, "isoWeek": "—"}
    render_card(
        "og-posters.png",
        "Posters, winners &",
        "supply.",
        "Computed directly from /api/tasks across Tempo and Base — tracking requester and winner concentration.",
        [
            ("Latest Week (Tempo)", f"{latest_wk['distinctPosters']}", f"ISO week {latest_wk['isoWeek']}"),
            ("Top 3 Poster Share", f"{t['analytics']['top3SharePct']}%", "of indexed Tempo tasks"),
            ("Repeat Winners", f"{t['analytics'].get('repeatWinners', 0)}", f"of {t['analytics'].get('distinctWinnersTotal', 0)} winners (Tempo)"),
            ("Base Distinct Posters", f"{b['analytics']['distinctPostersTotal']}", f"Top 5 post {b['analytics']['top5SharePct']}%"),
        ],
        as_of,
        fonts,
    )

    # 4. Heatmap & Mortality card
    dt = t["analytics"].get("decisionTiming", {})
    render_card(
        "og-heatmap.png",
        "Activity rhythm &",
        "mortality.",
        "30-day hour-of-week heatmaps, decision lifespans, and reward-tier mortality across both chains.",
        [
            ("Median Window", f"{dt.get('completedWindowMedianH', 0)}h", "completed Tempo tasks"),
            ("Expired Window", f"{dt.get('deadWindowMedianH', 0)}h", "tasks that died"),
            ("Tempo Mortality", f"{t['analytics']['mortalityRatePct']}%", f"vs Base {b['analytics']['mortalityRatePct']}%"),
            ("Active Wallets", f"{t['headline'].get('activeWallets', 0) + b['headline'].get('activeWallets', 0):,}", "Tempo + Base combined"),
        ],
        as_of,
        fonts,
    )

    # 5. Time Series & 7d Growth Momentum card
    render_card(
        "og-timeseries.png",
        "7-day velocity &",
        "growth.",
        "Comparing the last 7 complete UTC days against the prior 7-day window from platform time series.",
        [
            ("7d Tasks Posted", f"{g.get('tasksCur', 0):,}", fmt_delta(g.get("tasksDeltaPct"))),
            ("7d Rewards Paid", f"${g.get('paidCurUsd', 0):,.0f}", fmt_delta(g.get("paidDeltaPct"))),
            ("7d Escrowed Vol", f"${g.get('escrowedCurUsd', 0):,.0f}", fmt_delta(g.get("escrowedDeltaPct"))),
            ("Avg Daily Agents", f"{g.get('avgAgentsCur', 0):.0f}", fmt_delta(g.get("agentsDeltaPct"))),
        ],
        as_of,
        fonts,
    )


if __name__ == "__main__":
    main()
