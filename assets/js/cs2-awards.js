(function () {
  'use strict';

  const C = window.CS2;

  function n(v, d) { return C.parseNum(v, d); }

  function teamRecord(team, standings) {
    const row = standings && standings[team];
    return { wins: n(row && row.wins, 0), losses: n(row && row.losses, 0) };
  }

  function winPct(rec) {
    const t = rec.wins + rec.losses;
    return t > 0 ? rec.wins / t : 0.5;
  }

  function hash01(text) {
    let h = 2166136261;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  function buildCandidates(state) {
    const career = state.career;
    const season = state.season;
    const standings = season.standings || {};
    const candidates = [];

    candidates.push({
      key: '__USER__',
      name: career.playerName,
      team: career.teamId,
      role: career.role,
      rating: n(season.playerStats && season.playerStats.rating, 1.0),
      adr: n(season.playerStats && season.playerStats.adr, 70),
      ovr: n(career.ovr, 75),
      wins: n(season.wins, 0),
      isUser: true
    });

    Object.keys(C.LEAGUE.teams || {}).forEach(tid => {
      (C.LEAGUE.teams[tid].players || []).slice(0, 6).forEach(p => {
        const rec = teamRecord(tid, standings);
        candidates.push({
          key: `${tid}:${p.name}`,
          name: p.name,
          team: tid,
          role: p.role,
          rating: n(p.rating, 1.0),
          ovr: n(p.ovr, 75),
          adr: n(p.ovr, 75) * 0.9,
          wins: rec.wins,
          isUser: false
        });
      });
    });
    return candidates;
  }

  function rankLabel(rank) {
    if (rank === 1) return '🥇 第一名';
    if (rank === 2) return '🥈 第二名';
    if (rank === 3) return '🥉 第三名';
    if (rank === 4) return '第四名';
    if (rank === 5) return '第五名';
    if (rank <= 10) return `第 ${rank} 名`;
    if (rank <= 20) return `第 ${rank} 名`;
    return '未入选 Top 20';
  }

  function rankClass(rank) {
    if (rank === 1) return 'gold';
    if (rank <= 3) return 'orange';
    if (rank <= 20) return 'dim';
    return 'dim';
  }

  function ballotScore(state, candidates, scorer) {
    const seasonKey = `${state.season && state.season.year || 2026}|${state.career && state.career.playerName || ''}`;
    return candidates.map(c => ({
      ...c,
      score: scorer(c) + hash01(seasonKey + c.key) * 4
    })).sort((a, b) => b.score - a.score);
  }

  function userRank(sorted, userKey) {
    const idx = sorted.findIndex(c => c.isUser || c.key === userKey);
    return idx >= 0 ? idx + 1 : 99;
  }

  function teamEventWins(state, teamId) {
    return (state.season.eventCalendar || []).filter(ev =>
      ev.status === 'complete' && ev.champion === teamId
    ).length;
  }

  function teamCandidates(state) {
    const standings = state.season.standings || {};
    const vrs = state.season.vrs || {};
    return Object.keys(standings).map(tid => {
      const rec = teamRecord(tid, standings);
      const evWins = teamEventWins(state, tid);
      return {
        team: tid,
        name: (C.teamMeta(tid).nameCn || C.teamMeta(tid).name),
        wins: rec.wins,
        losses: rec.losses,
        winPct: winPct(rec),
        roundDiff: n(standings[tid].roundDiff, 0),
        evWins,
        vrs: n(vrs[tid], 0),
        isUser: tid === state.career.teamId,
        score: evWins * 48 + rec.wins * 3 + winPct(rec) * 22 + n(vrs[tid], 0) * 0.015 + n(standings[tid].roundDiff, 0) * 0.08
      };
    }).sort((a, b) => b.score - a.score || b.evWins - a.evWins || b.wins - a.wins);
  }

  function eventBonus(state, teamId) {
    const cal = state.season.eventCalendar || [];
    let bonus = 0;
    cal.forEach(ev => {
      if (ev.status !== 'complete' || ev.champion !== teamId) return;
      if (ev.id === 'major') bonus += 35;
      else bonus += 10;
    });
    return bonus;
  }

  function playerEventHonors(state, key) {
    let mvp = 0;
    let evp = 0;
    (state.season.eventCalendar || []).forEach(ev => {
      if (ev.status !== 'complete') return;
      if (ev.mvp && (ev.mvp.isUser ? key === '__USER__' : `${ev.mvp.team}:${ev.mvp.name}` === key)) mvp++;
      if ((ev.evps || []).some(e => e.isUser ? key === '__USER__' : `${e.team}:${e.name}` === key)) evp++;
    });
    return { mvp, evp, total: mvp * 3 + evp };
  }

  function top20Eligible(c, state) {
    const rec = teamRecord(c.team, state.season.standings || {});
    const honors = playerEventHonors(state, c.key);
    const teamOk = rec.wins >= 6 || teamEventWins(state, c.team) >= 1 || winPct(rec) >= 0.42;
    const personalOk = c.rating >= 1.0 || (c.isUser && n(state.season.playerStats && state.season.playerStats.rating, 0) >= 0.95);
    const awardOk = honors.total >= 1;
    return teamOk && personalOk && awardOk;
  }

  function computeTop20(state) {
    const season = state.season;
    const standings = season.standings || {};
    const seasonKey = `${season.year || 2026}|${state.career.playerName || ''}`;
    const candidates = buildCandidates(state).map(c => {
      const rec = teamRecord(c.team, standings);
      const honors = playerEventHonors(state, c.key);
      const teamScore = rec.wins * 2.2 + winPct(rec) * 18 + eventBonus(state, c.team) * 0.2;
      const personalScore = c.rating * 38 + c.ovr * 0.32;
      const awardScore = honors.mvp * 14 + honors.evp * 5;
      const score = teamScore * 0.34 + personalScore * 0.38 + awardScore * 0.28 +
        hash01(seasonKey + c.key + 'top20') * 3;
      return {
        ...c,
        score,
        teamScore,
        personalScore,
        awardScore,
        honors,
        eligible: top20Eligible(c, state)
      };
    }).filter(c => c.eligible).sort((a, b) => b.score - a.score);

    const top20 = candidates.slice(0, 20);
    const userIdx = top20.findIndex(c => c.isUser);
    const userInAll = buildCandidates(state).find(c => c.isUser);
    let userRankVal = userIdx >= 0 ? userIdx + 1 : userRank(candidates, '__USER__');
    if (userInAll && !top20Eligible(userInAll, state)) userRankVal = 99;
    return {
      list: top20,
      userRank: userRankVal,
      userEligible: userInAll ? top20Eligible(userInAll, state) : false
    };
  }

  function buildEventAwardRows(state) {
    const rows = [];
    (state.season.eventCalendar || []).forEach(ev => {
      if (ev.status !== 'complete' || !ev.champion) return;
      const champMeta = C.teamMeta(ev.champion);
      rows.push({
        id: `event_${ev.id}_champ`,
        act: ev.id,
        eventId: ev.id,
        label: `${ev.label} · 冠军`,
        emoji: ev.emoji || '🏅',
        winner: champMeta.nameCn || champMeta.name,
        team: ev.champion,
        isUser: ev.champion === state.career.teamId,
        userRank: ev.champion === state.career.teamId ? '🥇 冠军' : '—',
        rankClass: ev.champion === state.career.teamId ? 'gold' : 'dim',
        isTeamAward: true,
        clickable: true,
        detail: {
          type: 'event',
          eventId: ev.id,
          label: ev.label,
          champion: ev.champion,
          mvp: ev.mvp || null,
          evps: ev.evps || [],
          userPlaced: ev.userPlaced
        }
      });
      if (ev.mvp) {
        rows.push({
          id: `event_${ev.id}_mvp`,
          act: `${ev.id}_mvp`,
          eventId: ev.id,
          label: `${ev.label} · MVP`,
          emoji: '💎',
          winner: ev.mvp.name,
          team: ev.mvp.team,
          isUser: !!ev.mvp.isUser,
          userRank: ev.mvp.isUser ? '🥇 MVP' : '—',
          rankClass: ev.mvp.isUser ? 'gold' : 'dim',
          clickable: true,
          detail: {
            type: 'event',
            eventId: ev.id,
            label: ev.label,
            champion: ev.champion,
            mvp: ev.mvp,
            evps: ev.evps || [],
            userPlaced: ev.userPlaced
          }
        });
      }
      if (ev.evps && ev.evps.length) {
        rows.push({
          id: `event_${ev.id}_evp`,
          act: `${ev.id}_evp`,
          eventId: ev.id,
          label: `${ev.label} · EVP`,
          emoji: '🌟',
          isList: true,
          isUser: ev.evps.some(e => e.isUser),
          userRank: ev.evps.some(e => e.isUser) ? '入选 EVP' : '—',
          rankClass: ev.evps.some(e => e.isUser) ? 'orange' : 'dim',
          listMeta: ev.evps.map(e => ({
            name: e.name,
            team: e.team,
            teamName: C.teamMeta(e.team).nameCn || C.teamMeta(e.team).name,
            role: e.role,
            rating: e.rating,
            isUser: e.isUser
          })),
          clickable: true,
          detail: {
            type: 'event',
            eventId: ev.id,
            label: ev.label,
            champion: ev.champion,
            mvp: ev.mvp || null,
            evps: ev.evps || [],
            userPlaced: ev.userPlaced
          }
        });
      }
    });
    return rows;
  }

  function computeSeasonAwards(state) {
    const awards = [];
    const userKey = '__USER__';
    const candidates = buildCandidates(state);

    const top20Data = computeTop20(state);
    awards.push({
      id: 'top20', act: 'top20', label: '年度 Top 20 选手', emoji: '📋',
      isList: true, isRankedList: true,
      isUser: top20Data.list.some(c => c.isUser),
      userRank: top20Data.userEligible ? rankLabel(top20Data.userRank) : '未达三要素',
      rankClass: rankClass(top20Data.userRank),
      clickable: true,
      detail: {
        type: 'top20',
        note: '需同时满足：队伍成绩 · 个人表现 · 赛事荣誉（MVP/EVP）',
        list: top20Data.list
      },
      listMeta: top20Data.list.map((c, i) => ({
        rank: i + 1,
        name: c.name,
        team: c.team,
        teamName: (C.teamMeta(c.team).nameCn || C.teamMeta(c.team).name),
        ovr: c.ovr,
        rating: c.rating,
        isUser: c.isUser
      }))
    });

    const mvpSorted = ballotScore(state, candidates.filter(c => playerEventHonors(state, c.key).total >= 1), c =>
      c.rating * 40 + c.wins * 2 + winPct(teamRecord(c.team, state.season.standings)) * 28 +
      playerEventHonors(state, c.key).total * 6
    );
    const mvp = mvpSorted[0];
    if (mvp) {
      awards.push({
        id: 'season_mvp', act: 'mvp', label: '年度 MVP', emoji: '🏆',
        winner: mvp.name, team: mvp.team, isUser: mvp.isUser,
        userRank: rankLabel(userRank(mvpSorted, userKey)), rankClass: rankClass(userRank(mvpSorted, userKey))
      });
    }

    const awpSorted = ballotScore(state, candidates.filter(c => c.role === 'AWP' && playerEventHonors(state, c.key).total >= 1), c =>
      c.rating * 55 + c.adr * 0.2 + playerEventHonors(state, c.key).total * 4
    );
    if (awpSorted.length) {
      const awp = awpSorted[0];
      awards.push({
        id: 'best_awp', act: 'awp', label: 'Best AWPer', emoji: '🎯',
        winner: awp.name, team: awp.team, isUser: awp.isUser,
        userRank: rankLabel(userRank(awpSorted, userKey)), rankClass: rankClass(userRank(awpSorted, userKey))
      });
    }

    const iglSorted = ballotScore(state, candidates.filter(c => c.role === 'IGL'), c =>
      winPct(teamRecord(c.team, state.season.standings)) * 50 + c.rating * 25 + c.wins * 2 +
      teamEventWins(state, c.team) * 8
    );
    if (iglSorted.length) {
      const igl = iglSorted[0];
      awards.push({
        id: 'best_igl', act: 'igl', label: 'Best IGL', emoji: '🧠',
        winner: igl.name, team: igl.team, isUser: igl.isUser,
        userRank: rankLabel(userRank(iglSorted, userKey)), rankClass: rankClass(userRank(iglSorted, userKey))
      });
    }

    const teams = teamCandidates(state);
    const teamOfYear = teams[0];
    if (teamOfYear) {
      awards.push({
        id: 'team_of_season', act: 'team', label: '年度最佳战队', emoji: '🏢',
        winner: teamOfYear.name, team: teamOfYear.team, isUser: teamOfYear.isUser,
        userRank: teamOfYear.isUser ? '🥇 第一名' : rankLabel(teams.findIndex(t => t.isUser) + 1),
        rankClass: teamOfYear.isUser ? 'gold' : rankClass(teams.findIndex(t => t.isUser) + 1),
        isTeamAward: true,
        clickable: true,
        detail: {
          type: 'team',
          team: teamOfYear.team,
          wins: teamOfYear.wins,
          losses: teamOfYear.losses,
          evWins: teamOfYear.evWins,
          vrs: teamOfYear.vrs,
          topTeams: teams.slice(0, 5)
        }
      });
    }

    awards.push(...buildEventAwardRows(state));

    return awards;
  }

  window.CS2_AWARDS = {
    computeSeasonAwards,
    computeTop20,
    buildCandidates,
    rankLabel,
    rankClass,
    teamCandidates,
    playerEventHonors
  };
})();
