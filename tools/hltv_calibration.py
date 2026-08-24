"""Shared HLTV stats → 13 attrs → OVR calibration (Big Events · 12 months)."""
from __future__ import annotations

from typing import Any

from build_cs2_player_pool import ATTR_KEYS, ROLE_ATTR_BIAS, calc_ovr, clamp

MIN_MAPS_TRUST = 20

# HLTV Big Events 职业池参考均值（Rating 2.0 口径）
HLTV_MEAN = {
    "rating": 1.05,
    "adr": 75.0,
    "kast": 72.0,
    "kpr": 0.72,
    "kd": 1.05,
    "swing": 0.0,
}

# 角色对 ADR/KAST/K/D 的 typical 偏移（无明细统计时用于推断）
ROLE_STAT_PROFILE: dict[str, dict[str, float]] = {
    "AWP": {"adr": 0.98, "kast": 1.02, "kpr": 1.06, "kd": 1.08, "swing": 0.9},
    "IGL": {"adr": 0.88, "kast": 1.08, "kpr": 0.88, "kd": 0.92, "swing": 0.7},
    "Entry": {"adr": 1.06, "kast": 0.96, "kpr": 1.12, "kd": 1.02, "swing": 1.1},
    "Lurk": {"adr": 1.02, "kast": 1.04, "kpr": 1.0, "kd": 1.06, "swing": 1.15},
    "Support": {"adr": 0.92, "kast": 1.10, "kpr": 0.86, "kd": 0.95, "swing": 0.75},
}


def team_median_from_candidates(candidates: list[dict[str, Any]], stats_by_pid: dict[int, dict[str, Any]]) -> float:
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


def _scale(value: float, baseline: float, per_unit: float, center: int = 66) -> int:
    return clamp(int(round(center + (float(value) - baseline) * per_unit)))


def resolve_hltv_stats(
    stats: dict[str, Any] | None,
    src: dict[str, Any] | None,
    rating: float,
    role: str,
) -> dict[str, float]:
    """Merge match aggregates / source fields; infer missing fields from rating + role."""
    stats = dict(stats or {})
    src = dict(src or {})
    r = float(stats.get("rating") or src.get("effectiveRating") or src.get("hltvRating") or rating)
    prof = ROLE_STAT_PROFILE.get(role, ROLE_STAT_PROFILE["Entry"])
    rt = r - HLTV_MEAN["rating"]

    adr = stats.get("adr")
    if adr is None:
        adr = src.get("adr")
    if adr is None:
        adr = HLTV_MEAN["adr"] + rt * 38 * prof["adr"]

    kast = stats.get("kast")
    if kast is None:
        kast = src.get("kast")
    if kast is None:
        kast = HLTV_MEAN["kast"] + rt * 14 * prof["kast"]

    k = stats.get("k")
    if k is None:
        k = src.get("k")
    if k is None:
        k = 14.0 + rt * 7.5 * prof["kpr"]

    d = stats.get("d")
    if d is None:
        d = src.get("d")
    if d is None:
        d = max(14.0 - rt * 2.5 * (2.0 - prof["kd"]), 0.1)

    swing = stats.get("swing")
    if swing is None:
        swing = src.get("swing")
    if swing is None:
        swing = rt * 0.75 * prof["swing"]

    k = float(k)
    d = max(float(d), 0.1)
    return {
        "rating": r,
        "adr": float(adr),
        "kast": float(kast),
        "k": k,
        "d": d,
        "swing": float(swing),
        "kpr": k / 24.0,
        "kd": k / d,
    }


def stats_to_source_fields(st: dict[str, float]) -> dict[str, Any]:
    return {
        "adr": round(st["adr"], 2),
        "kast": round(st["kast"], 2),
        "swing": round(st["swing"], 3),
        "k": round(st["k"], 2),
        "d": round(st["d"], 2),
        "kpr": round(st["kpr"], 3),
        "kd": round(st["kd"], 3),
    }


