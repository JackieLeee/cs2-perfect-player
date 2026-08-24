(function () {
  'use strict';

  window.CS2 = window.CS2 || {};

  const ATTR_KEYS = ['AIM', 'REFL', 'SPRY', 'AWPE', 'UTLY', 'GMSN', 'COMM', 'CLUT', 'ENTR', 'LURK', 'TEAM', 'MENT', 'CONS'];
  const ATTR_CN = {
    AIM: '枪法', REFL: '反应', SPRY: '控枪', AWPE: '狙击', UTLY: '道具', GMSN: '意识',
    COMM: '沟通', CLUT: '残局', ENTR: '突破', LURK: '绕后', TEAM: '协作', MENT: '心态', CONS: '稳定'
  };
  const ATTR_DESC = {
    AIM: '瞄准精度与爆头率', REFL: '对枪反应与 peek 速度', SPRY: '压枪与连杀稳定性',
    AWPE: 'AWP 专精能力', UTLY: '烟雾/闪光/燃烧投掷', GMSN: '地图理解与时机判断',
    COMM: '报点与指挥潜力', CLUT: '1vN 与关键回合', ENTR: '首杀与开路能力',
    LURK: '侧翼渗透与信息收集', TEAM: '补枪与交叉火力', MENT: '逆风抗压与大场面',
    CONS: '发挥波动与连续场次稳定性'
  };
  const ROLES = { IGL: '指挥', AWP: '狙击手', Entry: '突破手', Lurk: '自由人', Support: '辅助' };
  const ROLE_LIST = ['IGL', 'AWP', 'Entry', 'Lurk', 'Support'];
  const ROLE_ID = { IGL: 1, AWP: 2, Entry: 3, Lurk: 4, Support: 5 };
  const ID_ROLE = { 1: 'IGL', 2: 'AWP', 3: 'Entry', 4: 'Lurk', 5: 'Support' };

  const ROLE_AVG = {
    IGL: { AIM: 74, REFL: 72, SPRY: 70, AWPE: 55, UTLY: 78, GMSN: 88, COMM: 92, CLUT: 72, ENTR: 68, LURK: 70, TEAM: 85, MENT: 82, CONS: 80 },
    AWP: { AIM: 92, REFL: 88, SPRY: 82, AWPE: 95, UTLY: 62, GMSN: 80, COMM: 65, CLUT: 85, ENTR: 70, LURK: 72, TEAM: 68, MENT: 78, CONS: 82 },
    Entry: { AIM: 88, REFL: 90, SPRY: 85, AWPE: 58, UTLY: 68, GMSN: 75, COMM: 62, CLUT: 78, ENTR: 92, LURK: 65, TEAM: 72, MENT: 75, CONS: 74 },
    Lurk: { AIM: 82, REFL: 80, SPRY: 78, AWPE: 60, UTLY: 70, GMSN: 88, COMM: 68, CLUT: 82, ENTR: 68, LURK: 92, TEAM: 75, MENT: 80, CONS: 82 },
    Support: { AIM: 76, REFL: 74, SPRY: 72, AWPE: 55, UTLY: 92, GMSN: 82, COMM: 78, CLUT: 70, ENTR: 65, LURK: 72, TEAM: 90, MENT: 78, CONS: 80 }
  };

  const OVR_WEIGHTS = {
    IGL: { COMM: 0.14, GMSN: 0.12, TEAM: 0.10, MENT: 0.08, AIM: 0.08, UTLY: 0.08, CLUT: 0.08, CONS: 0.08, REFL: 0.06, SPRY: 0.04, ENTR: 0.04, LURK: 0.04, AWPE: 0.06 },
    AWP: { AWPE: 0.16, AIM: 0.14, REFL: 0.10, CLUT: 0.10, GMSN: 0.08, CONS: 0.08, MENT: 0.06, TEAM: 0.06, SPRY: 0.06, UTLY: 0.04, ENTR: 0.04, LURK: 0.04, COMM: 0.04 },
    Entry: { ENTR: 0.14, AIM: 0.14, REFL: 0.10, SPRY: 0.08, CLUT: 0.08, GMSN: 0.06, TEAM: 0.06, CONS: 0.06, MENT: 0.06, UTLY: 0.06, LURK: 0.04, COMM: 0.04, AWPE: 0.08 },
    Lurk: { LURK: 0.14, GMSN: 0.12, CLUT: 0.10, AIM: 0.10, CONS: 0.08, MENT: 0.08, TEAM: 0.06, REFL: 0.06, SPRY: 0.06, UTLY: 0.04, ENTR: 0.04, COMM: 0.04, AWPE: 0.08 },
    Support: { UTLY: 0.14, TEAM: 0.12, GMSN: 0.10, COMM: 0.08, MENT: 0.08, CONS: 0.08, AIM: 0.06, REFL: 0.06, CLUT: 0.06, SPRY: 0.04, ENTR: 0.04, LURK: 0.04, AWPE: 0.10 }
  };

  const MAP_POOL = ['Mirage', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Vertigo', 'Dust2'];
  const LEAGUE_GAMES = 18;
  const SINGLE_SEASON = { year: 2026, label: 'CS2 单赛季 · 2026' };

  const LEAGUE = { loaded: false, teams: {}, roster: {} };

  function parseNum(v, def) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (def == null ? 0 : def);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function rng(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function getGrade(val) {
    if (val >= 95) return { letter: 'S', color: '#ff6b35' };
    if (val >= 90) return { letter: 'A+', color: '#ff8787' };
    if (val >= 85) return { letter: 'A', color: '#ffa07a' };
    if (val >= 80) return { letter: 'B+', color: '#ffd43b' };
    if (val >= 75) return { letter: 'B', color: '#ffd43b' };
    if (val >= 70) return { letter: 'C+', color: '#69db7c' };
    if (val >= 65) return { letter: 'C', color: '#69db7c' };
    if (val >= 60) return { letter: 'D', color: '#74c0fc' };
    return { letter: 'F', color: '#868e96' };
  }

  function getOvrGrade(ovr) {
    if (ovr >= 95) return '超级明星';
    if (ovr >= 85) return '全明星';
    if (ovr >= 75) return '首发';
    if (ovr >= 65) return '轮换';
    return '替补';
  }

  function thirteenToMatch(attrs13) {
    const a = (k, def) => Math.round(parseNum(attrs13[k], def));
    return {
      aim: a('AIM', 55), reaction: a('REFL', 55), utility: a('UTLY', 55),
      gamesense: a('GMSN', 55), clutch: a('CLUT', 55), entry: a('ENTR', 55),
      lurk: a('LURK', 55), teamwork: a('TEAM', 55), mental: a('MENT', 55),
      consistency: a('CONS', 55), spray: a('SPRY', 55), awp: a('AWPE', 55)
    };
  }

  function attrsToThirteen(attrs) {
    if (!attrs) return {};
    if (attrs.AIM != null) return attrs;
    return {
      AIM: parseNum(attrs.aim, 55), REFL: parseNum(attrs.reaction, 55),
      SPRY: parseNum(attrs.spray, 55), AWPE: parseNum(attrs.awp, 55),
      UTLY: parseNum(attrs.utility, 55), GMSN: parseNum(attrs.gamesense, 55),
      COMM: parseNum(attrs.comm, 55), CLUT: parseNum(attrs.clutch, 55),
      ENTR: parseNum(attrs.entry, 55), LURK: parseNum(attrs.lurk, 55),
      TEAM: parseNum(attrs.teamwork, 55), MENT: parseNum(attrs.mental, 55),
      CONS: parseNum(attrs.consistency, 55)
    };
  }

  function calcOVR(attrs13, role) {
    const w = OVR_WEIGHTS[role] || OVR_WEIGHTS.Entry;
    let sum = 0;
    ATTR_KEYS.forEach(k => { sum += parseNum(attrs13[k], 55) * (w[k] || 0.07); });
    return clamp(Math.round(sum), 25, 99);
  }

  function matchArchetype(attrs13, role) {
    const a = (k) => parseNum(attrs13[k], 55);
    const set = (k, t) => a(k) >= t;
    if (role === 'IGL') {
      if (set('COMM', 90) && set('GMSN', 88)) return '战术大师 Tactical Maestro';
      if (set('MENT', 85)) return '冷静指挥 Calm Caller';
      return '调度核心 Shot Caller';
    }
    if (role === 'AWP') {
      if (set('AWPE', 95) && set('AIM', 92)) return '狙击之神 AWP God';
      if (set('CLUT', 88)) return '架点专家 Anchor';
      return '移动狙 Mobile Sniper';
    }
    if (role === 'Entry') {
      if (set('ENTR', 92) && set('AIM', 88)) return '突破尖刀 Entry Fragger';
      if (set('REFL', 90)) return ' fearless 开路 Fearless';
      return '空间制造者 Space Creator';
    }
    if (role === 'Lurk') {
      if (set('LURK', 92) && set('GMSN', 88)) return '信息幽灵 Info Ghost';
      if (set('CLUT', 85)) return '侧翼杀手 Flanker';
      return '自由人 Lurker';
    }
    if (set('UTLY', 92) && set('TEAM', 88)) return '道具大师 Utility King';
    if (set('TEAM', 85)) return '团队粘合剂 Glue Guy';
    return '补枪专家 Support Anchor';
  }

  function emptyStats() {
    return { kills: 0, deaths: 0, assists: 0, adr: 0, rating: 0, maps: 0, clutches: 0, mvps: 0 };
  }

  async function loadTeamsMeta() {
    const res = await fetch('assets/data/cs2-teams.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('teams load failed');
    const data = await res.json();
    return data.teams || [];
  }

  async function loadLeagueData() {
    const [teamsMeta, poolRes, rosterRes] = await Promise.all([
      loadTeamsMeta(),
      fetch('assets/data/cs2-player-pool.json', { cache: 'no-store' }),
      fetch('assets/data/cs2-rosters-2026.csv', { cache: 'no-store' })
    ]);
    if (!poolRes.ok) throw new Error('pool load failed');
    const pool = await poolRes.json();
    const rosterText = rosterRes.ok ? await rosterRes.text() : '';
    const teams = {};
    teamsMeta.forEach(t => {
      teams[t.id] = { meta: t, players: [] };
    });
    Object.keys(pool.teams || {}).forEach(tid => {
      if (!teams[tid]) teams[tid] = { meta: { id: tid, name: tid, nameCn: tid, color: '#555' }, players: [] };
      const current = (pool.teams[tid].players || []).map(p => normalizePlayer(p, tid));
      teams[tid].players = current;
    });
    LEAGUE.teams = teams;
    LEAGUE.pool = pool;
    LEAGUE.loaded = true;
    LEAGUE.teamList = teamsMeta.map(t => t.id);
    return LEAGUE;
  }

  function normalizePlayer(p, teamId) {
    const attrs13 = attrsToThirteen(p.attrs || {});
    const role = p.role || ID_ROLE[parseNum(p.pos, 3)] || 'Entry';
    return {
      ...p,
      teamId: p.teamId || teamId,
      role,
      pos: ROLE_ID[role] || 3,
      attrs13,
      attrs10: thirteenToMatch(attrs13),
      rating: parseNum(p.ovr, calcOVR(attrs13, role))
    };
  }

  function teamMeta(id) {
    const t = LEAGUE.teams && LEAGUE.teams[id];
    return t ? t.meta : { id, name: id, nameCn: id, color: '#555' };
  }

  function teamLogoHtml(meta, size) {
    const s = size || 40;
    const logo = meta.logo || '';
    if (logo) {
      return `<img class="tp-logo" src="${esc(logo)}" alt="${esc(meta.nameCn || meta.name || '')}" width="${s}" height="${s}" loading="lazy">`;
    }
    return teamLogoFallback(meta, s);
  }

  function teamLogoFallback(meta, size) {
    const s = size || 40;
    const bg = meta.color || '#333';
    const abbr = (meta.nameCn || meta.name || '?').slice(0, 3).toUpperCase();
    return `<span class="tp-logo" style="width:${s}px;height:${s}px;background:${bg};">${esc(abbr)}</span>`;
  }

  Object.assign(window.CS2, {
    ATTR_KEYS, ATTR_CN, ATTR_DESC, ROLES, ROLE_LIST, ROLE_ID, ID_ROLE, ROLE_AVG, OVR_WEIGHTS,
    MAP_POOL, LEAGUE_GAMES, SINGLE_SEASON, LEAGUE,
    parseNum, clamp, rng, pick, shuffle, esc, clone,
    getGrade, getOvrGrade, thirteenToMatch, attrsToThirteen, calcOVR, matchArchetype, emptyStats,
    loadLeagueData, teamMeta, teamLogoHtml, normalizePlayer
  });
})();
