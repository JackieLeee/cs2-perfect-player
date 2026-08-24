#!/usr/bin/env python3
"""Generate brand-styled team logo SVGs for CS2 Perfect Player."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "images" / "teams"
DATA = ROOT / "assets" / "data" / "cs2-teams.json"

# Brand colors + short mark text / shape hint
TEAM_MARKS = {
    "navi": ("#ffdd00", "#1a1a1a", "NAVI", "yellow-black esports"),
    "vitality": ("#ff5500", "#1a1a1a", "VIT", "orange bee team"),
    "faze": ("#e10600", "#1a1a1a", "FaZe", "red clan"),
    "g2": ("#000000", "#ffffff", "G2", "black samurai"),
    "mouz": ("#00a651", "#1a1a1a", "MOUZ", "green mouse"),
    "spirit": ("#00bfff", "#1a1a1a", "TS", "cyan dragon"),
    "liquid": ("#0066cc", "#1a1a1a", "TL", "blue horse"),
    "heroic": ("#ff0040", "#1a1a1a", "HER", "red heroic"),
    "astralis": ("#ff0000", "#1a1a1a", "AST", "red star"),
    "fnatic": ("#ff6600", "#1a1a1a", "FNC", "orange fnatic"),
    "complexity": ("#0066ff", "#1a1a1a", "coL", "blue complexity"),
    "vp": ("#ff6600", "#1a1a1a", "VP", "orange bear"),
    "eternal": ("#ff4500", "#1a1a1a", "EF", "fire eternal"),
    "3dmax": ("#003366", "#ffffff", "3DM", "navy 3dmax"),
    "furia": ("#00ff00", "#1a1a1a", "FURIA", "green panther"),
    "big": ("#ffff00", "#1a1a1a", "BIG", "yellow big"),
}


def logo_svg(tid: str, primary: str, secondary: str, mark: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g-{tid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{primary}"/>
      <stop offset="100%" stop-color="{secondary}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="32" fill="url(#g-{tid})"/>
  <circle cx="128" cy="128" r="88" fill="none" stroke="{secondary if primary != '#000000' else primary}" stroke-width="6" opacity="0.35"/>
  <text x="128" y="142" text-anchor="middle" fill="{secondary if primary not in ('#000000', '#003366') else '#ffffff'}"
        font-family="Segoe UI, Arial Black, sans-serif" font-size="{48 if len(mark) <= 4 else 36}" font-weight="900" letter-spacing="1">{mark}</text>
</svg>"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    teams = json.loads(DATA.read_text(encoding="utf-8"))
    for team in teams["teams"]:
        tid = team["id"]
        primary, secondary, mark, _ = TEAM_MARKS.get(
            tid, (team.get("color", "#334155"), "#111827", (team.get("nameCn") or tid)[:4].upper(), "")
        )
        path = OUT / f"{tid}.svg"
        path.write_text(logo_svg(tid, primary, secondary, mark), encoding="utf-8")
        team["logo"] = f"assets/images/teams/{tid}.svg"
    DATA.write_text(json.dumps(teams, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Generated {len(teams['teams'])} team logos")


if __name__ == "__main__":
    main()
