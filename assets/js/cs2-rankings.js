(function () {
  'use strict';

  const C = window.CS2;
  if (!C) return;

  function n(v, d) { return C.parseNum(v, d); }

  function initSeasonVrs(season) {
    const vrs = {};
    (C.LEAGUE.teamList || []).forEach(tid => {
      const meta = C.teamMeta(tid);
      vrs[tid] = n(meta.vrsPoints, vrsFromRank(meta.valveRank || meta.rank));
    });
    season.vrs = vrs;
    return vrs;
  }

  function vrsFromRank(rank) {
    const anchors = [
      [1, 1995], [2, 1895], [3, 1853], [4, 1832], [5, 1820],
      [6, 1791], [7, 1763], [8, 1715], [9, 1697], [10, 1670],
      [12, 1598], [15, 1554], [20, 1474], [25, 1400], [30, 1361],
      [35, 1300], [40, 1250], [45, 1200], [50, 1150], [55, 1100], [60, 1050]
    ];
    const r = Math.max(1, n(rank, 60));
    if (r <= anchors[0][0]) return anchors[0][1];
    if (r >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [r0, p0] = anchors[i];
      const [r1, p1] = anchors[i + 1];
      if (r >= r0 && r <= r1) {
        const t = (r - r0) / (r1 - r0);
        return Math.round(p0 + (p1 - p0) * t);
      }
    }
    return 1100;
  }

  function expectedScore(a, b, vrs) {
    return 1 / (1 + Math.pow(10, (n(vrs[b], 1400) - n(vrs[a], 1400)) / 400));
  }

  function applyVrsMatch(season, winner, loser, kFactor) {
    if (!season.vrs || !winner || !loser || winner === loser) return 0;
    const vrs = season.vrs;
    const k = n(kFactor, 20);
    const ea = expectedScore(winner, loser, vrs);
    const delta = Math.round(k * (1 - ea));
    vrs[winner] = n(vrs[winner], 1400) + delta;
    vrs[loser] = Math.max(900, n(vrs[loser], 1400) - Math.round(delta * 0.88));
    season.vrsLog = season.vrsLog || [];
    season.vrsLog.push({ winner, loser, delta, k });
    if (season.vrsLog.length > 120) season.vrsLog.shift();
    return delta;
  }

  function applyEventPlacement(season, teamId, place, eventId) {
    if (!season.vrs || !teamId) return;
    const bonus = {
      champion: eventId === 'major' ? 85 : (eventId === 'playoffs' ? 35 : 22),
      finalist: 18,
      semis: 10,
      quarters: 5
    };
    const b = bonus[place] || 0;
    if (b) season.vrs[teamId] = n(season.vrs[teamId], 1400) + b;
  }

  function sortedTeamVrs(season) {
    const vrs = season.vrs || {};
    return Object.keys(vrs).map(tid => ({
      team: tid,
      vrs: n(vrs[tid], 0),
      meta: C.teamMeta(tid),
      valveRank: C.teamMeta(tid).valveRank || C.teamMeta(tid).rank
    })).sort((a, b) => b.vrs - a.vrs || (a.valveRank || 99) - (b.valveRank || 99));
  }

  function buildPlayerRankings(state) {
    const season = state.season;
    const career = state.career;
    const standings = season.standings || {};
    const list = [];

    list.push({
      key: '__USER__',
      name: career.playerName,
      team: career.teamId,
      role: career.role,
      ovr: n(career.ovr, 75),
      rating: n(season.playerStats && season.playerStats.rating, 0),
      adr: n(season.playerStats && season.playerStats.adr, 0),
      maps: n(season.playerStats && season.playerStats.maps, 0),
      isUser: true,
      score: n(season.playerStats && season.playerStats.rating, 0) * 100 + n(career.ovr, 75) * 0.35
    });

    Object.keys(C.LEAGUE.teams || {}).forEach(tid => {
      const rec = standings[tid] || {};
      const teamVrs = n(season.vrs && season.vrs[tid], 1400);
      (C.LEAGUE.teams[tid].players || []).slice(0, 6).forEach(p => {
        const baseRating = n(p.rating, n(p.ovr, 75) / 100);
        const winPct = (n(rec.wins, 0) + n(rec.losses, 0)) > 0 ? rec.wins / (rec.wins + rec.losses) : 0.5;
        list.push({
          key: `${tid}:${p.name}`,
          name: p.name,
          team: tid,
          role: p.role,
          ovr: n(p.ovr, 75),
          rating: baseRating,
          adr: Math.round(n(p.ovr, 75) * 0.88),
          maps: 0,
          isUser: false,
          score: baseRating * 100 + n(p.ovr, 75) * 0.35 + winPct * 12 + teamVrs * 0.01
        });
      });
    });

    return list.sort((a, b) => b.score - a.score);
  }

  function userTeamVrsRank(season, teamId) {
    const sorted = sortedTeamVrs(season);
    const idx = sorted.findIndex(t => t.team === teamId);
    return idx >= 0 ? idx + 1 : null;
  }

  function userPlayerRank(state) {
    const sorted = buildPlayerRankings(state);
    const idx = sorted.findIndex(p => p.isUser);
    return idx >= 0 ? idx + 1 : null;
  }

  window.CS2_RANKINGS = {
    initSeasonVrs,
    vrsFromRank,
    applyVrsMatch,
    applyEventPlacement,
    sortedTeamVrs,
    buildPlayerRankings,
    userTeamVrsRank,
    userPlayerRank
  };
})();
