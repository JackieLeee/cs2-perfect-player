#!/usr/bin/env python3
"""Attach Valve VRS seed points from HLTV Valve Regional Standings."""
from __future__ import annotations

from typing import Any

# Fallback interpolation when only rank is known (legacy BO3 snapshots).
VRS_ANCHORS: list[tuple[int, int]] = [
    (1, 1995), (2, 1895), (3, 1853), (4, 1832), (5, 1820),
    (6, 1791), (7, 1763), (8, 1715), (9, 1697), (10, 1670),
    (12, 1598), (15, 1554), (20, 1474), (25, 1400), (30, 1361),
    (35, 1300), (40, 1250), (45, 1200), (50, 1150), (55, 1100), (60, 1050),
]


def vrs_from_valve_rank(rank: int | None) -> int:
    r = max(1, int(rank or 60))
    if r <= VRS_ANCHORS[0][0]:
        return VRS_ANCHORS[0][1]
    if r >= VRS_ANCHORS[-1][0]:
        return VRS_ANCHORS[-1][1]
    for i in range(len(VRS_ANCHORS) - 1):
        r0, p0 = VRS_ANCHORS[i]
        r1, p1 = VRS_ANCHORS[i + 1]
        if r0 <= r <= r1:
            t = (r - r0) / (r1 - r0)
            return int(round(p0 + (p1 - p0) * t))
    return 1100


def attach_vrs_to_teams(teams: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for t in teams:
        row = dict(t)
        rank = row.get("valveRank") or row.get("rank")
        row["valveRank"] = rank
        points = row.get("vrsPoints")
        if points is not None:
            row["vrsPoints"] = int(points)
            row["vrsSource"] = "hltv.org Valve Regional Standings"
        else:
            row["vrsPoints"] = vrs_from_valve_rank(rank)
            row["vrsSource"] = "hltv.org rank → interpolated VRS"
        out.append(row)
    return out
