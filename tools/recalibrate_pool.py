#!/usr/bin/env python3
"""Recalibrate OVR/attrs in cs2-player-pool.json from stored HLTV stats (no network)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "assets" / "data"
POOL_PATH = DATA / "cs2-player-pool.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hltv_calibration import (  # noqa: E402
    build_player_attrs_ovr,
    calibration_rules_note,
    collect_rating_medians,
    effective_rating,
    stats_to_source_fields,
)


def recalibrate_player(p: dict, team_medians: dict[str, float], global_med: float) -> dict:
    role = p.get("role") or "Entry"
    src = dict(p.get("source") or {})
    tid = p.get("teamId") or ""
    team_med = team_medians.get(tid, global_med)
    maps = int(src.get("mapsPlayed") or 0)
    raw = src.get("hltvRating")
    if raw is None:
        raw = p.get("rating")
    eff = round(effective_rating(float(raw) if raw is not None else team_med, maps, team_med, global_med), 3)
    src["hltvRating"] = round(float(raw), 3) if raw is not None else eff
    src["effectiveRating"] = eff
    src["provider"] = "hltv.org"
    if maps < 20 and raw is not None and abs(eff - float(raw)) > 0.02:
        src["ratingShrunk"] = True
    else:
        src.pop("ratingShrunk", None)

    attrs, ovr, resolved = build_player_attrs_ovr({}, src, role, eff, bool(p.get("historicalPeak")))
    src.update(stats_to_source_fields(resolved))
    if not src.get("adr") and resolved.get("adr"):
        src["statsInferred"] = True

    p["source"] = src
    p["attrs"] = attrs
    p["ovr"] = ovr
    p["rating"] = round(eff, 2)
    return p


def recalibrate_pool(pool: dict) -> dict:
    team_medians, global_med = collect_rating_medians(pool)
    for team in (pool.get("teams") or {}).values():
        team["players"] = [
            recalibrate_player(dict(p), team_medians, global_med) for p in team.get("players") or []
        ]
        team["historicalPlayers"] = [
            recalibrate_player(dict(p), team_medians, global_med) for p in team.get("historicalPlayers") or []
        ]
    pool.setdefault("rules", {})["calibration"] = calibration_rules_note()
    return pool


def main() -> None:
    if not POOL_PATH.exists():
        raise SystemExit(f"Missing {POOL_PATH}")
    pool = json.loads(POOL_PATH.read_text(encoding="utf-8"))
    pool = recalibrate_pool(pool)
    POOL_PATH.write_text(json.dumps(pool, ensure_ascii=False, indent=2), encoding="utf-8")
    players = []
    for t in pool["teams"].values():
        players.extend(t.get("players") or [])
    ovrs = sorted(p["ovr"] for p in players)
    spreads = []
    for p in players:
        vals = list((p.get("attrs") or {}).values())
        if vals:
            spreads.append(max(vals) - min(vals))
    print(f"Recalibrated {len(players)} players")
    print(f"OVR range: {ovrs[0]}–{ovrs[-1]}, avg {sum(ovrs)/len(ovrs):.1f}")
    print(f"Attr spread avg {sum(spreads)/len(spreads):.1f}, min {min(spreads)}, max {max(spreads)}")
    top = sorted(players, key=lambda x: -x["ovr"])[:8]
    for i, p in enumerate(top, 1):
        src = p.get("source") or {}
        a = p.get("attrs") or {}
        spread = max(a.values()) - min(a.values()) if a else 0
        print(f"  {i:2}. {p['name']:12} OVR {p['ovr']} rtg {p['rating']} spread {spread}")


if __name__ == "__main__":
    main()
