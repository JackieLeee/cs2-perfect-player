#!/usr/bin/env python3
"""Fetch CS2 player rosters and stats from BO3.gg API (parallel, ranked teams)."""
from __future__ import annotations

import asyncio
import json
import re
import ssl
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import aiohttp

from build_cs2_player_pool import (
    ROLE_ATTR_BIAS,
    calc_ovr,
    clamp,
    slug,
)
from team_registry import (
    ENSURE_SLUGS,
    download_team_logos,
    merge_team_catalog,
    meta_from_team_payload,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "assets" / "data"
LOGO_DIR = ROOT / "assets" / "images" / "teams"

BO3_BASE = "https://api.bo3.gg/api/v1"
CS2_DISCIPLINE = 1
CURRENT_YEAR = 2026
STATS_DAYS = 180
HISTORICAL_STATS_DAYS = 365

DEFAULT_TOP_LIMIT = 50
DEFAULT_MAX_TEAMS = 60
DEFAULT_TEAM_CONCURRENCY = 8
DEFAULT_PLAYER_CONCURRENCY = 20

ROLE_OVERRIDES: dict[str, str] = {
    "aleksib": "IGL", "apex": "IGL", "apEX": "IGL", "chopper": "IGL", "hooxi": "IGL", "hooXi": "IGL",
    "jt": "IGL", "jame": "IGL", "karrigan": "IGL", "snax": "IGL", "tabsen": "IGL", "tabseN": "IGL",
    "gla1ve": "IGL", "fallen": "IGL", "FalleN": "IGL", "art": "IGL", "arT": "IGL", "maj3r": "IGL",
    "MAJ3R": "IGL", "boombl4": "IGL", "nex": "IGL", "cadiaN": "IGL", "siuhy": "IGL", "brollan": "IGL",
    "Brollan": "IGL", "ex3rcice": "IGL",
    "zywoo": "AWP", "ZywOo": "AWP", "m0nesy": "AWP", "m0NESY": "AWP", "sh1ro": "AWP", "broky": "AWP",
    "w0nderful": "AWP", "torzsi": "AWP", "device": "AWP", "s1mple": "AWP", "osee": "AWP", "oSee": "AWP",
    "hallzerk": "AWP", "maka": "AWP", "Maka": "AWP", "woxic": "AWP", "guardian": "AWP", "GuardiaN": "AWP",
    "kennys": "AWP", "kennyS": "AWP", "ultimate": "AWP",
    "ropz": "Lurk", "rain": "Entry", "frozen": "Entry", "donk": "Entry", "b1t": "Lurk",
    "naf": "Lurk", "NAF": "Lurk", "kscerato": "Lurk", "KSCERATO": "Lurk", "yuurih": "Entry",
    "yekindar": "Entry", "YEKINDAR": "Entry", "flamez": "Entry", "flameZ": "Entry",
    "elige": "Entry", "EliGE": "Entry", "niko": "Entry", "NiKo": "Entry", "im": "Entry", "iM": "Entry",
    "stavn": "Entry", "blamef": "Entry", "blameF": "Entry",
    "magixx": "Support", "mezii": "Support", "perfecto": "Support", "Perfecto": "Support",
    "xyp9x": "Support", "Xyp9x": "Support", "interz": "Support", "sjuush": "Support",
}

BO3_HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "origin": "https://bo3.gg",
    "referer": "https://bo3.gg/",
    "user-agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
}


def _nick_key(name: str) -> str:
    return name.strip().lower()


def infer_role(nickname: str, bo3_role: str, ratings: list[tuple[str, float]]) -> str:
    if nickname in ROLE_OVERRIDES:
        return ROLE_OVERRIDES[nickname]
    key = _nick_key(nickname)
    for k, role in ROLE_OVERRIDES.items():
        if _nick_key(k) == key:
            return role
    if bo3_role:
        mapped = bo3_role.strip().capitalize()
        if mapped in {"IGL", "Awp", "Entry", "Lurk", "Support"}:
            return "AWP" if mapped == "Awp" else mapped
    sorted_ratings = sorted(ratings, key=lambda x: x[1], reverse=True)
    names = [n for n, _ in sorted_ratings]
    idx = next((i for i, (n, _) in enumerate(sorted_ratings) if _nick_key(n) == key), len(names) - 1)
    if idx == 0 and len(names) > 1:
        return "AWP"
    if idx <= 1:
        return "Entry"
    if idx == len(names) - 1:
        return "IGL"
    if idx >= len(names) - 2:
        return "Support"
    return "Lurk"


