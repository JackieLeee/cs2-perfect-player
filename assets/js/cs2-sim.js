(function () {
  'use strict';

  const C = window.CS2;
  if (!C) throw new Error('cs2-core.js required');

  function parseNum(v, d) { return C.parseNum(v, d); }
  function clamp(v, a, b) { return C.clamp(v, a, b); }
  function rng(a, b) { return C.rng(a, b); }
  function pick(arr) { return C.pick(arr); }
  function shuffle(arr) { return C.shuffle(arr); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function unique(arr) { return [...new Set(arr)]; }

  /** Team power on OVR 0–99 scale; injects user into starting five when on that team. */
  function teamStrength(teamId, career) {
    const team = C.LEAGUE.teams[teamId];
    if (!team || !team.players.length) return 72;
    const roster = team.players.slice().sort((a, b) => parseNum(b.rating, 70) - parseNum(a.rating, 70));
    const top = roster.slice(0, 5).map(p => ({ rating: parseNum(p.rating, parseNum(p.ovr, 70)) }));
    if (career && teamId === career.teamId) {
      const userOvr = parseNum(career.ovr, 75);
      if (top.length >= 5) top[4].rating = userOvr;
      else top.push({ rating: userOvr });
    }
    return top.reduce((s, p) => s + p.rating, 0) / top.length;
  }

  /** Star carry bonus when user OVR exceeds team baseline. */
  function userCarryBonus(career, teamId) {
    if (!career || career.teamId !== teamId) return 0;
    const base = teamStrength(teamId, null);
    const gap = parseNum(career.ovr, 75) - base;
    return gap > 0 ? gap * 0.55 : 0;
  }

  function playerMatchRating(career) {
    const a = career.attrs10 || C.thirteenToMatch(career.attrs13 || {});
    const role = career.role || 'Entry';
    let base = (a.aim * 0.18 + a.reaction * 0.12 + a.gamesense * 0.12 + a.consistency * 0.10 +
      a.clutch * 0.10 + a.teamwork * 0.08 + a.mental * 0.08 + a.entry * 0.08 + a.lurk * 0.06 + a.utility * 0.08) / 100;
    if (role === 'AWP') base += (a.awp || 55) * 0.002;
    if (role === 'IGL') base += (a.gamesense || 55) * 0.001 + (career.profile && career.profile.coachTrust || 50) * 0.0005;
    const morale = parseNum(career.profile && career.profile.morale, 50);
    const stamina = parseNum(career.currentStamina, 100);
    const age = parseNum(career.age, 20);
    const ageMod = age <= 24 ? 1.03 : age >= 34 ? 0.94 : age >= 30 ? 0.98 : 1;
    base *= ageMod * (0.85 + morale / 500 + stamina / 500);
    const variance = parseNum(career.seasonMods && career.seasonMods.formVariance, 0);
    base *= 0.92 + Math.random() * (0.16 + variance * 0.02);
    return Math.max(0.45, Math.min(2.0, base * 1.35));
  }

  function simMap(teamA, teamB, userTeam, career, isUserA) {
    const careerA = (isUserA || userTeam === teamA) ? career : null;
    const careerB = (!isUserA && userTeam === teamB) ? career : null;
    let strA = teamStrength(teamA, careerA);
    let strB = teamStrength(teamB, careerB);
    if (userTeam === teamA) strA += userCarryBonus(career, teamA);
    if (userTeam === teamB) strB += userCarryBonus(career, teamB);
    const total = Math.max(strA + strB, 1);
    const probA = strA / total;
    const jitter = (Math.random() - 0.5) * 0.10;
    const roll = clamp(probA + jitter, 0.08, 0.92);
    const winA = Math.random() < roll;
    const roundsW = winA ? rng(13, 16) : rng(8, 12);
    const roundsL = winA ? rng(6, Math.min(11, roundsW - 2)) : rng(13, 16);
    const map = pick(C.MAP_POOL);
    const userWin = (isUserA && winA) || (!isUserA && !winA);
    const rating = playerMatchRating(career);
    const perf = clamp(rating / 1.25, 0.75, 1.35);
    const kills = clamp(Math.round(14 + rating * 8 * perf + rng(-3, 5)), 5, 42);
    const deaths = clamp(Math.round(14 - rating * 2 + rng(-2, 4)), 4, 28);
    const assists = clamp(Math.round(3 + rating * 2 + rng(0, 4)), 0, 12);
    const adr = Math.round(55 + rating * 35 * perf + rng(-8, 8));
    const clutches = rating > 1.15 && Math.random() < 0.35 ? rng(1, 2) : (Math.random() < 0.15 ? 1 : 0);
    return {
      map, scoreA: winA ? roundsW : roundsL, scoreB: winA ? roundsL : roundsW,
      win: userWin, kills, deaths, assists, adr, rating: round2(rating), clutches,
      roundDiff: (winA ? roundsW - roundsL : roundsL - roundsW) * (userWin ? 1 : -1)
    };
  }

  function simBO1(teamA, teamB, userTeam, career) {
    const isUserA = userTeam === teamA;
    const m = simMap(teamA, teamB, userTeam, career, isUserA);
    return {
      format: 'BO1', opponent: isUserA ? teamB : teamA, win: m.win,
      maps: [m], kills: m.kills, deaths: m.deaths, assists: m.assists,
      adr: m.adr, rating: m.rating, clutches: m.clutches, roundDiff: m.roundDiff
    };
  }

  function simBO3(teamA, teamB, userTeam, career) {
    const isUserA = userTeam === teamA;
    const maps = [];
    let winsA = 0, winsB = 0;
    let tk = 0, td = 0, ta = 0, tadr = 0, tr = 0, tc = 0;
    while (winsA < 2 && winsB < 2) {
      const m = simMap(teamA, teamB, userTeam, career, isUserA);
      maps.push(m);
      if (m.scoreA > m.scoreB) winsA++; else winsB++;
      tk += m.kills; td += m.deaths; ta += m.assists; tadr += m.adr; tr += m.rating; tc += m.clutches;
    }
    const userWin = (isUserA && winsA > winsB) || (!isUserA && winsB > winsA);
    return {
      format: 'BO3', opponent: isUserA ? teamB : teamA, win: userWin,
      series: `${Math.max(winsA, winsB)}-${Math.min(winsA, winsB)}`,
      maps, kills: tk, deaths: td, assists: ta,
      adr: Math.round(tadr / maps.length), rating: round2(tr / maps.length), clutches: tc,
      roundDiff: maps.reduce((s, m) => s + m.roundDiff, 0)
    };
  }

  function buildSchedule(teamId, allTeams) {
    const others = allTeams.filter(t => t !== teamId);
    const shuffled = shuffle(others);
    const schedule = shuffled.slice(0, 15).map(opp => ({ opponent: opp, type: 'league' }));
    const derbies = shuffle(others).slice(0, 3).map(opp => ({ opponent: opp, type: 'derby' }));
    return schedule.concat(derbies);
  }

  function initSeason(career) {
    const teamId = career.teamId;
    const allTeams = C.LEAGUE.teamList.slice();
    const schedule = buildSchedule(teamId, allTeams);
    const standings = {};
    allTeams.forEach(t => { standings[t] = { wins: 0, losses: 0, roundDiff: 0, points: 0 }; });
    return {
      phase: 'league',
      year: parseNum(career.currentYear, 2026),
      games: [],
      schedule,
      wins: 0,
      losses: 0,
      roundDiff: 0,
      standings,
      playerStats: C.emptyStats(),
      eventStats: {},
      matchLog: [],
      vrs: null,
      vrsLog: [],
      playoffState: null,
      majorState: null,
      eventCalendar: null,
      currentEventIdx: -1,
      awards: [],
      eventLog: { count: 0, lastGame: -99, recent: [] }
    };
  }

  const EVENT_TEMPLATES = [
    { id: 'playoffs', label: '联赛季后赛', emoji: '🏆', type: 'playoffs', teams: 8 },
    { id: 'iem_kato', label: 'IEM Katowice', emoji: '🌍', type: 'swiss', teams: 16 },
    { id: 'blast_spring', label: 'BLAST Premier Spring', emoji: '💥', type: 'elim8', teams: 8 },
    { id: 'epl', label: 'ESL Pro League S49', emoji: '📡', type: 'swiss', teams: 16 },
    { id: 'iem_cologne', label: 'IEM Cologne', emoji: '🏟️', type: 'swiss', teams: 16 },
    { id: 'major', label: 'Major 锦标赛', emoji: '👑', type: 'major', teams: 16 },
    { id: 'blast_final', label: 'BLAST World Final', emoji: '🎯', type: 'elim8', teams: 8 },
  ];

  function inviteTeams(standings, count, userTeam, seedKey) {
    const sorted = sortedStandings(standings).map(r => r.team);
    const top = sorted.slice(0, Math.min(count, sorted.length));
    const pool = C.LEAGUE.teamList.filter(t => !top.includes(t));
    const shuffled = shuffle(pool);
    while (top.length < count && shuffled.length) top.push(shuffled.shift());
    if (userTeam && !top.includes(userTeam)) {
      top[top.length - 1] = userTeam;
    }
    return unique(top).slice(0, count);
  }

  function initSwissEvent(teams, userTeam) {
    return {
      phase: 'swiss', teams: teams.slice(),
      swiss: teams.map(t => ({ team: t, wins: 0, losses: 0, eliminated: false, qualified: false })),
      swissDay: 0, maxSwissDays: 8,
      bracket: [], round: 'QF', complete: false, champion: null, userTeam
    };
  }

  function initElim8(teams, userTeam) {
    const t = teams.slice(0, 8);
    while (t.length < 8) {
      const rest = C.LEAGUE.teamList.filter(x => !t.includes(x));
      if (!rest.length) break;
      t.push(rest[0]);
    }
    const bracket = [];
    for (let i = 0; i < 4; i++) {
      bracket.push({ round: 'QF', teamA: t[i], teamB: t[7 - i], winner: null, games: null });
    }
    return { phase: 'elim', round: 'QF', bracket, complete: false, champion: null, userTeam };
  }

  function advanceElimBracket(state, userTeam, career, ctx) {
    const pending = state.bracket.filter(m => !m.winner);
    pending.forEach(match => {
      const g = simBO3(match.teamA, match.teamB, userTeam, career);
      match.games = g;
      match.winner = resolveMatchWinner(match.teamA, match.teamB, userTeam, career, g);
      if (ctx && ctx.season) afterSimulatedMatch(ctx.season, userTeam, match, g, ctx);
    });
    if (state.round === 'QF') {
      const winners = state.bracket.map(m => m.winner);
      state.bracket = [
        { round: 'SF', teamA: winners[0], teamB: winners[3], winner: null, games: null },
        { round: 'SF', teamA: winners[1], teamB: winners[2], winner: null, games: null }
      ];
      state.round = 'SF';
    } else if (state.round === 'SF') {
      const winners = state.bracket.map(m => m.winner);
      state.bracket = [{ round: 'F', teamA: winners[0], teamB: winners[1], winner: null, games: null }];
      state.round = 'F';
    } else {
      state.complete = true;
      state.champion = state.bracket[0].winner;
    }
  }

  function initEventCalendar(season, userTeam) {
    const standings = season.standings || {};
    season.eventCalendar = EVENT_TEMPLATES.map((tpl, idx) => ({
      ...tpl,
      status: idx === 0 ? 'active' : 'pending',
      state: null,
      champion: null,
      userPlaced: null
    }));
    season.currentEventIdx = 0;
    season.phase = 'events';
    activateEventState(season, userTeam);
    return season.eventCalendar;
  }

  function activateEventState(season, userTeam) {
    const ev = season.eventCalendar && season.eventCalendar[season.currentEventIdx];
    if (!ev || ev.state) return ev;
    const standings = season.standings || {};
    if (ev.type === 'playoffs') {
      ev.state = initPlayoffs(standings);
      season.playoffState = ev.state;
    } else if (ev.type === 'swiss') {
      const teams = inviteTeams(standings, ev.teams, userTeam, ev.id);
      ev.state = initSwissEvent(teams, userTeam);
    } else if (ev.type === 'elim8') {
      const teams = inviteTeams(standings, ev.teams, userTeam, ev.id);
      ev.state = initElim8(teams, userTeam);
    } else if (ev.type === 'major') {
      const po = season.eventCalendar.find(e => e.id === 'playoffs');
      ev.state = initMajor(standings, po && po.state, userTeam);
      season.majorState = ev.state;
    }
    ev.status = 'active';
    return ev;
  }

  function getActiveEvent(season) {
    if (!season.eventCalendar || season.currentEventIdx < 0) return null;
    return season.eventCalendar[season.currentEventIdx] || null;
  }

  function userEventPlacement(ev, userTeam) {
    const st = ev.state;
    if (!st) return '—';
    if (st.champion === userTeam) return '冠军';
    if (st.complete && st.champion) return '参赛';
    if (st.phase === 'swiss' || st.swiss) {
      const row = (st.swiss || []).find(t => t.team === userTeam);
      if (row && row.qualified) return '八强';
      if (row && row.eliminated) return '小组赛出局';
    }
    if (st.bracket) {
      const inBracket = st.bracket.some(m => m.teamA === userTeam || m.teamB === userTeam);
      if (inBracket && !st.complete) return '进行中';
    }
    return '—';
  }

  function eventCtx(season, ev) {
    const k = ev.id === 'major' ? 32 : (ev.type === 'playoffs' ? 24 : 20);
    return { season, eventId: ev.id, label: ev.label, kFactor: k };
  }

  function finalizeEvent(ev, userTeam, season) {
    const st = ev.state;
    if (!st) return;
    ev.champion = st.champion || null;
    ev.userPlaced = userEventPlacement(ev, userTeam);
    ev.status = 'complete';
    const R = window.CS2_RANKINGS;
    if (R && season && season.vrs && ev.champion) {
      R.applyEventPlacement(season, ev.champion, 'champion', ev.id);
    }
  }

  function advanceToNextEvent(season, userTeam) {
    const cur = getActiveEvent(season);
    if (cur && cur.status !== 'complete') finalizeEvent(cur, userTeam, season);
    season.currentEventIdx++;
    if (season.currentEventIdx >= (season.eventCalendar || []).length) {
      season.phase = 'complete';
      return null;
    }
    const next = season.eventCalendar[season.currentEventIdx];
    next.status = 'active';
    activateEventState(season, userTeam);
    return next;
  }

  /** One simulation step for the active calendar event. */
  function simEventStep(season, userTeam, career) {
    const ev = getActiveEvent(season);
    if (!ev || ev.status === 'complete') return { done: true, message: '无进行中赛事' };
    activateEventState(season, userTeam);
    const st = ev.state;
    const ctx = eventCtx(season, ev);
    if (ev.type === 'playoffs') {
      if (st.complete) { finalizeEvent(ev, userTeam, season); return { done: true, message: `${ev.label} 已结束` }; }
      advancePlayoffBracket(st, userTeam, career, ctx);
      if (st.complete) finalizeEvent(ev, userTeam, season);
      return { done: st.complete, message: st.complete ? `${ev.label} 冠军：${st.champion}` : `模拟 ${st.round}` };
    }
    if (ev.type === 'swiss') {
      if (st.complete) { finalizeEvent(ev, userTeam, season); return { done: true, message: `${ev.label} 已结束` }; }
      if (st.phase === 'swiss') {
        simSwissDay(st, userTeam, career, ctx);
        if (st.phase !== 'swiss') st.round = 'QF';
      } else {
        advanceMajorBracket(st, userTeam, career, ctx);
      }
      if (st.complete) finalizeEvent(ev, userTeam, season);
      return { done: st.complete, message: st.complete ? `${ev.label} 冠军：${st.champion}` : (st.phase === 'swiss' ? 'Swiss 一轮' : `模拟 ${st.round}`) };
    }
    if (ev.type === 'elim8') {
      if (st.complete) { finalizeEvent(ev, userTeam, season); return { done: true, message: `${ev.label} 已结束` }; }
      advanceElimBracket(st, userTeam, career, ctx);
      if (st.complete) finalizeEvent(ev, userTeam, season);
      return { done: st.complete, message: st.complete ? `${ev.label} 冠军：${st.champion}` : `模拟 ${st.round}` };
    }
    if (ev.type === 'major') {
      if (st.complete) { finalizeEvent(ev, userTeam, season); return { done: true, message: `${ev.label} 已结束` }; }
      if (st.phase === 'major') simSwissDay(st, userTeam, career, ctx);
      else advanceMajorBracket(st, userTeam, career, ctx);
      if (st.complete) finalizeEvent(ev, userTeam, season);
      return { done: st.complete, message: st.complete ? `${ev.label} 冠军：${st.champion}` : (st.phase === 'major' ? 'Major Swiss 一轮' : `Major ${st.round}`) };
    }
    return { done: false, message: '未知赛事' };
  }

  function simEventComplete(season, userTeam, career) {
    let guard = 0;
    while (guard++ < 80 && season.phase === 'events') {
      const ev = getActiveEvent(season);
      if (!ev) break;
      if (ev.status === 'complete') {
        advanceToNextEvent(season, userTeam);
        if (season.phase === 'complete') break;
        continue;
      }
      simEventStep(season, userTeam, career);
      if (ev.status === 'complete') {
        advanceToNextEvent(season, userTeam);
      }
    }
    return season.phase === 'complete';
  }

  function simAllRemainingEvents(season, userTeam, career) {
    while (season.phase === 'events') {
      simEventComplete(season, userTeam, career);
      if (season.phase === 'complete') break;
      const ev = getActiveEvent(season);
      if (!ev) break;
      if (ev.status !== 'complete') break;
    }
    return season.phase === 'complete';
  }

  function isSeasonEventsComplete(season) {
    return season.phase === 'complete' ||
      (season.eventCalendar && season.eventCalendar.every(e => e.status === 'complete'));
  }

  function migrateSeasonEvents(season, userTeam) {
    if (season.eventCalendar) return season;
    if (season.phase === 'league' || !season.phase) return season;
    season.eventCalendar = EVENT_TEMPLATES.map((tpl, idx) => ({
      ...tpl, status: 'pending', state: null, champion: null, userPlaced: null
    }));
    season.currentEventIdx = 0;
    if (season.playoffState) {
      const po = season.eventCalendar[0];
      po.state = season.playoffState;
      po.status = season.playoffState.complete ? 'complete' : 'active';
      po.champion = season.playoffState.champion || null;
      if (season.playoffState.complete) season.currentEventIdx = 1;
    }
    if (season.majorState) {
      const mj = season.eventCalendar.find(e => e.id === 'major');
      if (mj) {
        mj.state = season.majorState;
        mj.status = season.majorState.complete ? 'complete' : 'active';
        mj.champion = season.majorState.champion || null;
        season.currentEventIdx = season.eventCalendar.indexOf(mj);
      }
      season.phase = 'events';
    } else if (season.phase === 'playoffs' || season.phase === 'major') {
      season.phase = 'events';
    }
    if (season.currentEventIdx >= 0 && season.eventCalendar[season.currentEventIdx].status === 'pending') {
      activateEventState(season, userTeam);
    }
    return season;
  }

  function applyUserStats(season, game) {
    const ps = season.playerStats;
    const mapsPlayed = (game.maps || []).length || 1;
    ps.kills += game.kills || 0;
    ps.deaths += game.deaths || 0;
    ps.assists += game.assists || 0;
    const prevMaps = ps.maps || 0;
    ps.maps = prevMaps + mapsPlayed;
    ps.adr = ps.maps ? Math.round(((ps.adr || 0) * prevMaps + (game.adr || 0) * mapsPlayed) / ps.maps) : (game.adr || 0);
    ps.rating = ps.maps ? round2(((ps.rating || 0) * prevMaps + (game.rating || 0) * mapsPlayed) / ps.maps) : (game.rating || 0);
    ps.clutches = (ps.clutches || 0) + (game.clutches || 0);
    if ((game.rating || 0) >= 1.25) ps.mvps = (ps.mvps || 0) + 1;
  }

  function trackEventUserStats(season, eventId, game) {
    if (!eventId) return;
    season.eventStats = season.eventStats || {};
    const es = season.eventStats[eventId] || C.emptyStats();
    const mapsPlayed = (game.maps || []).length || 1;
    const prevMaps = es.maps || 0;
    es.kills = (es.kills || 0) + (game.kills || 0);
    es.deaths = (es.deaths || 0) + (game.deaths || 0);
    es.assists = (es.assists || 0) + (game.assists || 0);
    es.maps = prevMaps + mapsPlayed;
    es.adr = es.maps ? Math.round(((es.adr || 0) * prevMaps + (game.adr || 0) * mapsPlayed) / es.maps) : (game.adr || 0);
    es.rating = es.maps ? round2(((es.rating || 0) * prevMaps + (game.rating || 0) * mapsPlayed) / es.maps) : (game.rating || 0);
    es.clutches = (es.clutches || 0) + (game.clutches || 0);
    if (game.win) es.wins = (es.wins || 0) + 1; else es.losses = (es.losses || 0) + 1;
    season.eventStats[eventId] = es;
  }

  function pushMatchLog(season, game, meta) {
    season.matchLog = season.matchLog || [];
    const m0 = (game.maps && game.maps[0]) || {};
    season.matchLog.unshift({
      label: meta.label || '联赛',
      eventId: meta.eventId || 'league',
      map: m0.map || '—',
      win: !!game.win,
      kills: game.kills || 0,
      deaths: game.deaths || 0,
      assists: game.assists || 0,
      adr: game.adr || 0,
      rating: game.rating || 0,
      series: game.series || null,
      opponent: game.opponent || null
    });
    if (season.matchLog.length > 24) season.matchLog.length = 24;
  }

  function afterSimulatedMatch(season, userTeam, match, game, ctx) {
    if (!season || !match || !match.winner) return;
    const winner = match.winner;
    const loser = winner === match.teamA ? match.teamB : match.teamA;
    const R = window.CS2_RANKINGS;
    if (R && season.vrs) R.applyVrsMatch(season, winner, loser, ctx && ctx.kFactor || 20);
    const involved = userTeam === match.teamA || userTeam === match.teamB;
    if (involved && game) {
      if (!game.opponent) game.opponent = userTeam === match.teamA ? match.teamB : match.teamA;
      applyUserStats(season, game);
      trackEventUserStats(season, ctx && ctx.eventId, game);
      pushMatchLog(season, game, ctx || {});
    }
  }

  function afterSwissMatch(season, userTeam, teamA, teamB, game, ctx) {
    const winner = resolveMatchWinner(teamA, teamB, userTeam, null, game);
    const loser = winner === teamA ? teamB : teamA;
    const R = window.CS2_RANKINGS;
    if (R && season.vrs) R.applyVrsMatch(season, winner, loser, ctx && ctx.kFactor || 18);
    if (userTeam === teamA || userTeam === teamB) {
      if (!game.opponent) game.opponent = userTeam === teamA ? teamB : teamA;
      applyUserStats(season, game);
      trackEventUserStats(season, ctx && ctx.eventId, game);
      pushMatchLog(season, game, ctx || {});
    }
  }

  function applyGameResult(season, career, game) {
    const teamId = career.teamId;
    const opp = game.opponent;
    season.games.push(game);
    if (game.win) { season.wins++; season.standings[teamId].wins++; season.standings[opp].losses++; }
    else { season.losses++; season.standings[teamId].losses++; season.standings[opp].wins++; }
    season.standings[teamId].roundDiff += game.roundDiff || 0;
    season.standings[opp].roundDiff -= game.roundDiff || 0;
    season.roundDiff += game.roundDiff || 0;
    applyUserStats(season, game);
    pushMatchLog(season, game, { label: '联赛', eventId: 'league', opponent: opp });
    const R = window.CS2_RANKINGS;
    if (R && season.vrs) {
      const winner = game.win ? teamId : opp;
      const loser = game.win ? opp : teamId;
      R.applyVrsMatch(season, winner, loser, game.type === 'derby' ? 18 : 16);
    }
  }

  function sortedStandings(standings) {
    return Object.keys(standings).map(t => ({ team: t, ...standings[t] }))
      .sort((a, b) => b.wins - a.wins || b.roundDiff - a.roundDiff || a.team.localeCompare(b.team));
  }

  function resolveMatchWinner(teamA, teamB, userTeam, career, userGame) {
    if (userTeam === teamA || userTeam === teamB) {
      return userGame.win ? userTeam : (userTeam === teamA ? teamB : teamA);
    }
    return teamStrength(teamA, null) >= teamStrength(teamB, null) ? teamA : teamB;
  }

  function initPlayoffs(standings) {
    const top8 = sortedStandings(standings).slice(0, 8).map(r => r.team);
    const bracket = [];
    for (let i = 0; i < 4; i++) {
      bracket.push({ round: 'QF', teamA: top8[i], teamB: top8[7 - i], winner: null, games: null });
    }
    return { phase: 'playoffs', round: 'QF', bracket, results: [] };
  }

  function advancePlayoffBracket(state, userTeam, career, ctx) {
    const round = state.round;
    const pending = state.bracket.filter(m => !m.winner);
    pending.forEach(match => {
      const g = simBO3(match.teamA, match.teamB, userTeam, career);
      match.games = g;
      match.winner = resolveMatchWinner(match.teamA, match.teamB, userTeam, career, g);
      state.results.push({ ...match, userInvolved: userTeam === match.teamA || userTeam === match.teamB });
      if (ctx && ctx.season) afterSimulatedMatch(ctx.season, userTeam, match, g, ctx);
    });
    if (round === 'QF') {
      const winners = state.bracket.map(m => m.winner);
      state.bracket = [
        { round: 'SF', teamA: winners[0], teamB: winners[3], winner: null, games: null },
        { round: 'SF', teamA: winners[1], teamB: winners[2], winner: null, games: null }
      ];
      state.round = 'SF';
    } else if (round === 'SF') {
      const winners = state.bracket.map(m => m.winner);
      state.bracket = [{ round: 'F', teamA: winners[0], teamB: winners[1], winner: null, games: null }];
      state.round = 'F';
    } else {
      state.complete = true;
      state.champion = state.bracket[0].winner;
    }
  }

  function initMajor(standings, playoffState, userTeam) {
    const top6 = sortedStandings(standings).slice(0, 6).map(r => r.team);
    const poWinners = (playoffState && playoffState.results || [])
      .filter(r => r.round === 'F').map(r => r.winner);
    const invited = unique([...top6, ...(poWinners || [])]).slice(0, 16);
    while (invited.length < 16) {
      const rest = C.LEAGUE.teamList.filter(t => !invited.includes(t));
      if (!rest.length) break;
      invited.push(rest[0]);
    }
    return {
      phase: 'major', teams: invited,
      swiss: invited.map(t => ({ team: t, wins: 0, losses: 0, eliminated: false, qualified: false })),
      swissDay: 0, maxSwissDays: 8,
      bracket: [], round: 'QF', complete: false, champion: null, userTeam
    };
  }

  function simSwissDay(major, userTeam, career, ctx) {
    const active = major.swiss.filter(t => !t.eliminated && !t.qualified);
    const pairs = [];
    const shuffled = shuffle(active);
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      pairs.push([shuffled[i], shuffled[i + 1]]);
    }
    pairs.forEach(([a, b]) => {
      const g = simBO1(a.team, b.team, userTeam, career);
      const winA = resolveMatchWinner(a.team, b.team, userTeam, career, g) === a.team;
      if (winA) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
      if (a.wins >= 3) a.qualified = true;
      if (b.wins >= 3) b.qualified = true;
      if (a.losses >= 3) a.eliminated = true;
      if (b.losses >= 3) b.eliminated = true;
      if (ctx && ctx.season) afterSwissMatch(ctx.season, userTeam, a.team, b.team, g, ctx);
    });
    major.swissDay++;
    if (major.swiss.filter(t => t.qualified).length >= 8 || major.swissDay >= major.maxSwissDays) {
      major.phase = 'major_playoffs';
      const qualified = major.swiss.filter(t => t.qualified).sort((x, y) => y.wins - x.wins).slice(0, 8);
      if (qualified.length < 8) {
        major.swiss.filter(t => !t.eliminated && !t.qualified)
          .sort((x, y) => y.wins - x.wins)
          .slice(0, 8 - qualified.length)
          .forEach(t => qualified.push(t));
      }
      major.bracket = [];
      for (let i = 0; i < 4; i++) {
        major.bracket.push({
          round: 'QF', teamA: qualified[i].team, teamB: qualified[7 - i].team, winner: null, games: null
        });
      }
      major.round = 'QF';
    }
  }

  function advanceMajorBracket(major, userTeam, career, ctx) {
    const pending = major.bracket.filter(m => !m.winner);
    pending.forEach(match => {
      const g = simBO3(match.teamA, match.teamB, userTeam, career);
      match.games = g;
      match.winner = resolveMatchWinner(match.teamA, match.teamB, userTeam, career, g);
      if (ctx && ctx.season) afterSimulatedMatch(ctx.season, userTeam, match, g, ctx);
    });
    if (major.round === 'QF') {
      const winners = major.bracket.map(m => m.winner);
      major.bracket = [
        { round: 'SF', teamA: winners[0], teamB: winners[3], winner: null, games: null },
        { round: 'SF', teamA: winners[1], teamB: winners[2], winner: null, games: null }
      ];
      major.round = 'SF';
    } else if (major.round === 'SF') {
      const winners = major.bracket.map(m => m.winner);
      major.bracket = [{ round: 'F', teamA: winners[0], teamB: winners[1], winner: null, games: null }];
      major.round = 'F';
    } else {
      major.complete = true;
      major.champion = major.bracket[0].winner;
    }
  }

  window.CS2_SIM = {
    teamStrength, playerMatchRating, simBO1, simBO3, buildSchedule, initSeason,
    applyGameResult, sortedStandings, initPlayoffs, advancePlayoffBracket,
    initMajor, simSwissDay, advanceMajorBracket,
    EVENT_TEMPLATES, initEventCalendar, getActiveEvent, simEventStep,
    simEventComplete, simAllRemainingEvents, isSeasonEventsComplete, migrateSeasonEvents,
    initSwissEvent, initElim8, advanceElimBracket
  };
})();
