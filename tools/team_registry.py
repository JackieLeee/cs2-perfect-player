#!/usr/bin/env python3
"""Team catalog + logo helpers (HLTV / legacy BO3)."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from fetch_valve_vrs import attach_vrs_to_teams

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "assets" / "data"

# Legacy short ids used by the original 16-team league
SLUG_TO_LEGACY_ID: dict[str, str] = {
    "natus-vincere": "navi",
    "vitality": "vitality",
    "team-vitality": "vitality",
    "faze": "faze",
    "faze-clan": "faze",
    "g2": "g2",
    "g2-esports": "g2",
    "mousesports": "mouz",
    "mouz": "mouz",
    "spirit": "spirit",
    "team-spirit": "spirit",
    "liquid": "liquid",
    "team-liquid": "liquid",
    "heroic": "heroic",
    "astralis": "astralis",
    "fnatic": "fnatic",
    "complexity": "complexity",
    "complexity-gaming": "complexity",
    "virtus-pro": "vp",
    "eternal-fire": "eternal",
    "3dmax": "3dmax",
    "furia": "furia",
    "big": "big",
}

# Always include even if outside top N ranking
ENSURE_SLUGS: list[str] = ["fnatic", "complexity", "eternal-fire"]

LEGACY_COLORS: dict[str, str] = {
    "navi": "#ffdd00", "vitality": "#ff5500", "faze": "#e10600", "g2": "#000000",
    "mouz": "#00a651", "spirit": "#00bfff", "liquid": "#0066cc", "heroic": "#ff0040",
    "astralis": "#ff0000", "fnatic": "#ff6600", "complexity": "#0066ff", "vp": "#ff6600",
    "eternal": "#ff4500", "3dmax": "#003366", "furia": "#00ff00", "big": "#ffff00",
}

COUNTRY_REGION: dict[int, str] = {
    11: "NA", 28: "EU", 56: "EU", 58: "EU", 147: "EU", 1: "NA", 2: "EU",
}


def team_id_from_slug(bo3_slug: str) -> str:
    if bo3_slug in SLUG_TO_LEGACY_ID:
        return SLUG_TO_LEGACY_ID[bo3_slug]
    return re.sub(r"[^a-z0-9]+", "-", bo3_slug.lower()).strip("-") or "team"


def team_color(team_id: str) -> str:
    if team_id in LEGACY_COLORS:
        return LEGACY_COLORS[team_id]
    h = hashlib.md5(team_id.encode()).hexdigest()
    r = 80 + int(h[0:2], 16) % 120
    g = 80 + int(h[2:4], 16) % 120
    b = 80 + int(h[4:6], 16) % 120
    return f"#{r:02x}{g:02x}{b:02x}"


def short_name(name: str) -> str:
    known = {
        "Natus Vincere": "NaVi", "Team Vitality": "Vitality", "FaZe Clan": "FaZe",
        "FaZe": "FaZe", "G2 Esports": "G2", "G2": "G2", "MOUZ": "MOUZ",
        "Team Spirit": "Spirit", "Spirit": "Spirit", "Team Liquid": "Liquid",
        "Liquid": "Liquid", "Virtus.pro": "VP", "Ninjas in Pyjamas": "NIP",
        "The MongolZ": "MGLZ", "FURIA": "FURIA", "HEROIC": "Heroic",
        "Complexity": "coL", "Eternal Fire": "EF", "3DMAX": "3DMAX",
        "BetBoom Team": "BB", "GamerLegion": "GL", "paiN Gaming": "paiN",
        "100 Thieves": "100T", "FlyQuest": "FQ", "Inner Circle Esports": "IC",
    }
    return known.get(name, name)


def team_id_from_hltv_name(name: str) -> str:
    slug_key = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if slug_key in SLUG_TO_LEGACY_ID:
        return SLUG_TO_LEGACY_ID[slug_key]
    for key, legacy in SLUG_TO_LEGACY_ID.items():
        if key.replace("-", "") == slug_key.replace("-", ""):
            return legacy
    return slug_key or "team"


def meta_from_hltv_ranking(row: dict[str, Any]) -> dict[str, Any]:
    name = row.get("name") or "Team"
    tid = team_id_from_hltv_name(name)
    return {
        "id": tid,
        "name": name,
        "nameCn": short_name(name),
        "region": "INT",
        "color": team_color(tid),
        "rank": row.get("rank"),
        "valveRank": row.get("rank"),
        "vrsPoints": row.get("points"),
        "hltvId": row.get("id"),
        "logo": f"assets/images/teams/{tid}.webp",
    }


def load_existing_pool() -> dict[str, Any] | None:
    path = DATA / "cs2-player-pool.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def load_existing_teams() -> list[dict[str, Any]]:
    path = DATA / "cs2-teams.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("teams") or []
    except json.JSONDecodeError:
        return []


def meta_from_bo3_row(row: dict[str, Any]) -> dict[str, Any]:
    bo3_slug = row["slug"]
    tid = team_id_from_slug(bo3_slug)
    name = row.get("name") or bo3_slug
    country_id = row.get("country_id")
    logo_remote = row.get("icon_url") or row.get("image_url") or ""
    return {
        "id": tid,
        "name": name,
        "nameCn": short_name(name),
        "region": COUNTRY_REGION.get(country_id, "INT") if country_id else "INT",
        "color": team_color(tid),
        "rank": row.get("rank"),
        "valveRank": row.get("rank"),
        "bo3Slug": bo3_slug,
        "bo3Id": row.get("id"),
        "logoRemote": logo_remote,
        "logo": f"assets/images/teams/{tid}.webp",
    }


def meta_from_team_payload(payload: dict[str, Any]) -> dict[str, Any]:
    row = {
        "slug": payload.get("slug"),
        "name": payload.get("name"),
        "rank": payload.get("rank"),
        "id": payload.get("id"),
        "country_id": payload.get("country_id"),
        "image_url": payload.get("image_url") or payload.get("icon_url"),
        "icon_url": payload.get("icon_url"),
    }
    return meta_from_bo3_row(row)


def merge_team_catalog(ranked: list[dict[str, Any]], extras: list[dict[str, Any]], max_teams: int) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for row in ranked + extras:
        meta = meta_from_bo3_row(row)
        tid = meta["id"]
        prev = by_id.get(tid)
        if not prev or (meta.get("rank") or 999) < (prev.get("rank") or 999):
            by_id[tid] = meta
    ordered = sorted(by_id.values(), key=lambda t: (t.get("rank") is None, t.get("rank") or 999))
    return attach_vrs_to_teams(ordered[:max_teams])


async def download_team_logos(
    client: Any,
    teams: list[dict[str, Any]],
    out_dir: Path,
    skip_existing: bool = True,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for team in teams:
        tid = team["id"]
        dest = out_dir / f"{tid}.webp"
        if skip_existing and dest.exists() and dest.stat().st_size > 100:
            team["logo"] = f"assets/images/teams/{tid}.webp"
            continue
        if client is None:
            svg = out_dir / f"{tid}.svg"
            if svg.exists():
                team["logo"] = f"assets/images/teams/{tid}.svg"
            elif dest.exists():
                team["logo"] = f"assets/images/teams/{tid}.webp"
            continue
        url = team.get("logoRemote") or ""
        if not url and team.get("bo3Slug"):
            try:
                payload = await client.get_team(team["bo3Slug"])
                url = payload.get("icon_url") or payload.get("image_url") or ""
                team["logoRemote"] = url
            except Exception:
                url = ""
        if not url:
            svg = out_dir / f"{tid}.svg"
            if svg.exists():
                team["logo"] = f"assets/images/teams/{tid}.svg"
            continue
        try:
            data = await client.download_bytes(url)
            if data and len(data) > 100:
                dest.write_bytes(data)
                team["logo"] = f"assets/images/teams/{tid}.webp"
        except Exception as exc:
            print(f"  logo skip {tid}: {exc}")
