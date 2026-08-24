#!/usr/bin/env python3
"""Build CS2 Perfect Player pool — default: fetch live data from HLTV.org."""
from __future__ import annotations

import argparse
import csv
import json
import hashlib
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "assets" / "data"

TEAMS = [
    {"id": "navi", "name": "Natus Vincere", "nameCn": "NaVi", "region": "EU", "color": "#ffdd00"},
    {"id": "vitality", "name": "Team Vitality", "nameCn": "Vitality", "region": "EU", "color": "#ff5500"},
    {"id": "faze", "name": "FaZe Clan", "nameCn": "FaZe", "region": "EU", "color": "#e10600"},
    {"id": "g2", "name": "G2 Esports", "nameCn": "G2", "region": "EU", "color": "#000000"},
    {"id": "mouz", "name": "MOUZ", "nameCn": "MOUZ", "region": "EU", "color": "#00a651"},
    {"id": "spirit", "name": "Team Spirit", "nameCn": "Spirit", "region": "EU", "color": "#00bfff"},
    {"id": "liquid", "name": "Team Liquid", "nameCn": "Liquid", "region": "NA", "color": "#0066cc"},
    {"id": "heroic", "name": "Heroic", "nameCn": "Heroic", "region": "EU", "color": "#ff0040"},
    {"id": "astralis", "name": "Astralis", "nameCn": "Astralis", "region": "EU", "color": "#ff0000"},
    {"id": "fnatic", "name": "Fnatic", "nameCn": "Fnatic", "region": "EU", "color": "#ff6600"},
    {"id": "complexity", "name": "Complexity", "nameCn": "coL", "region": "NA", "color": "#0066ff"},
    {"id": "vp", "name": "Virtus.pro", "nameCn": "VP", "region": "EU", "color": "#ff6600"},
    {"id": "eternal", "name": "Eternal Fire", "nameCn": "EF", "region": "EU", "color": "#ff4500"},
    {"id": "3dmax", "name": "3DMAX", "nameCn": "3DMAX", "region": "EU", "color": "#003366"},
    {"id": "furia", "name": "FURIA", "nameCn": "FURIA", "region": "SA", "color": "#00ff00"},
    {"id": "big", "name": "BIG", "nameCn": "BIG", "region": "EU", "color": "#ffff00"},
]

ROLES = ["IGL", "AWP", "Entry", "Lurk", "Support"]

ATTR_KEYS = ["AIM", "REFL", "SPRY", "AWPE", "UTLY", "GMSN", "COMM", "CLUT", "ENTR", "LURK", "TEAM", "MENT", "CONS"]

ROLE_ATTR_BIAS = {
    "IGL": {"COMM": 12, "GMSN": 10, "TEAM": 8, "MENT": 6},
    "AWP": {"AWPE": 15, "AIM": 10, "REFL": 8, "CLUT": 6},
    "Entry": {"ENTR": 14, "AIM": 10, "REFL": 8, "SPRY": 6},
    "Lurk": {"LURK": 14, "GMSN": 10, "CLUT": 8, "AIM": 6},
    "Support": {"UTLY": 14, "TEAM": 10, "GMSN": 6, "COMM": 6},
}

