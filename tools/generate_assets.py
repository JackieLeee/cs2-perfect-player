#!/usr/bin/env python3
"""Generate CS2 Perfect Player character avatars and player headshot SVGs."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "assets" / "data"
CHAR_DIR = ROOT / "assets" / "images" / "character-avatars"
PLAYER_DIR = ROOT / "assets" / "images" / "players"

CHAR_GROUPS = [
    ("亚洲", ["#ff6b35", "#00d4aa", "#4dabf7", "#ffd43b", "#e64980", "#845ef7"]),
    ("欧美", ["#339af0", "#51cf66", "#ff922b", "#f06595", "#748ffc", "#63e6be"]),
    ("CIS", ["#ffa94d", "#74c0fc", "#a9e34b", "#ff6b6b", "#9775fa", "#20c997"]),
]

CHAR_TONES = ["冷静", "爆发", "精准", "稳健", "团队", "领袖"]


def slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip()).strip("-").lower()
    return s or "player"


def svg_character(idx: int, group: str, color: str, tone: str) -> str:
    g = int(color[1:3], 16)
    b = int(color[3:5], 16)
    c = int(color[5:7], 16)
    dark = f"#{max(g - 40, 0):02x}{max(b - 40, 0):02x}{max(c - 40, 0):02x}"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{color}"/>
      <stop offset="100%" stop-color="{dark}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="85%" r="55%">
      <stop offset="0%" stop-color="{color}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="{dark}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="#111827"/>
  <rect width="512" height="512" fill="url(#glow)"/>
  <ellipse cx="256" cy="430" rx="150" ry="28" fill="#000" opacity="0.25"/>
  <circle cx="256" cy="198" r="92" fill="url(#bg)"/>
  <path d="M126 430c18-78 68-118 130-118s112 40 130 118" fill="url(#bg)"/>
  <rect x="176" y="288" width="160" height="118" rx="36" fill="#1f2937" opacity="0.35"/>
  <text x="256" y="470" text-anchor="middle" fill="#e5e7eb" font-family="Segoe UI, sans-serif" font-size="28" font-weight="700">{group}</text>
  <text x="256" y="36" text-anchor="middle" fill="#f9fafb" font-family="Segoe UI, sans-serif" font-size="24" font-weight="800">{tone}</text>
  <text x="256" y="210" text-anchor="middle" fill="#fff" font-family="Segoe UI, sans-serif" font-size="56" font-weight="900">{idx:02d}</text>
</svg>"""


def svg_player(name: str, team_id: str, team_color: str) -> str:
    h = hashlib.md5(f"{team_id}:{name}".encode()).hexdigest()
    hue_shift = int(h[:2], 16) % 40 - 20
    g = int(team_color[1:3], 16)
    b = int(team_color[3:5], 16)
    c = int(team_color[5:7], 16)
    accent = f"#{min(255, max(0, g + hue_shift)):02x}{min(255, max(0, b + hue_shift)):02x}{min(255, max(0, c + hue_shift)):02x}"
    initial = (name[:1] or "?").upper()
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{team_color}"/>
      <stop offset="100%" stop-color="{accent}"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="62" fill="#0f172a" stroke="{team_color}" stroke-width="4"/>
  <circle cx="64" cy="64" r="54" fill="url(#bg)" opacity="0.92"/>
  <circle cx="64" cy="52" r="22" fill="#111827" opacity="0.35"/>
  <path d="M28 98c8-22 28-34 36-34s28 12 36 34" fill="#111827" opacity="0.35"/>
  <text x="64" y="74" text-anchor="middle" fill="#fff" font-family="Segoe UI, sans-serif" font-size="34" font-weight="900">{initial}</text>
</svg>"""


def generate_character_avatars() -> list[dict]:
    CHAR_DIR.mkdir(parents=True, exist_ok=True)
    avatars = []
    idx = 1
    for group, colors in CHAR_GROUPS:
        for i, color in enumerate(colors):
            aid = f"avatar-{idx:02d}"
            rel = f"assets/images/character-avatars/{aid}.svg"
            path = ROOT / rel
            tone = CHAR_TONES[i]
            path.write_text(svg_character(idx, group, color, tone), encoding="utf-8")
            avatars.append({
                "id": aid,
                "group": group,
                "color": color,
                "tone": tone,
                "photoLocal": rel,
            })
            idx += 1
    manifest = {
        "version": 1,
        "count": len(avatars),
        "format": "SVG",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "avatars": avatars,
    }
    (DATA / "character-avatar-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return avatars


def generate_player_headshots() -> dict[str, str]:
    teams = json.loads((DATA / "cs2-teams.json").read_text(encoding="utf-8"))
    team_colors = {t["id"]: t.get("color", "#334155") for t in teams["teams"]}
    pool = json.loads((DATA / "cs2-player-pool.json").read_text(encoding="utf-8"))
    manifest: dict[str, str] = {}

    for team_id, block in pool.get("teams", {}).items():
        color = team_colors.get(team_id, "#334155")
        out_dir = PLAYER_DIR / team_id
        out_dir.mkdir(parents=True, exist_ok=True)
        for bucket in ("players", "historicalPlayers"):
            for p in block.get(bucket, []):
                name = p.get("name", "")
                if not name:
                    continue
                fname = f"{slug(name)}.svg"
                rel = f"assets/images/players/{team_id}/{fname}"
                (ROOT / rel).write_text(svg_player(name, team_id, color), encoding="utf-8")
                key = f"{team_id}:{name}"
                manifest[key] = rel
                p["photo"] = rel

    pool["photoManifestGeneratedAt"] = datetime.now(timezone.utc).isoformat()
    (DATA / "cs2-player-pool.json").write_text(
        json.dumps(pool, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (DATA / "player-photo-manifest.json").write_text(
        json.dumps({"version": 1, "count": len(manifest), "photos": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    chars = generate_character_avatars()
    photos = generate_player_headshots()
    print(f"Generated {len(chars)} character avatars")
    print(f"Generated {len(photos)} player headshots")


if __name__ == "__main__":
    main()