def calc_age(birthday: str | None) -> int:
    if not birthday:
        return 22
    try:
        born = datetime.strptime(birthday[:10], "%Y-%m-%d").date()
        today = datetime.now(timezone.utc).date()
        return max(16, today.year - born.year - ((today.month, today.day) < (born.month, born.day)))
    except ValueError:
        return 22


def hs_ratio(accuracy: list[dict[str, Any]] | None) -> float:
    if not accuracy:
        return 0.35
    head = sum(r.get("kills_sum", 0) for r in accuracy if r.get("hit_group") == "Head")
    total = sum(r.get("kills_sum", 0) for r in accuracy if r.get("hit_group"))
    return head / total if total else 0.35


def stats_to_attrs(
    general: dict[str, Any] | None,
    accuracy: list[dict[str, Any]] | None,
    bo3_rating: float | None,
    role: str,
    peak: bool = False,
) -> dict[str, int]:
    g = general or {}
    rounds = max(int(g.get("rounds_count") or 0), 1)
    games = int(g.get("games_count") or 0)
    kills = int(g.get("kills_sum") or 0)
    deaths = max(int(g.get("deaths_sum") or 1), 1)
    assists = int(g.get("assists_sum") or 0)
    damage = int(g.get("damage_sum") or 0)
    won = int(g.get("rounds_won_count") or 0)

    kpr = kills / rounds
    adr = damage / rounds
    kd = kills / deaths
    apr = assists / rounds
    win_rate = won / rounds
    hs = hs_ratio(accuracy)
    rating = bo3_rating if bo3_rating is not None else (5.5 if games == 0 else 5.2 + kd * 0.8)

    # BO3 six_month_avg_rating ~5.0 (二线) / ~6.0 (一线) / ~6.5–7.1 (顶尖)
    base = clamp(int(22 + rating * 10))
    attrs = {
        "AIM": clamp(int(base + (kpr - 0.72) * 22 + (hs - 0.42) * 15)),
        "REFL": clamp(int(base + (kd - 1.0) * 14 + (hs - 0.42) * 12)),
        "SPRY": clamp(int(base + (kpr - 0.72) * 16 + win_rate * 8)),
        "AWPE": clamp(int(base + (kpr - 0.72) * 24 + (adr - 78) * 0.10)),
        "UTLY": clamp(int(base + (adr - 78) * 0.22 + apr * 14)),
        "GMSN": clamp(int(base + win_rate * 12 + (kd - 1) * 8)),
        "COMM": clamp(int(base + apr * 28 + win_rate * 6)),
        "CLUT": clamp(int(base + kd * 8 + win_rate * 8)),
        "ENTR": clamp(int(base + (kpr - 0.72) * 26 + (kd - 1) * 10)),
        "LURK": clamp(int(base + (apr - 0.15) * 14 + (kd - 1) * 12)),
        "TEAM": clamp(int(base + win_rate * 16 + apr * 12)),
        "MENT": clamp(int(base + win_rate * 14 + (rating - 5.5) * 3)),
        "CONS": clamp(int(base + win_rate * 14 + (1 - abs(kd - 1.05)) * 10)),
    }
    for k, bonus in ROLE_ATTR_BIAS.get(role, {}).items():
        attrs[k] = clamp(attrs[k] + bonus // 2)
    if peak:
        for k in attrs:
            attrs[k] = clamp(attrs[k] + 3)
    return attrs


class Bo3Client:
    def __init__(self, team_concurrency: int, player_concurrency: int) -> None:
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        self._session: aiohttp.ClientSession | None = None
        self._connector = aiohttp.TCPConnector(ssl=ssl_ctx, limit=64)
        self._team_sem = asyncio.Semaphore(team_concurrency)
        self._player_sem = asyncio.Semaphore(player_concurrency)
        self._req_sem = asyncio.Semaphore(24)

    async def __aenter__(self) -> Bo3Client:
        self._session = aiohttp.ClientSession(headers=BO3_HEADERS, connector=self._connector)
        return self

    async def __aexit__(self, *args: Any) -> None:
        if self._session:
            await self._session.close()

    async def get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        assert self._session
        url = f"{BO3_BASE}{path}"
        async with self._req_sem:
            async with self._session.get(url, params=params or {}) as resp:
                resp.raise_for_status()
                return await resp.json()

    async def download_bytes(self, url: str) -> bytes:
        assert self._session
        async with self._req_sem:
            async with self._session.get(url) as resp:
                resp.raise_for_status()
                return await resp.read()

    async def get_ranked_teams(self, limit: int) -> list[dict[str, Any]]:
        data = await self.get_json(
            "/filters/teams",
            {
                "page[offset]": "0",
                "page[limit]": str(limit),
                "filter[teams.discipline_id][eq]": "1",
                "sort": "rank",
            },
        )
        return data.get("results") or []

    async def get_team(self, slug: str) -> dict[str, Any]:
        async with self._team_sem:
            return await self.get_json(f"/teams/{slug}", {"prefer_locale": "en"})

    async def get_player(self, slug: str) -> dict[str, Any]:
        async with self._player_sem:
            return await self.get_json(f"/players/{slug}", {"prefer_locale": "en"})

    async def get_player_stats(self, slug: str, days: int) -> tuple[dict[str, Any] | None, list[dict[str, Any]] | None]:
        today = datetime.now().strftime("%Y-%m-%d")
        from_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        general_params = {"filter[start_date_to]": today, "filter[start_date_from]": from_date}
        acc_params = {"filter[begin_at_to]": today, "filter[begin_at_from]": from_date}
        async with self._player_sem:
            try:
                general, accuracy = await asyncio.gather(
                    self.get_json(f"/players/{slug}/general_stats", general_params),
                    self.get_json(f"/players/{slug}/accuracy_stats", acc_params),
                )
            except Exception:
                return None, None
        if general is None:
            general = {}
        return general, accuracy if isinstance(accuracy, list) else None

    async def get_team_transfers(self, bo3_team_id: int, limit: int = 40) -> list[dict[str, Any]]:
        async with self._team_sem:
            data = await self.get_json(
                "/player_transfers",
                {
                    "join": "teams_deep",
                    "page[offset]": "0",
                    "page[limit]": str(limit),
                    "sort": "-action_date",
                    "filter[team_to.id,team_from.id][or]": f"{bo3_team_id},{bo3_team_id}",
                    "filter[is_coach][eq]": "false",
                    "with": "teams,player",
                },
            )
        return data.get("results", []) if isinstance(data, dict) else []


async def build_team_catalog(client: Bo3Client, top_limit: int, max_teams: int) -> list[dict[str, Any]]:
    ranked = await client.get_ranked_teams(max(top_limit, max_teams))
    extras: list[dict[str, Any]] = []
    ranked_slugs = {r["slug"] for r in ranked}
    for slug_name in ENSURE_SLUGS:
        if slug_name in ranked_slugs:
            continue
        try:
            payload = await client.get_team(slug_name)
            extras.append({
                "slug": payload.get("slug") or slug_name,
                "name": payload.get("name") or slug_name,
                "rank": payload.get("rank") or top_limit + 5,
                "id": payload.get("id"),
                "country_id": payload.get("country_id"),
                "image_url": payload.get("image_url"),
                "icon_url": payload.get("icon_url"),
            })
        except Exception as exc:
            print(f"  ensure team skip {slug_name}: {exc}")
    return merge_team_catalog(ranked, extras, max_teams)


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


def active_cs2_players(team_payload: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for p in team_payload.get("players") or []:
        if p.get("discipline_id") != CS2_DISCIPLINE:
            continue
        if p.get("is_coach"):
            continue
        if p.get("status") not in (None, 1):
            continue
        out.append(p)
    return out


def collect_former_player_refs(team_payload: dict[str, Any], transfers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: dict[str, dict[str, Any]] = {}
    for row in team_payload.get("from_transfers") or []:
        if row.get("is_coach") or row.get("discipline_id") not in (None, CS2_DISCIPLINE):
            continue
        name = row.get("player_name")
        if not name:
            continue
        refs[_nick_key(name)] = {"nickname": name, "slug": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")}

    for row in transfers:
        if row.get("discipline_id") not in (None, CS2_DISCIPLINE):
            continue
        player = row.get("player") or {}
        if player.get("is_coach"):
            continue
        nick = player.get("nickname") or row.get("player_name")
        if not nick:
            continue
        refs[_nick_key(nick)] = {"nickname": nick, "slug": player.get("slug") or slug(nick), "player": player}

    return list(refs.values())


async def build_player_record(
    client: Bo3Client,
    team_id: str,
    raw: dict[str, Any],
    role: str,
    kind: str,
    year: int,
    peak: bool,
    days: int,
) -> dict[str, Any]:
    nick = raw.get("nickname") or raw.get("player_name") or "Unknown"
    pslug = raw.get("slug") or slug(nick)
    rating_val = raw.get("six_month_avg_rating")
    birthday = raw.get("birthday")
    image = raw.get("image_url")

    general, accuracy = await client.get_player_stats(pslug, days)
    games = int((general or {}).get("games_count") or 0)
    if kind == "current" and not rating_val and games == 0:
        try:
            detail = await client.get_player(pslug)
            rating_val = detail.get("six_month_avg_rating")
            birthday = birthday or detail.get("birthday")
            image = image or detail.get("image_url")
        except Exception:
            pass
    attrs = stats_to_attrs(general, accuracy, rating_val, role, peak)
    ovr = calc_ovr(attrs, role)

    return {
        "name": nick,
        "nameCn": nick,
        "teamId": team_id,
        "role": role,
        "rating": round(max(0.78, min(1.32, (rating_val or 5.5) / 5.35)), 2),
        "ovr": ovr,
        "age": calc_age(birthday),
        "attrs": attrs,
        "honors": {
            "majors": 1 if peak else 0,
            "mvps": 1 if peak and role == "AWP" else 0,
            "top20": 3 if peak else 0,
        },
        "source": {
            "kind": kind,
            "year": year,
            "label": str(year),
            "code": CURRENT_YEAR - year if year <= CURRENT_YEAR else 0,
            "provider": "bo3.gg",
            "playerSlug": pslug,
            "gamesSampled": games,
            "bo3Rating": round(rating_val, 3) if rating_val is not None else None,
        },
        "historicalPeak": peak,
        "peakRating": ovr if peak else None,
        "photo": image or f"assets/images/players/{team_id}/{slug(nick)}.svg",
    }


async def build_players_batch(
    client: Bo3Client,
    team_id: str,
    refs: list[tuple[dict[str, Any], str, str, int, bool, int]],
) -> list[dict[str, Any]]:
    async def one(item: tuple[dict[str, Any], str, str, int, bool, int]) -> dict[str, Any]:
        raw, role, kind, year, peak, days = item
        return await build_player_record(client, team_id, raw, role, kind, year, peak, days)

    return list(await asyncio.gather(*[one(x) for x in refs]))


async def fetch_team_pool(client: Bo3Client, team_id: str, bo3_slug: str) -> dict[str, Any]:
    team_payload = await client.get_team(bo3_slug)
    bo3_id = int(team_payload["id"])
    transfers = await client.get_team_transfers(bo3_id)

    active = active_cs2_players(team_payload)
    if not active:
        seen: set[str] = set()
        for row in transfers:
            player = row.get("player") or {}
            if row.get("team_from_id") != bo3_id and row.get("team_to_id") != bo3_id:
                continue
            if player.get("discipline_id") not in (None, CS2_DISCIPLINE) or player.get("is_coach"):
                continue
            nick = player.get("nickname")
            if not nick or _nick_key(nick) in seen:
                continue
            seen.add(_nick_key(nick))
            active.append(player)
            if len(active) >= 8:
                break

    former_refs = collect_former_player_refs(team_payload, transfers)
    active_names = {_nick_key(p.get("nickname", "")) for p in active}

    ratings: list[tuple[str, float]] = [
        (p.get("nickname", ""), float(p.get("six_month_avg_rating") or 5.0)) for p in active
    ]

    current_refs: list[tuple[dict[str, Any], str, str, int, bool, int]] = []
    seen_current: set[str] = set()
    for p in active:
        nick = p.get("nickname")
        if not nick or _nick_key(nick) in seen_current:
            continue
        seen_current.add(_nick_key(nick))
        role = infer_role(nick, p.get("role") or "", ratings)
        current_refs.append((p, role, "current", CURRENT_YEAR, False, STATS_DAYS))
        if len(current_refs) >= 12:
            break

    if len(current_refs) < 12:
        for ref in former_refs:
            nick = ref["nickname"]
            if _nick_key(nick) in seen_current:
                continue
            seen_current.add(_nick_key(nick))
            role = infer_role(nick, "", ratings)
            current_refs.append((ref, role, "current", CURRENT_YEAR, False, STATS_DAYS))
            if len(current_refs) >= 12:
                break

    current = await build_players_batch(client, team_id, current_refs)

    hist_refs: list[tuple[dict[str, Any], str, str, int, bool, int]] = []
    candidates = [r for r in former_refs if _nick_key(r["nickname"]) not in active_names]
    scored = sorted(
        ((float((r.get("player") or {}).get("total_prize") or 0), r) for r in candidates),
        key=lambda x: x[0],
        reverse=True,
    )
    seen_hist: set[str] = set()
    for _, ref in scored:
        nick = ref["nickname"]
        if _nick_key(nick) in seen_hist or _nick_key(nick) in seen_current:
            continue
        seen_hist.add(_nick_key(nick))
        role = infer_role(nick, "", ratings)
        year = CURRENT_YEAR - 3 - (len(hist_refs) % 5)
        hist_refs.append((ref, role, "historical", year, True, HISTORICAL_STATS_DAYS))
        if len(hist_refs) >= 5:
            break

    historical = await build_players_batch(client, team_id, hist_refs) if hist_refs else []
    return {"players": current, "historicalPlayers": historical, "_teamPayload": team_payload}


async def fetch_all_teams(
    top_limit: int = DEFAULT_TOP_LIMIT,
    max_teams: int = DEFAULT_MAX_TEAMS,
    incremental: bool = True,
    team_concurrency: int = DEFAULT_TEAM_CONCURRENCY,
    player_concurrency: int = DEFAULT_PLAYER_CONCURRENCY,
    download_logos: bool = True,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    existing_pool = load_existing_pool() if incremental else None
    existing_teams = {t["id"]: t for t in load_existing_teams()}
    existing_team_data = (existing_pool or {}).get("teams") or {}

    async with Bo3Client(team_concurrency, player_concurrency) as client:
        print(f"Loading BO3.gg ranked teams (top {top_limit}, max {max_teams})...")
        catalog = await build_team_catalog(client, top_limit, max_teams)

        if incremental and existing_team_data:
            to_fetch = [t for t in catalog if t["id"] not in existing_team_data]
            print(f"Incremental: keep {len(existing_team_data)} teams, fetch {len(to_fetch)} new")
        else:
            to_fetch = catalog
            print(f"Full fetch: {len(to_fetch)} teams")

        teams_out: dict[str, dict[str, Any]] = dict(existing_team_data)
        peak_table: list[dict[str, Any]] = []

        async def fetch_one(team: dict[str, Any]) -> None:
            tid = team["id"]
            bo3_slug = team["bo3Slug"]
            print(f"  [{team.get('rank', '?')}] {team['name']} ({bo3_slug})")
            try:
                data = await fetch_team_pool(client, tid, bo3_slug)
                payload = data.pop("_teamPayload", None)
                if payload:
                    enriched = meta_from_team_payload(payload)
                    for k in ("logoRemote", "rank", "bo3Id", "vrsPoints", "valveRank", "vrsSource"):
                        if enriched.get(k):
                            team[k] = enriched[k]
                teams_out[tid] = data
            except Exception as exc:
                print(f"  FAILED {tid}: {exc}")

        for i in range(0, len(to_fetch), team_concurrency):
            chunk = to_fetch[i:i + team_concurrency]
            await asyncio.gather(*[fetch_one(t) for t in chunk])

        for tid, data in teams_out.items():
            peak_table.extend(data.get("historicalPlayers") or [])

        teams_meta: list[dict[str, Any]] = []
        catalog_by_id = {t["id"]: t for t in catalog}
        for tid in teams_out:
            meta = catalog_by_id.get(tid) or existing_teams.get(tid)
            if not meta:
                meta = {"id": tid, "name": tid, "nameCn": tid, "region": "INT", "color": "#555", "bo3Slug": tid}
            teams_meta.append(meta)

        teams_meta.sort(key=lambda t: (t.get("rank") is None, t.get("rank") or 999))

        if download_logos:
            print("Downloading team logos...")
            await download_team_logos(client, teams_meta, LOGO_DIR, skip_existing=True)

        public_meta = []
        for t in teams_meta:
            row = {k: v for k, v in t.items() if k not in ("logoRemote", "bo3Slug", "bo3Id")}
            public_meta.append(row)

        return public_meta, teams_out, peak_table


def fetch_pool_sync(**kwargs: Any) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    return asyncio.run(fetch_all_teams(**kwargs))