def attrs_from_hltv(stats: dict[str, Any], role: str, rating: float, peak: bool = False) -> dict[str, int]:
    """Map HLTV Rating / ADR / KAST / K-D / Swing to 13 distinct attributes."""
    st = resolve_hltv_stats(stats, None, rating, role)

    rn = _scale(st["rating"], HLTV_MEAN["rating"], 58)
    adr_n = _scale(st["adr"], HLTV_MEAN["adr"], 1.05)
    kast_n = _scale(st["kast"], HLTV_MEAN["kast"], 1.28)
    kpr_n = _scale(st["kpr"], HLTV_MEAN["kpr"], 82)
    kd_n = _scale(st["kd"], HLTV_MEAN["kd"], 34)
    swing_n = _scale(st["swing"], HLTV_MEAN["swing"], 12)

    attrs: dict[str, int] = {
        "AIM": clamp(int(rn * 0.38 + adr_n * 0.34 + kpr_n * 0.28)),
        "REFL": clamp(int(rn * 0.52 + swing_n * 0.48)),
        "SPRY": clamp(int(kpr_n * 0.42 + rn * 0.33 + adr_n * 0.25)),
        "AWPE": clamp(int(kpr_n * 0.48 + adr_n * 0.32 + rn * 0.20)),
        "UTLY": clamp(int(adr_n * 0.52 + kast_n * 0.48)),
        "GMSN": clamp(int(kast_n * 0.52 + rn * 0.28 + swing_n * 0.20)),
        "COMM": clamp(int(kast_n * 0.55 + rn * 0.25 + kd_n * 0.20)),
        "CLUT": clamp(int(kd_n * 0.38 + rn * 0.42 + swing_n * 0.20)),
        "ENTR": clamp(int(kpr_n * 0.46 + adr_n * 0.34 + rn * 0.20)),
        "LURK": clamp(int(swing_n * 0.38 + kast_n * 0.32 + rn * 0.30)),
        "TEAM": clamp(int(kast_n * 0.62 + rn * 0.18 + (100 - abs(kd_n - 58)) * 0.20)),
        "MENT": clamp(int(kast_n * 0.42 + rn * 0.33 + kd_n * 0.25)),
        "CONS": clamp(int(kast_n * 0.48 + (100 - abs(kd_n - 58)) * 0.32 + rn * 0.20)),
    }

    for k_attr, bonus in ROLE_ATTR_BIAS.get(role, {}).items():
        attrs[k_attr] = clamp(attrs[k_attr] + bonus // 2)

    if peak:
        for k_attr in attrs:
            attrs[k_attr] = clamp(attrs[k_attr] + 2)

    return attrs


def build_player_attrs_ovr(
    stats: dict[str, Any],
    src: dict[str, Any] | None,
    role: str,
    eff_rating: float,
    peak: bool = False,
) -> tuple[dict[str, int], int, dict[str, float]]:
    """Returns attrs, ovr (from calc_ovr), resolved HLTV stats."""
    merged = resolve_hltv_stats(stats, src, eff_rating, role)
    attrs = attrs_from_hltv(merged, role, eff_rating, peak)
    ovr = calc_ovr(attrs, role)
    return attrs, ovr, merged


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
        "version": 6,
        "method": "HLTV stats → 13 attrs → role-weighted OVR",
        "ovrFormula": "OVR = calc_ovr(attrs, role); attrs from Rating/ADR/KAST/K-D/Swing",
        "ratingFormula": "HLTV Rating 2.0 (effectiveRating after sample shrinkage)",
        "statsWindow": "12 months",
        "provider": "hltv.org",
        "minMapsTrust": MIN_MAPS_TRUST,
        "attrDrivers": {
            "AIM": "Rating + ADR + KPR",
            "REFL": "Rating + Swing",
            "SPRY": "KPR + Rating + ADR",
            "AWPE": "KPR + ADR",
            "UTLY": "ADR + KAST",
            "GMSN": "KAST + Rating",
            "COMM": "KAST + Rating",
            "CLUT": "K/D + Rating",
            "ENTR": "KPR + ADR",
            "LURK": "Swing + KAST",
            "TEAM": "KAST",
            "MENT": "KAST + K/D",
            "CONS": "KAST + stability",
        },
        "note": "OVR 由 13 项属性按角色权重加权得出；属性各自由 HLTV 统计独立映射。",
    }