CURRENT_ROSTERS = {
    "navi": [("jL", "Entry"), ("iM", "Entry"), ("Aleksib", "IGL"), ("w0nderful", "AWP"), ("b1t", "Lurk"), ("s1mple", "AWP"), ("electronic", "Lurk"), ("Perfecto", "Support"), ("sdy", "Support"), ("npl", "Entry"), ("Boombl4", "IGL"), ("s1n", "Support")],
    "vitality": [("ZywOo", "AWP"), ("apEX", "IGL"), ("mezii", "Support"), ("flameZ", "Entry"), ("ropz", "Lurk"), ("Spinx", "Entry"), ("Magisk", "Support"), ("dupreeh", "Support"), ("shox", "Entry"), ("NBK-", "IGL"), ("misutaaa", "Entry"), ("afro", "AWP")],
    "faze": [("karrigan", "IGL"), ("rain", "Entry"), ("frozen", "Lurk"), ("broky", "AWP"), ("ropz", "Lurk"), ("Twistzz", "Entry"), ("olofmeister", "Support"), ("coldzera", "AWP"), ("Neo", "IGL"), ("GuardiaN", "AWP"), ("rain", "Entry"), ("ropz", "Lurk")],
    "g2": [("NiKo", "Entry"), ("huNter-", "Lurk"), ("m0NESY", "AWP"), ("Snax", "IGL"), ("malbsMd", "Entry"), ("HooXi", "IGL"), ("jks", "Lurk"), ("nexa", "IGL"), ("AmaNEk", "Support"), ("kennyS", "AWP"), ("shox", "Entry"), ("NBK-", "Support")],
    "mouz": [("Brollan", "IGL"), ("torzsi", "AWP"), ("xertioN", "Entry"), ("Jimpphat", "Lurk"), ("siuhy", "IGL"), ("frozen", "Entry"), ("ropz", "Lurk"), ("woxic", "AWP"), ("dexter", "IGL"), ("frozen", "Entry"), ("s1n", "Support"), ("NBK-", "Support")],
    "spirit": [("donk", "Entry"), ("sh1ro", "AWP"), ("chopper", "IGL"), ("magixx", "Support"), ("zont1x", "Lurk"), ("s1ren", "Support"), ("s1n", "Support"), ("Patsi", "Entry"), ("interz", "Support"), ("HObbit", "IGL"), ("Ax1Le", "Entry"), ("nafany", "IGL")],
    "liquid": [("NAF", "Lurk"), ("Twistzz", "Entry"), ("ultimate", "AWP"), ("siuhy", "IGL"), ("jks", "Lurk"), ("EliGE", "Entry"), ("Stewie2K", "IGL"), ("osee", "AWP"), ("nitr0", "IGL"), ("YEKINDAR", "Entry"), ("oSee", "AWP"), ("skullz", "Entry")],
    "heroic": [("device", "AWP"), ("stavn", "Entry"), ("jabbi", "Lurk"), ("sjuush", "Support"), ("TeSeS", "Entry"), ("cadiaN", "IGL"), ("s1n", "Support"), ("refrezh", "Entry"), ("nicoodoz", "AWP"), ("blameF", "Entry"), ("sjuush", "Support"), ("TeSeS", "Entry")],
    "astralis": [("device", "AWP"), ("stavn", "Entry"), ("Magisk", "Support"), ("jabbi", "Lurk"), ("HooXi", "IGL"), ("gla1ve", "IGL"), ("Xyp9x", "Support"), ("dupreeh", "Support"), ("k0nfig", "Entry"), ("blameF", "Entry"), ("Farlig", "AWP"), ("Lucky", "AWP")],
    "fnatic": [("KRIMZ", "Support"), ("mezii", "Entry"), ("MATYS", "Entry"), ("blameF", "IGL"), ("bodyy", "Support"), ("ropz", "Lurk"), ("Brollan", "Entry"), ("REZ", "Entry"), ("JW", "AWP"), ("flusha", "Lurk"), ("olofmeister", "Entry"), ("Golden", "IGL")],
    "complexity": [("Grim", "Entry"), ("floppy", "Support"), ("JT", "IGL"), ("hallzerk", "AWP"), ("EliGE", "Entry"), ("blameF", "Entry"), ("oSee", "AWP"), ("floppy", "Support"), ("junior", "AWP"), ("k0nfig", "Entry"), ("FaNg", "Lurk"), ("RUSH", "Support")],
    "vp": [("Jame", "IGL"), ("FL1T", "Entry"), ("fame", "Entry"), ("n0rb3r7", "Lurk"), ("FL1T", "Entry"), ("qikert", "Support"), ("YEKINDAR", "Entry"), ("Jame", "AWP"), ("Perfecto", "Support"), ("Jame", "IGL"), ("n0rb3r7", "Lurk"), ("fame", "Entry")],
    "eternal": [("XANTARE", "Entry"), ("MAJ3R", "IGL"), ("woxic", "AWP"), ("Calyx", "Support"), ("imoRR", "Entry"), ("paz", "Support"), ("XANTARE", "Entry"), ("woxic", "AWP"), ("Calyx", "Support"), ("MAJ3R", "IGL"), ("imoRR", "Entry"), ("paz", "Support")],
    "3dmax": [("Maka", "AWP"), ("Lucky", "Entry"), ("Graviti", "Support"), ("bodyy", "Support"), ("Djoko", "Entry"), ("Ex3rcice", "IGL"), ("Lucky", "Entry"), ("Maka", "AWP"), ("bodyy", "Support"), ("Djoko", "Entry"), ("Graviti", "Support"), ("Ex3rcice", "IGL")],
    "furia": [("FalleN", "IGL"), ("yuurih", "Entry"), ("KSCERATO", "Lurk"), ("YEKINDAR", "Entry"), ("arT", "IGL"), ("chelo", "Support"), ("saffee", "AWP"), ("drop", "Support"), ("yuurih", "Entry"), ("KSCERATO", "Lurk"), ("FalleN", "AWP"), ("arT", "Entry")],
    "big": [("tabseN", "IGL"), ("s1n", "Support"), ("Krimbo", "Entry"), ("JDC", "Entry"), ("hyp", "Support"), ("XANTARE", "Entry"), ("tiziaN", "Support"), ("Krimbo", "Entry"), ("s1n", "Support"), ("tabseN", "IGL"), ("JDC", "Entry"), ("hyp", "Support")],
}

