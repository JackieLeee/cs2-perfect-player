#!/usr/bin/env python3
"""Download CS team logos and update cs2-teams.json."""
from __future__ import annotations

import json
import ssl
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "images" / "teams"
DATA = ROOT / "assets" / "data" / "cs2-teams.json"

# Wikimedia / public CDN sources (SVG preferred)
LOGO_URLS = {
    "navi": "https://upload.wikimedia.org/wikipedia/en/9/9f/Natus_Vincere_logo.svg",
    "vitality": "https://upload.wikimedia.org/wikipedia/en/8/8a/Team_Vitality_logo.svg",
    "faze": "https://upload.wikimedia.org/wikipedia/en/3/37/FaZe_Clan.svg",
    "g2": "https://upload.wikimedia.org/wikipedia/en/7/77/G2_Esports_logo.svg",
    "mouz": "https://upload.wikimedia.org/wikipedia/en/7/7a/Mousesports_2020_logo.svg",
    "spirit": "https://upload.wikimedia.org/wikipedia/en/4/4a/Team_Spirit_logo.svg",
    "liquid": "https://upload.wikimedia.org/wikipedia/en/f/f1/Team_Liquid_logo_2017.svg",
    "heroic": "https://upload.wikimedia.org/wikipedia/en/4/41/Heroic_%28esports%29_logo.svg",
    "astralis": "https://upload.wikimedia.org/wikipedia/en/9/9d/Astralis_logo.svg",
    "fnatic": "https://upload.wikimedia.org/wikipedia/en/4/43/Fnatic_logo.svg",
    "complexity": "https://upload.wikimedia.org/wikipedia/en/6/6a/Complexity_Gaming_logo.svg",
    "vp": "https://upload.wikimedia.org/wikipedia/en/8/8e/Virtus.pro_logo.svg",
    "furia": "https://upload.wikimedia.org/wikipedia/en/a/aa/FURIA_Esports_logo.svg",
    "big": "https://upload.wikimedia.org/wikipedia/en/c/c7/BIG_%28esports%29_logo.svg",
}

FALLBACK_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="20" fill="{color}"/>
  <text x="64" y="78" text-anchor="middle" fill="#fff" font-family="Segoe UI,sans-serif" font-size="42" font-weight="900">{abbr}</text>
</svg>"""


def fetch_url(url: str) -> bytes | None:
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "cs2-perfect-player/1.0"})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
            return resp.read()
    except Exception as exc:
        print(f"  skip {url}: {exc}")
        return None


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    teams = json.loads(DATA.read_text(encoding="utf-8"))
    for team in teams["teams"]:
        tid = team["id"]
        abbr = (team.get("nameCn") or team.get("name") or tid)[:3].upper()
        color = team.get("color", "#334155")
        ext = "svg"
        dest = OUT / f"{tid}.svg"
        data = fetch_url(LOGO_URLS.get(tid, "")) if tid in LOGO_URLS else None
        if not data:
            data = FALLBACK_SVG.format(color=color, abbr=abbr).encode("utf-8")
            print(f"fallback {tid}")
        else:
            print(f"downloaded {tid}")
        dest.write_bytes(data)
        team["logo"] = f"assets/images/teams/{tid}.svg"
    DATA.write_text(json.dumps(teams, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated {len(teams['teams'])} teams")


if __name__ == "__main__":
    main()
