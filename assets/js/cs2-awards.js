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
      (C.LEAGUE.teams[tid].players || []).slice(0, 5).forEach(p => {
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
      score: scorer(c) + hash01(seasonKey + c.key) * 6
    })).sort((a, b) => b.score - a.score);
  }

  function userRank(sorted, userKey) {
    const idx = sorted.findIndex(c => c.isUser || c.key === userKey);
    return idx >= 0 ? idx + 1 : 99;
  }

  function teamCandidates(state) {
    const standings = state.season.standings || {};
    return Object.keys(standings).map(tid => {
      const rec = teamRecord(tid, standings);
      return {
        team: tid,
        name: (C.teamMeta(tid).nameCn || C.teamMeta(tid).name),
        wins: rec.wins,
        losses: rec.losses,
        winPct: winPct(rec),
        roundDiff: n(standings[tid].roundDiff, 0),
        isUser: tid === state.career.teamId
      };
    }).sort((a, b) => b.wins - a.wins || b.roundDiff - a.roundDiff);
  }

  function eventBonus(state, teamId) {
    const cal = state.season.eventCalendar || [];
    let bonus = 0;
    cal.forEach(ev => {
      if (ev.status !== 'complete' || ev.champion !== teamId) return;
      if (ev.id === 'major') bonus += 35;
      else if (ev.id === 'playoffs') bonus += 12;
      else bonus += 8;
    });
    return bonus;
  }

  function computeTop20(state) {
    const season = state.season;
    const standings = season.standings || {};
    const seasonKey = `${season.year || 2026}|${state.career.playerName || ''}`;
    const candidates = buildCandidates(state).map(c => {
      const rec = teamRecord(c.team, standings);
      const evBonus = eventBonus(state, c.team) * 0.15;
      const score = c.ovr * 0.42 + c.rating * 38 + winPct(rec) * 22 + c.wins * 1.2 + evBonus +
        hash01(seasonKey + c.key + 'top20') * 4;
      return { ...c, score };
    }).sort((a, b) => b.score - a.score);

    const top20 = candidates.slice(0, 20);
    const userIdx = top20.findIndex(c => c.isUser);
    return {
      list: top20,
      userRank: userIdx >= 0 ? userIdx + 1 : userRank(candidates, '__USER__')
    };
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
      userRank: rankLabel(top20Data.userRank),
      rankClass: rankClass(top20Data.userRank),
      listMeta: top20Data.list.map((c, i) => ({
        rank: i + 1,
        name: c.name,
        team: c.team,
        teamName: (C.teamMeta(c.team).nameCn || C.teamMeta(c.team).name),
        ovr: c.ovr,
        isUser: c.isUser
      }))
    });

    const mvpSorted = ballotScore(state, candidates, c => c.rating * 45 + c.wins * 2 + winPct(teamRecord(c.team, state.season.standings)) * 30);
    const mvp = mvpSorted[0];
    awards.push({
      id: 'season_mvp', act: 'mvp', label: '年度 MVP', emoji: '🏆',
      winner: mvp.name, team: mvp.team, isUser: mvp.isUser,
      userRank: rankLabel(userRank(mvpSorted, userKey)), rankClass: rankClass(userRank(mvpSorted, userKey))
    });

    const awpSorted = ballotScore(state, candidates.filter(c => c.role === 'AWP'), c => c.rating * 55 + c.adr * 0.2);
    if (awpSorted.length) {
      const awp = awpSorted[0];
      awards.push({
        id: 'best_awp', act: 'awp', label: 'Best AWPer', emoji: '🎯',
        winner: awp.name, team: awp.team, isUser: awp.isUser,
        userRank: rankLabel(userRank(awpSorted, userKey)), rankClass: rankClass(userRank(awpSorted, userKey))
      });
    }

    const iglSorted = ballotScore(state, candidates.filter(c => c.role === 'IGL'), c =>
      winPct(teamRecord(c.team, state.season.standings)) * 50 + c.rating * 25 + c.wins * 2);
    if (iglSorted.length) {
      const igl = iglSorted[0];
      awards.push({
        id: 'best_igl', act: 'igl', label: 'Best IGL', emoji: '🧠',
        winner: igl.name, team: igl.team, isUser: igl.isUser,
        userRank: rankLabel(userRank(iglSorted, userKey)), rankClass: rankClass(userRank(iglSorted, userKey))
      });
    }

    const entrySorted = ballotScore(state, candidates.filter(c => c.role === 'Entry'), c => c.rating * 40 + c.adr * 0.25);
    if (entrySorted.length) {
      const entry = entrySorted[0];
      awards.push({
        id: 'best_entry', act: 'entry', label: 'Best Entry', emoji: '⚡',
        winner: entry.name, team: entry.team, isUser: entry.isUser,
        userRank: rankLabel(userRank(entrySorted, userKey)), rankClass: rankClass(userRank(entrySorted, userKey))
      });
    }

    const risingSorted = ballotScore(state, candidates, c => c.rating * 35 + (c.isUser ? 10 : 0));
    const rising = risingSorted.find(c => c.rating >= 1.0) || risingSorted[0];
    if (rising) {
      awards.push({
        id: 'rising_star', act: 'rising', label: 'Rising Star', emoji: '🌟',
        winner: rising.name, team: rising.team, isUser: rising.isUser,
        userRank: rankLabel(userRank(risingSorted, userKey)), rankClass: rankClass(userRank(risingSorted, userKey))
      });
    }

    const allStar = mvpSorted.slice(0, 5);
    awards.push({
      id: 'allstar_first', act: 'allstar', label: 'All-Star First Team', emoji: '⭐',
      winners: allStar.map(c => c.name), isList: true, isUser: allStar.some(c => c.isUser),
      userRank: allStar.some(c => c.isUser) ? rankLabel(allStar.findIndex(c => c.isUser) + 1) : '未入选',
      rankClass: allStar.some(c => c.isUser) ? rankClass(allStar.findIndex(c => c.isUser) + 1) : 'dim',
      listMeta: allStar.map(c => ({ name: c.name, isUser: c.isUser }))
    });

    const teams = teamCandidates(state);
    const teamOfYear = teams[0];
    if (teamOfYear) {
      awards.push({
        id: 'team_of_season', act: 'team', label: '年度最佳战队', emoji: '🏢',
        winner: teamOfYear.name, team: teamOfYear.team, isUser: teamOfYear.isUser,
        userRank: teamOfYear.isUser ? '🥇 第一名' : rankLabel(teams.findIndex(t => t.isUser) + 1),
        rankClass: teamOfYear.isUser ? 'gold' : rankClass(teams.findIndex(t => t.isUser) + 1),
        isTeamAward: true
      });
    }

    (state.season.eventCalendar || []).forEach(ev => {
      if (ev.status !== 'complete' || !ev.champion) return;
      const champMeta = C.teamMeta(ev.champion);
      awards.push({
        id: `event_${ev.id}`, act: ev.id, label: `${ev.label} 冠军`, emoji: ev.emoji || '🏅',
        winner: champMeta.nameCn || champMeta.name, team: ev.champion,
        isUser: ev.champion === state.career.teamId,
        userRank: ev.champion === state.career.teamId ? '🥇 冠军' : '—',
        rankClass: ev.champion === state.career.teamId ? 'gold' : 'dim',
        isTeamAward: true
      });
    });

    const majorEv = (state.season.eventCalendar || []).find(e => e.id === 'major');
    if (majorEv && majorEv.status === 'complete') {
      const mvpSortedMajor = ballotScore(state, candidates, c => c.rating * 50 + (c.isUser ? 12 : 0));
      const majorMvp = mvpSortedMajor[0];
      if (majorMvp) {
        awards.push({
          id: 'major_mvp', act: 'major_mvp', label: 'Major MVP', emoji: '💎',
          winner: majorMvp.name, team: majorMvp.team, isUser: majorMvp.isUser,
          userRank: majorMvp.isUser ? '🥇 MVP' : rankLabel(userRank(mvpSortedMajor, userKey)),
          rankClass: majorMvp.isUser ? 'gold' : rankClass(userRank(mvpSortedMajor, userKey))
        });
      }
    }

    return awards;
  }

  window.CS2_AWARDS = {
    computeSeasonAwards,
    computeTop20,
    buildCandidates,
    rankLabel,
    rankClass
  };
})();