LEGENDS = {
    "navi": [("s1mple", "AWP"), ("electronic", "Lurk"), ("Boombl4", "IGL"), ("Edward", "Support"), ("Zeus", "IGL")],
    "vitality": [("ZywOo", "AWP"), ("apEX", "IGL"), ("shox", "Entry"), ("NBK-", "IGL"), ("RpK", "Support")],
    "faze": [("karrigan", "IGL"), ("rain", "Entry"), ("coldzera", "AWP"), ("olofmeister", "Entry"), ("GuardiaN", "AWP")],
    "g2": [("NiKo", "Entry"), ("kennyS", "AWP"), ("shox", "Entry"), ("ScreaM", "Entry"), ("Ex6TenZ", "IGL")],
    "mouz": [("ropz", "Lurk"), ("frozen", "Entry"), ("woxic", "AWP"), ("chrisJ", "IGL"), ("suNny", "Support")],
    "spirit": [("sh1ro", "AWP"), ("chopper", "IGL"), ("donk", "Entry"), ("HObbit", "IGL"), ("Ax1Le", "Entry")],
    "liquid": [("EliGE", "Entry"), ("NAF", "Lurk"), ("Twistzz", "Entry"), ("Stewie2K", "IGL"), ("nitr0", "IGL")],
    "heroic": [("cadiaN", "IGL"), ("stavn", "Entry"), ("TeSeS", "Entry"), ("sjuush", "Support"), ("refrezh", "Entry")],
    "astralis": [("device", "AWP"), ("gla1ve", "IGL"), ("Xyp9x", "Support"), ("dupreeh", "Support"), ("Magisk", "Support")],
    "fnatic": [("flusha", "Lurk"), ("JW", "AWP"), ("olofmeister", "Entry"), ("KRIMZ", "Support"), ("Golden", "IGL")],
    "complexity": [("EliGE", "Entry"), ("oSee", "AWP"), ("k0nfig", "Entry"), ("RUSH", "Support"), ("ShahZaM", "IGL")],
    "vp": [("Jame", "IGL"), ("YEKINDAR", "Entry"), ("qikert", "Support"), ("AdreN", "IGL"), ("pasha", "Entry")],
    "eternal": [("XANTARE", "Entry"), ("woxic", "AWP"), ("MAJ3R", "IGL"), ("paz", "Support"), ("Calyx", "Support")],
    "3dmax": [("Maka", "AWP"), ("bodyy", "Support"), ("Ex3rcice", "IGL"), ("Lucky", "Entry"), ("Djoko", "Entry")],
    "furia": [("FalleN", "IGL"), ("KSCERATO", "Lurk"), ("yuurih", "Entry"), ("arT", "IGL"), ("fer", "Entry")],
    "big": [("tabseN", "IGL"), ("XANTARE", "Entry"), ("tiziaN", "Support"), ("gob b", "IGL"), ("nex", "IGL")],
}

