"""Shared HLTV rating → OVR/attrs calibration (Big Events · 12 months)."""
from __future__ import annotations

from typing import Any

from build_cs2_player_pool import ATTR_KEYS, ROLE_ATTR_BIAS, calc_ovr, clamp

# HLTV 选手页通常要求一定样本量；低于此值向队内中位数回归，避免 1–3 场爆表。
MIN_MAPS_TRUST = 20


def team_median_from_candidates(candidates: list[dict[str, Any]], stats_by_pid: dict[int, dict[str, Any]]) -> float:
    """Median raw rating using only players with enough maps (avoids small-sample inflation)."""
    trusted: list[float] = []
    for c in candidates:
        pid = int(c.get("id") or 0)
        st = stats_by_pid.get(pid) or {}
        maps = int(st.get("N") or 0)
        raw = float(c.get("best_rating") or st.get("rating") or 0)
        if raw > 0 and maps >= MIN_MAPS_TRUST:
            trusted.append(raw)
    if trusted:
        trusted.sort()
        return trusted[len(trusted) // 2]
    fallback = sorted(float(c.get("best_rating") or 0) for c in candidates if float(c.get("best_rating") or 0) > 0)
    return fallback[len(fallback) // 2] if fallback else 1.05


def anchor_ovr(hltv_rating: float) -> int:
    """Map HLTV Rating 2.0 to game OVR (avg pro ~1.05 → ~81, elite ~1.25 → ~87)."""
    return clamp(int(round(53 + float(hltv_rating) * 27)))


def shrink_rating(raw: float, maps: int, fallback: float) -> float:
    if maps >= MIN_MAPS_TRUST:
        return float(raw)
    w = min(1.0, max(0.0, maps / MIN_MAPS_TRUST))
    fb = float(fallback)
    return fb + (float(raw) - fb) * w


def effective_rating(
    raw_rating: float | None,
    maps: int,
    team_median: float,
    global_median: float = 1.05,
) -> float:
    raw = float(raw_rating if raw_rating is not None else team_median)
    fallback = team_median if maps > 0 else global_median
    return shrink_rating(raw, maps, fallback)


def attrs_from_hltv(stats: dict[str, Any], role: str, rating: float, peak: bool = False) -> dict[str, int]:
    """Build attrs centered on anchor_ovr(rating) with modest stat-driven spread."""
    target = anchor_ovr(rating)
    adr = float(stats.get("adr") or 75.0)
    kast = float(stats.get("kast") or 72.0)
    swing = float(stats.get("swing") or 0.0)
    k = float(stats.get("k") or 14.0)
    d = max(float(stats.get("d") or 14.0), 0.1)
    kd = k / d
    kpr = k / 24.0
    rt = rating - 1.0

    attrs: dict[str, int] = {
        "AIM": clamp(target + int(rt * 5 + (adr - 75) * 0.05)),
        "REFL": clamp(target + int(rt * 4 + swing * 0.4)),
        "SPRY": clamp(target + int((kpr - 0.72) * 8 + rt * 3)),
        "AWPE": clamp(target + int((kpr - 0.72) * 10 + (adr - 75) * 0.04)),
        "UTLY": clamp(target + int((adr - 75) * 0.08 + (kast - 72) * 0.06)),
        "GMSN": clamp(target + int((kast - 72) * 0.08 + rt * 3)),
        "COMM": clamp(target + int((kast - 72) * 0.07 + rt * 2)),
        "CLUT": clamp(target + int(rt * 4 + (kd - 1.0) * 3)),
        "ENTR": clamp(target + int((kpr - 0.72) * 10 + rt * 3)),
        "LURK": clamp(target + int(rt * 4 + swing * 0.3)),
        "TEAM": clamp(target + int((kast - 72) * 0.08 + rt * 2)),
        "MENT": clamp(target + int(rt * 4 + (kast - 72) * 0.04)),
        "CONS": clamp(target + int((kast - 72) * 0.06 + (1 - abs(kd - 1.05)) * 2)),
    }
    for k_attr, bonus in ROLE_ATTR_BIAS.get(role, {}).items():
        attrs[k_attr] = clamp(attrs[k_attr] + bonus // 4)
    if peak:
        for k_attr in attrs:
            attrs[k_attr] = clamp(attrs[k_attr] + 2)

    # Nudge so role-weighted OVR matches anchor (usually within 1–2).
    tuned = calc_ovr(attrs, role)
    if tuned != target:
        delta = target - tuned
        weights = _role_weights(role)
        for k_attr in sorted(ATTR_KEYS, key=lambda k: -weights.get(k, 0.05)):
            if delta == 0:
                break
            step = 1 if delta > 0 else -1
            attrs[k_attr] = clamp(attrs[k_attr] + step)
            delta -= step
    return attrs


def _role_weights(role: str) -> dict[str, float]:
    from build_cs2_player_pool import calc_ovr as _  # noqa: F401

    weights = {
        "IGL": {"COMM": 0.14, "GMSN": 0.12, "TEAM": 0.10, "MENT": 0.08, "AIM": 0.08},
        "AWP": {"AWPE": 0.16, "AIM": 0.14, "REFL": 0.10, "CLUT": 0.10, "GMSN": 0.08},
        "Entry": {"ENTR": 0.14, "AIM": 0.14, "REFL": 0.10, "SPRY": 0.08, "CLUT": 0.08},
        "Lurk": {"LURK": 0.14, "GMSN": 0.12, "CLUT": 0.10, "AIM": 0.10, "CONS": 0.08},
        "Support": {"UTLY": 0.14, "TEAM": 0.12, "GMSN": 0.10, "COMM": 0.08, "MENT": 0.08},
    }
    base = weights.get(role, weights["Entry"])
    return {k: base.get(k, 0.05) for k in ATTR_KEYS}


def collect_rating_medians(pool: dict) -> tuple[dict[str, float], float]:
    by_team: dict[str, float] = {}
    trusted_all: list[float] = []
    fallback_all: list[float] = []
    for tid, team in (pool.get("teams") or {}).items():
        trusted: list[float] = []
        fallback: list[float] = []
        for key in ("players", "historicalPlayers"):
            for p in team.get(key) or []:
                src = p.get("source") or {}
                rating = src.get("hltvRating")
                if rating is None:
                    rating = p.get("rating")
                if rating is None:
                    continue
                v = float(rating)
                fallback.append(v)
                fallback_all.append(v)
                maps = int(src.get("mapsPlayed") or 0)
                if maps >= MIN_MAPS_TRUST:
                    trusted.append(v)
                    trusted_all.append(v)
        if trusted:
            trusted.sort()
            by_team[tid] = trusted[len(trusted) // 2]
        elif fallback:
            fallback.sort()
            by_team[tid] = fallback[len(fallback) // 2]
    trusted_all.sort()
    fallback_all.sort()
    if trusted_all:
        global_med = trusted_all[len(trusted_all) // 2]
    elif fallback_all:
        global_med = fallback_all[len(fallback_all) // 2]
    else:
        global_med = 1.05
    return by_team, global_med


def calibration_rules_note() -> dict[str, Any]:
    return {
        "version": 5,
        "method": "HLTV Rating 2.0 + sample shrinkage + tightened OVR anchor",
        "ovrFormula": f"OVR ≈ clamp(53 + effectiveRating × 27); maps<{MIN_MAPS_TRUST} regresses to team median",
        "ratingFormula": "HLTV Rating 2.0 (Big Events match aggregation)",
        "statsWindow": "12 months",
        "provider": "hltv.org",
        "minMapsTrust": MIN_MAPS_TRUST,
        "note": "低样本 Rating 向队内中位数回归，避免少量场次虚高；OVR 上限约 90（顶尖 1.40+）。",
    }
