#!/usr/bin/env python3
"""Fetch CS2 rosters and player stats from HLTV.org (via api.csapi.de scraper API)."""
from __future__ import annotations

import asyncio
import json
import ssl
from datetime import date, timedelta, timezone
from pathlib import Path
from typing import Any

import aiohttp

from build_cs2_player_pool import ROLE_ATTR_BIAS, calc_ovr, clamp, slug
from fetch_cs2_data import ROLE_OVERRIDES, infer_role
from fetch_valve_vrs import attach_vrs_to_teams
from team_registry import (
    download_team_logos,
    load_existing_pool,
    load_existing_teams,
    meta_from_hltv_ranking,
    short_name,
    team_color,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "assets" / "data"
LOGO_DIR = ROOT / "assets" / "images" / "teams"

HLTV_API = "https://api.csapi.de"
CURRENT_YEAR = 2026
STATS_MONTHS = 12
MATCH_TYPE = "BigEvents"
DEFAULT_TOP_LIMIT = 50
DEFAULT_MAX_TEAMS = 60
DEFAULT_TEAM_CONCURRENCY = 1
DEFAULT_REQ_CONCURRENCY = 2
TARGET_CURRENT = 12
TARGET_HISTORICAL = 5
MATCH_HISTORY_LIMIT = 100
REQUEST_DELAY_SEC = 0.5

HEADERS = {
    "accept": "application/json",
    "user-agent": "cs2-perfect-player/1.0 (+https://github.com/JackieLeee/cs2-perfect-player)",
}


def stats_date_range() -> tuple[str, str]:
    end = date.today()
    start = end - timedelta(days=365)
    return start.isoformat(), end.isoformat()


def is_hltv_big_event(event_name: str | None) -> bool:
    """Approximate HLTV matchType=BigEvents using event titles from match history."""
    e = (event_name or "").lower()
    if not e:
        return False
    if any(
        x in e
        for x in (
            "qualifier",
            "qualifying",
            "academy",
            "bounty",
            "rivals",
            "challenger league",
            "contenders",
            "esea",
            "cct ",
            "rush zone",
            "thunderpick",
            "lanfest",
            "ukic",
            "nxt ",
            "showmatch",
        )
    ):
        return False
    return any(
        x in e
        for x in (
            "major",
            "iem",
            "esl pro league",
            "blast open",
            "blast premier",
            "pgl ",
            "starladder",
            "world cup",
            "dreamhack masters",
            "wembley",
            "perfect world",
        )
    )


def aggregate_player_match_stats(
    lines: list[dict[str, Any]],
) -> dict[str, float | int]:
    if not lines:
        return {}
    maps = sum(int(x.get("maps") or 1) for x in lines)
    if maps <= 0:
        return {}
    rating = sum(float(x["rating"]) * int(x["maps"]) for x in lines) / maps
    adr = sum(float(x["adr"]) * int(x["maps"]) for x in lines) / maps
    kast = sum(float(x["kast"]) * int(x["maps"]) for x in lines) / maps
    swing = sum(float(x.get("swing") or 0) * int(x["maps"]) for x in lines) / maps
    k = sum(float(x.get("k") or 0) for x in lines) / maps
    d = sum(float(x.get("d") or 0) for x in lines) / maps
    return {
        "rating": round(rating, 3),
        "adr": round(adr, 3),
        "kast": round(kast, 3),
        "swing": round(swing, 3),
        "k": round(k, 3),
        "d": round(d, 3),
        "N": maps,
        "matches": len(lines),
    }


def _nick_key(name: str) -> str:
    return name.strip().lower()


def hltv_stats_to_attrs(stats: dict[str, Any], role: str, peak: bool = False) -> dict[str, int]:
    rating = float(stats.get("rating") or 1.0)
    adr = float(stats.get("adr") or 72.0)
    kast = float(stats.get("kast") or 72.0) / 100.0
    k = float(stats.get("k") or 14.0)
    d = max(float(stats.get("d") or 14.0), 0.1)
    kd = k / d
    kpr = k / 24.0
    swing = float(stats.get("swing") or 0.0)

    base = clamp(int(40 + rating * 35))
    attrs = {
        "AIM": clamp(int(base + (rating - 1.0) * 20 + (adr - 75) * 0.18)),
        "REFL": clamp(int(base + (rating - 1.0) * 16 + swing * 1.2)),
        "SPRY": clamp(int(base + (kpr - 0.72) * 18 + (rating - 1.0) * 8)),
        "AWPE": clamp(int(base + (kpr - 0.72) * 22 + (adr - 75) * 0.12)),
        "UTLY": clamp(int(base + (adr - 75) * 0.28 + kast * 10)),
        "GMSN": clamp(int(base + kast * 14 + (rating - 1.0) * 10)),
        "COMM": clamp(int(base + kast * 16 + (rating - 1.0) * 6)),
        "CLUT": clamp(int(base + kd * 6 + (rating - 1.0) * 12)),
        "ENTR": clamp(int(base + (kpr - 0.72) * 24 + (rating - 1.0) * 10)),
        "LURK": clamp(int(base + (rating - 1.0) * 14 + swing * 0.8)),
        "TEAM": clamp(int(base + kast * 18 + (rating - 1.0) * 6)),
        "MENT": clamp(int(base + (rating - 1.0) * 14 + kast * 8)),
        "CONS": clamp(int(base + kast * 12 + (1 - abs(kd - 1.05)) * 8)),
    }
    for k_attr, bonus in ROLE_ATTR_BIAS.get(role, {}).items():
        attrs[k_attr] = clamp(attrs[k_attr] + bonus // 2)
    if peak:
        for k_attr in attrs:
            attrs[k_attr] = clamp(attrs[k_attr] + 3)
    return attrs


class HltvClient:
    def __init__(self, req_concurrency: int = DEFAULT_REQ_CONCURRENCY) -> None:
        self._session: aiohttp.ClientSession | None = None
        self._sem = asyncio.Semaphore(req_concurrency)
        self._player_cache: dict[str, dict[str, Any]] = {}
        self._match_stats_cache: dict[int, list[dict[str, Any]]] = {}
        self._team_big_event_stats: dict[int, dict[int, dict[str, Any]]] = {}
        self.stats_start, self.stats_end = stats_date_range()
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        self._connector = aiohttp.TCPConnector(ssl=ssl_ctx, limit=32)

    async def __aenter__(self) -> HltvClient:
        self._session = aiohttp.ClientSession(headers=HEADERS, connector=self._connector)
        return self

    async def __aexit__(self, *args: Any) -> None:
        if self._session:
            await self._session.close()

    async def get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        assert self._session
        url = f"{HLTV_API}{path}"
        last_exc: Exception | None = None
        for attempt in range(6):
            async with self._sem:
                await asyncio.sleep(REQUEST_DELAY_SEC)
                try:
                    async with self._session.get(
                        url, params=params or {}, timeout=aiohttp.ClientTimeout(total=60)
                    ) as resp:
                        if resp.status == 429:
                            wait = min(30, 2 ** attempt + 2)
                            print(f"    rate limited, wait {wait}s …")
                            await asyncio.sleep(wait)
                            continue
                        resp.raise_for_status()
                        return await resp.json()
                except aiohttp.ClientError as exc:
                    last_exc = exc
                    await asyncio.sleep(2 ** attempt)
        raise last_exc or RuntimeError(f"Failed GET {path}")

    async def get_rankings(self) -> list[dict[str, Any]]:
        data = await self.get_json("/rankings/")
        return data.get("rankings") or []

    async def get_team(self, hltv_team_id: int) -> dict[str, Any]:
        return await self.get_json(f"/teams/{hltv_team_id}")

    async def get_team_match_history(self, hltv_team_id: int, limit: int = MATCH_HISTORY_LIMIT) -> list[dict[str, Any]]:
        data = await self.get_json(f"/teams/{hltv_team_id}/matchhistory", {"limit": limit, "offset": 0})
        return data if isinstance(data, list) else []

    async def get_match_stats(self, match_id: int) -> list[dict[str, Any]]:
        if match_id in self._match_stats_cache:
            return self._match_stats_cache[match_id]
        data = await self.get_json(f"/matches/{match_id}/stats")
        rows = data if isinstance(data, list) else []
        self._match_stats_cache[match_id] = rows
        return rows

    async def get_player(self, player_id: int) -> dict[str, Any]:
        cache_key = f"{player_id}:{self.stats_start}:{self.stats_end}:{MATCH_TYPE}"
        if cache_key in self._player_cache:
            return self._player_cache[cache_key]
        data = await self.get_json(
            f"/players/{player_id}",
            {"start_date": self.stats_start, "end_date": self.stats_end},
        )
        self._player_cache[cache_key] = data
        return data

    async def load_team_big_event_stats(self, hltv_team_id: int) -> dict[int, dict[str, Any]]:
        if hltv_team_id in self._team_big_event_stats:
            return self._team_big_event_stats[hltv_team_id]

        per_player: dict[int, list[dict[str, Any]]] = {}
        history = await self.get_team_match_history(hltv_team_id)
        big_matches = [
            m
            for m in history
            if self.stats_start <= (m.get("date") or "") <= self.stats_end
            and is_hltv_big_event(m.get("event"))
        ]

        for match in big_matches:
            match_id = int(match.get("id") or 0)
            if not match_id:
                continue
            map_count = max(len(match.get("maps") or []), 1)
            try:
                blocks = await self.get_match_stats(match_id)
            except Exception:
                continue
            for block in blocks:
                for side in ("team1", "team2"):
                    team = block.get(side) or {}
                    if int(team.get("id") or 0) != hltv_team_id:
                        continue
                    for p in team.get("players") or []:
                        pid = int(p.get("id") or 0)
                        if not pid:
                            continue
                        per_player.setdefault(pid, []).append(
                            {
                                "maps": map_count,
                                "rating": float(p.get("rating") or 0),
                                "adr": float(p.get("adr") or 0),
                                "kast": float(p.get("kast") or 0),
                                "swing": float(p.get("swing") or 0),
                                "k": float(p.get("k") or 0),
                                "d": float(p.get("d") or 0),
                            }
                        )

        aggregated = {
            pid: aggregate_player_match_stats(lines)
            for pid, lines in per_player.items()
            if lines
        }
        self._team_big_event_stats[hltv_team_id] = aggregated
        return aggregated


async def collect_team_players(
    client: HltvClient,
    hltv_team_id: int,
    roster: list[dict[str, Any]],
    team_stats: dict[int, dict[str, Any]],
) -> dict[int, dict[str, Any]]:
    found: dict[int, dict[str, Any]] = {
        int(p["id"]): {
            "id": int(p["id"]),
            "name": p.get("name") or "",
            "best_rating": float((team_stats.get(int(p["id"])) or {}).get("rating") or 0),
            "on_roster": True,
        }
        for p in roster
    }
    for pid, stats in team_stats.items():
        if pid in found:
            found[pid]["best_rating"] = float(stats.get("rating") or found[pid]["best_rating"])
            continue
        found[pid] = {
            "id": pid,
            "name": "",
            "best_rating": float(stats.get("rating") or 0),
            "on_roster": False,
        }
    return found


async def build_player_record(
    client: HltvClient,
    team_id: str,
    ref: dict[str, Any],
    role: str,
    kind: str,
    peak: bool,
    team_stats: dict[int, dict[str, Any]],
) -> dict[str, Any]:
    pid = int(ref["id"])
    name = ref.get("name") or f"player-{pid}"
    detail = await client.get_player(pid)
    name = detail.get("name") or name
    stats = dict(team_stats.get(pid) or detail.get("stats") or {})
    if not stats.get("rating") and ref.get("best_rating"):
        stats["rating"] = ref["best_rating"]
    rating = round(float(stats.get("rating") or ref.get("best_rating") or 1.0), 3)
    attrs = hltv_stats_to_attrs(stats, role, peak)
    ovr = calc_ovr(attrs, role)
    maps = int(stats.get("N") or stats.get("maps_played") or stats.get("maps") or 0)
    start, end = client.stats_start, client.stats_end
    return {
        "name": name,
        "nameCn": name,
        "teamId": team_id,
        "role": role,
        "rating": round(rating, 2),
        "ovr": ovr,
        "age": 22,
        "attrs": attrs,
        "honors": {"majors": 1 if peak else 0, "mvps": 1 if peak and role == "AWP" else 0, "top20": 3 if peak else 0},
        "source": {
            "kind": kind,
            "year": CURRENT_YEAR,
            "label": str(CURRENT_YEAR),
            "code": 0,
            "provider": "hltv.org",
            "hltvPlayerId": pid,
            "hltvRating": rating,
            "mapsPlayed": maps,
            "statsWindow": f"{STATS_MONTHS} months",
            "matchType": MATCH_TYPE,
            "startDate": start,
            "endDate": end,
            "hltvUrl": (
                f"https://www.hltv.org/stats/players/{pid}/{slug(name)}"
                f"?startDate={start}&endDate={end}&matchType={MATCH_TYPE}"
            ),
            "dataVia": "api.csapi.de",
        },
        "historicalPeak": peak,
        "peakRating": ovr if peak else None,
        "photo": f"assets/images/players/{team_id}/{slug(name)}.svg",
    }


async def fetch_team_pool(client: HltvClient, team_meta: dict[str, Any]) -> dict[str, Any]:
    hltv_id = int(team_meta["hltvId"])
    team_id = team_meta["id"]
    payload = await client.get_team(hltv_id)
    roster = payload.get("roster") or []
    roster_ids = {int(p["id"]) for p in roster}
    team_stats = await client.load_team_big_event_stats(hltv_id)
    candidates = await collect_team_players(client, hltv_id, roster, team_stats)

    ratings_for_role = [(c["name"], float(c.get("best_rating") or 1.0)) for c in candidates.values()]
    ordered = sorted(
        candidates.values(),
        key=lambda c: (not c.get("on_roster"), -float(c.get("best_rating") or 0)),
    )

    current_refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for ref in ordered:
        key = _nick_key(ref.get("name") or "")
        if not key or key in seen:
            continue
        seen.add(key)
        if ref.get("on_roster") or len(current_refs) < TARGET_CURRENT:
            current_refs.append(ref)
        if len(current_refs) >= TARGET_CURRENT:
            break

    current_players = []
    for ref in current_refs:
        role = infer_role(ref.get("name") or "", "", ratings_for_role)
        current_players.append(
            await build_player_record(client, team_id, ref, role, "current", False, team_stats)
        )

    hist_refs = [
        ref for ref in ordered
        if int(ref["id"]) not in roster_ids and _nick_key(ref.get("name") or "") not in {_nick_key(p["name"]) for p in current_players}
    ]
    hist_refs.sort(key=lambda r: -float(r.get("best_rating") or 0))
    historical = []
    seen_hist: set[str] = set()
    for ref in hist_refs[: TARGET_HISTORICAL * 2]:
        key = _nick_key(ref.get("name") or "")
        if not key or key in seen_hist:
            continue
        seen_hist.add(key)
        role = infer_role(ref.get("name") or "", "", ratings_for_role)
        historical.append(
            await build_player_record(client, team_id, ref, role, "historical", True, team_stats)
        )
        if len(historical) >= TARGET_HISTORICAL:
            break

    return {"players": current_players, "historicalPlayers": historical}


async def fetch_all_teams(
    top_limit: int = DEFAULT_TOP_LIMIT,
    max_teams: int = DEFAULT_MAX_TEAMS,
    incremental: bool = True,
    team_concurrency: int = DEFAULT_TEAM_CONCURRENCY,
    download_logos: bool = True,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    existing_pool = load_existing_pool() if incremental else None
    existing_teams = {t["id"]: t for t in load_existing_teams()}
    existing_team_data = (existing_pool or {}).get("teams") or {}

    async with HltvClient() as client:
        print(
            f"Loading HLTV Valve rankings (top {top_limit}, max {max_teams})… "
            f"stats={MATCH_TYPE} / {STATS_MONTHS}mo ({client.stats_start} → {client.stats_end})"
        )
        rankings = await client.get_rankings()
        catalog = [meta_from_hltv_ranking(row) for row in rankings[:max(top_limit, max_teams)]][:max_teams]
        catalog = attach_vrs_to_teams(catalog)

        if incremental and existing_team_data:
            to_fetch = [t for t in catalog if t["id"] not in existing_team_data]
            print(f"Incremental: keep {len(existing_team_data)} teams, fetch {len(to_fetch)} new")
        else:
            to_fetch = catalog
            print(f"Full fetch: {len(to_fetch)} teams (sequential, rate-limit safe)")

        teams_out: dict[str, dict[str, Any]] = dict(existing_team_data) if incremental else {}
        peak_table: list[dict[str, Any]] = []

        async def fetch_one(team: dict[str, Any]) -> None:
            print(f"  [{team.get('rank', '?')}] {team['name']} (HLTV #{team.get('hltvId')})")
            try:
                teams_out[team["id"]] = await fetch_team_pool(client, team)
            except Exception as exc:
                print(f"  FAILED {team['id']}: {exc}")

        for i in range(0, len(to_fetch), team_concurrency):
            chunk = to_fetch[i : i + team_concurrency]
            await asyncio.gather(*[fetch_one(t) for t in chunk])

        for data in teams_out.values():
            peak_table.extend(data.get("historicalPlayers") or [])

        catalog_by_id = {t["id"]: t for t in catalog}
        teams_meta: list[dict[str, Any]] = []
        for tid in teams_out:
            meta = catalog_by_id.get(tid) or existing_teams.get(tid)
            if not meta:
                meta = {
                    "id": tid,
                    "name": tid,
                    "nameCn": short_name(tid),
                    "region": "INT",
                    "color": team_color(tid),
                    "rank": None,
                    "valveRank": None,
                    "vrsPoints": 1100,
                    "logo": f"assets/images/teams/{tid}.webp",
                }
            teams_meta.append(meta)

        teams_meta.sort(key=lambda t: (t.get("rank") is None, t.get("rank") or 999))

        if download_logos:
            print("Checking team logos (keep existing local files)...")
            await download_team_logos(None, teams_meta, LOGO_DIR, skip_existing=True)

        public_meta = [{k: v for k, v in t.items() if k not in ("logoRemote", "hltvSlug")} for t in teams_meta]
        return public_meta, teams_out, peak_table


def fetch_pool_sync(**kwargs: Any) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    return asyncio.run(fetch_all_teams(**kwargs))