HISTORICAL_YEARS = {2020: "2020", 2021: "2021", 2022: "2022", 2023: "2023", 2024: "2024", 2025: "2025", 2026: "2026"}


def slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip()).strip("-").lower()
    return s or "player"


def seed(name: str, team: str, role: str) -> int:
    h = hashlib.md5(f"{name}:{team}:{role}".encode()).hexdigest()
    return int(h[:8], 16)


def gen_attrs(role: str, base: int, peak: bool = False) -> dict[str, int]:
    attrs = {k: clamp(base + (seed(role, k, "x") % 11) - 5) for k in ATTR_KEYS}
    bias = ROLE_ATTR_BIAS.get(role, {})
    for k, bonus in bias.items():
        attrs[k] = clamp(attrs[k] + bonus)
    if peak:
        for k in attrs:
            attrs[k] = clamp(attrs[k] + 4 + seed(role, k, "peak") % 6)
    return attrs


def clamp(v: int, lo: int = 25, hi: int = 99) -> int:
    return max(lo, min(hi, v))


def calc_ovr(attrs: dict[str, int], role: str) -> int:
    weights = {
        "IGL": {"COMM": 0.14, "GMSN": 0.12, "TEAM": 0.10, "MENT": 0.08, "AIM": 0.08, "UTLY": 0.08, "CLUT": 0.08, "CONS": 0.08, "REFL": 0.06, "SPRY": 0.04, "ENTR": 0.04, "LURK": 0.04, "AWPE": 0.06},
        "AWP": {"AWPE": 0.16, "AIM": 0.14, "REFL": 0.10, "CLUT": 0.10, "GMSN": 0.08, "CONS": 0.08, "MENT": 0.06, "TEAM": 0.06, "SPRY": 0.06, "UTLY": 0.04, "ENTR": 0.04, "LURK": 0.04, "COMM": 0.04},
        "Entry": {"ENTR": 0.14, "AIM": 0.14, "REFL": 0.10, "SPRY": 0.08, "CLUT": 0.08, "GMSN": 0.06, "TEAM": 0.06, "CONS": 0.06, "MENT": 0.06, "UTLY": 0.06, "LURK": 0.04, "COMM": 0.04, "AWPE": 0.08},
        "Lurk": {"LURK": 0.14, "GMSN": 0.12, "CLUT": 0.10, "AIM": 0.10, "CONS": 0.08, "MENT": 0.08, "TEAM": 0.06, "REFL": 0.06, "SPRY": 0.06, "UTLY": 0.04, "ENTR": 0.04, "COMM": 0.04, "AWPE": 0.08},
        "Support": {"UTLY": 0.14, "TEAM": 0.12, "GMSN": 0.10, "COMM": 0.08, "MENT": 0.08, "CONS": 0.08, "AIM": 0.06, "REFL": 0.06, "CLUT": 0.06, "SPRY": 0.04, "ENTR": 0.04, "LURK": 0.04, "AWPE": 0.10},
    }
    w = weights.get(role, weights["Entry"])
    total = sum(attrs.get(k, 55) * w.get(k, 0.07) for k in ATTR_KEYS)
    return clamp(int(round(total)))


def make_player(name: str, team_id: str, role: str, kind: str, year: int, peak: bool = False, idx: int = 0) -> dict:
    base = 72 + (seed(name, team_id, str(idx)) % 18)
    if peak:
        base = min(96, base + 12)
    attrs = gen_attrs(role, base, peak)
    ovr = calc_ovr(attrs, role)
    rating = round(0.85 + ovr / 200, 2)
    return {
        "name": name,
        "nameCn": name,
        "teamId": team_id,
        "role": role,
        "rating": rating,
        "ovr": ovr,
        "age": 20 + seed(name, team_id, "age") % 12,
        "attrs": attrs,
        "honors": {"majors": 1 if peak else 0, "mvps": 1 if peak and role == "AWP" else 0, "top20": 3 if peak else 0},
        "source": {"kind": kind, "year": year, "label": str(year), "code": 2026 - year if year <= 2026 else 0},
        "historicalPeak": peak,
        "peakRating": ovr if peak else None,
        "photo": f"assets/images/players/{team_id}/{slug(name)}.svg",
    }


