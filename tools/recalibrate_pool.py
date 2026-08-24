#!/usr/bin/env python3
"""Recalibrate OVR/attrs in cs2-player-pool.json from stored HLTV ratings (no network)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "assets" / "data"
POOL_PATH = DATA / "cs2-player-pool.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_cs2_player_pool import ATTR_KEYS, ROLE_ATTR_BIAS, calc_ovr, clamp  # noqa: E402


def anchor_ovr(hltv_rating: float | None, old_ovr: int) -> int:
    if hltv_rating is not None:
        return clamp(int(45 + float(hltv_rating) * 32))
    return clamp(int(55 + (old_ovr - 63) * 0.45))


def rescale_attrs(old_attrs: dict[str, int], old_ovr: int, target_ovr: int, role: str) -> dict[str, int]:
    if old_ovr <= 0:
        old_ovr = 80
    ratio = target_ovr / old_ovr
    attrs: dict[str, int] = {}
    for k in ATTR_KEYS:
        raw = old_attrs.get(k, target_ovr)
        centered = raw - old_ovr
        attrs[k] = clamp(int(target_ovr + centered * ratio * 0.72))
    bias = ROLE_ATTR_BIAS.get(role, {})
    for k, bonus in bias.items():
        attrs[k] = clamp(attrs[k] + bonus // 2)
    return attrs


def collect_rating_medians(pool: dict) -> tuple[dict[str, float], float]:
    by_team: dict[str, float] = {}
    all_vals: list[float] = []
    for tid, team in (pool.get("teams") or {}).items():
        vals: list[float] = []
        for key in ("players", "historicalPlayers"):
            for p in team.get(key) or []:
                src = p.get("source") or {}
                rating = src.get("hltvRating")
                if rating is None:
                    rating = p.get("rating")
                if rating is not None:
                    v = float(rating)
                    vals.append(v)
                    all_vals.append(v)
        if vals:
            vals.sort()
            by_team[tid] = vals[len(vals) // 2]
    all_vals.sort()
    global_med = all_vals[len(all_vals) // 2] if all_vals else 1.05
    return by_team, global_med


def resolve_hltv_rating(p: dict, team_medians: dict[str, float], global_med: float) -> float:
    src = p.get("source") or {}
    rating = src.get("hltvRating")
    if rating is not None:
        return float(rating)
    if p.get("rating") is not None:
        return float(p["rating"])
    tid = p.get("teamId") or ""
    return team_medians.get(tid, global_med)


def recalibrate_player(p: dict, team_medians: dict[str, float], global_med: float) -> dict:
    role = p.get("role") or "Entry"
    old_ovr = int(p.get("ovr") or 80)
    old_attrs = p.get("attrs") or {}
    rating = resolve_hltv_rating(p, team_medians, global_med)
    src = dict(p.get("source") or {})
    if src.get("hltvRating") is None:
        src["hltvRating"] = round(rating, 3)
        src["hltvImputed"] = True
    src["provider"] = "hltv.org"
    p["source"] = src
    target = anchor_ovr(rating, old_ovr)
    p["attrs"] = rescale_attrs(old_attrs, old_ovr, target, role)
    p["ovr"] = calc_ovr(p["attrs"], role)
    p["rating"] = round(rating, 2)
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
    rules = pool.setdefault("rules", {})
    rules["calibration"] = {
        "version": 4,
        "method": "HLTV Rating 2.0 anchor + team-median imputation + attr rescale",
        "ovrFormula": "OVR ≈ clamp(45 + hltvRating × 32)",
        "ratingFormula": "HLTV Rating 2.0 (direct)",
        "statsWindow": "3 months",
        "provider": "hltv.org",
        "note": "属性来自 HLTV Rating 2.0、ADR、KAST（Big Events · 近 12 个月）；缺失时用同队 Rating 中位数补全。",
    }
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
    print(f"Recalibrated {len(players)} players")
    print(f"OVR range: {ovrs[0]}–{ovrs[-1]}, avg {sum(ovrs)/len(ovrs):.1f}")
    top = sorted(players, key=lambda x: -x["ovr"])[:10]
    for i, p in enumerate(top, 1):
        src = p.get("source") or {}
        print(f"  {i:2}. {p['name']:12} OVR {p['ovr']} rating {p['rating']} hltv {src.get('hltvRating')}")


if __name__ == "__main__":
    main()