def build_pool() -> dict:
    teams_out = {}
    peak_table = []
    for team in TEAMS:
        tid = team["id"]
        current = []
        seen_names = set()
        roster = CURRENT_ROSTERS.get(tid, [])
        for i, (name, role) in enumerate(roster[:12]):
            if name in seen_names:
                continue
            seen_names.add(name)
            current.append(make_player(name, tid, role, "current", 2026, False, i))
        historical = []
        current_names = {p["name"] for p in current}
        for i, (name, role) in enumerate(LEGENDS.get(tid, [])[:5]):
            if name in current_names:
                continue
            year = 2018 + (seed(name, tid, "hist") % 8)
            p = make_player(name, tid, role, "historical", year, True, i)
            historical.append(p)
            peak_table.append(p)
        teams_out[tid] = {"players": current, "historicalPlayers": historical}
    return teams_out, peak_table


def write_roster_csv(teams_data: dict) -> None:
    path = DATA / "cs2-rosters-2026.csv"
    rows = [["teamId", "name", "role", "ovr", "rating"]]
    for tid, data in teams_data.items():
        for p in data["players"]:
            rows.append([tid, p["name"], p["role"], p["ovr"], p["rating"]])
    with path.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build CS2 player pool JSON")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Use synthetic seed data instead of HLTV fetch",
    )
    parser.add_argument("--top", type=int, default=50, help="Valve ranking top N (default 50)")
    parser.add_argument("--max-teams", type=int, default=60, help="Max teams in pool (default 60)")
    parser.add_argument("--full", action="store_true", help="Re-fetch all teams (disable incremental)")
    parser.add_argument("--team-workers", type=int, default=8, help="Parallel team fetch workers")
    parser.add_argument("--player-workers", type=int, default=20, help="Parallel player stat workers")
    parser.add_argument("--recalibrate-only", action="store_true", help="Recalibrate existing pool JSON without network fetch")
    parser.add_argument("--no-logos", action="store_true", help="Skip team logo download")
    args = parser.parse_args()

    DATA.mkdir(parents=True, exist_ok=True)

    if args.recalibrate_only:
        from recalibrate_pool import recalibrate_pool

        pool_path = DATA / "cs2-player-pool.json"
        pool = json.loads(pool_path.read_text(encoding="utf-8"))
        pool = recalibrate_pool(pool)
        pool_path.write_text(json.dumps(pool, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Recalibrated cs2-player-pool.json")
        return

    if args.offline:
        teams_meta = TEAMS
        teams_data, peak_table = build_pool()
        data_source = "synthetic"
    else:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from fetch_hltv_data import fetch_pool_sync

        print("Fetching player data from HLTV.org (via api.csapi.de)...")
        teams_meta, teams_data, peak_table = fetch_pool_sync(
            top_limit=args.top,
            max_teams=args.max_teams,
            incremental=not args.full,
            team_concurrency=min(args.team_workers, 6),
            download_logos=not args.no_logos,
        )
        data_source = "hltv.org"

    pool = {
        "version": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataSource": data_source,
        "rules": {
            "targetRosterSize": 12,
            "currentTarget": 12,
            "historicalTarget": 5,
            "historicalDrawChance": 0.2,
            "historicalPeakTableRows": len(peak_table),
            "teamCount": len(teams_data),
            "rankingTop": args.top if not args.offline else 16,
            "statsFilter": {
                "provider": "hltv.org",
                "matchType": "BigEvents",
                "months": 12,
                "note": "等同 HLTV 选手页：matchType=BigEvents + 近 12 个月",
            },
        },
        "teams": teams_data,
    }
    (DATA / "cs2-player-pool.json").write_text(json.dumps(pool, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / "cs2-historical-peak-table.json").write_text(
        json.dumps({"version": 1, "rows": peak_table}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (DATA / "cs2-teams.json").write_text(json.dumps({"teams": teams_meta}, ensure_ascii=False, indent=2), encoding="utf-8")
    write_roster_csv(teams_data)
    total = sum(len(v["players"]) + len(v["historicalPlayers"]) for v in teams_data.values())
    print(f"Wrote {total} player records across {len(teams_meta)} teams")


if __name__ == "__main__":
    main()
