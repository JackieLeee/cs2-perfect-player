(function () {
  'use strict';

  const ACH_KEY = 'cs2_pp_achievements_v1';

  const ACHIEVEMENTS = [
    { id: 'first_win', name: '首胜', desc: '赢得第一场联赛', icon: '🎯', rarity: 'common' },
    { id: 'league_mvp', name: '联赛 MVP', desc: '获得联赛 MVP', icon: '🏆', rarity: 'legendary' },
    { id: 'major_mvp', name: 'Major MVP', desc: '获得 Major MVP', icon: '👑', rarity: 'legendary' },
    { id: 'major_champion', name: 'Major 冠军', desc: '赢得 Major 冠军', icon: '🥇', rarity: 'legendary' },
    { id: 'rating_130', name: '1.30 Rating', desc: '赛季平均 Rating ≥ 1.30', icon: '📈', rarity: 'epic' },
    { id: 'forty_kills', name: '40 Kill', desc: '单场比赛 40+ 击杀', icon: '💥', rarity: 'epic' },
    { id: 'all_roles', name: '全角色', desc: '五个角色各建号一次（累计）', icon: '🎭', rarity: 'rare' },
    { id: 'legend_attr', name: '传奇属性', desc: '从传奇惊喜卡锁定属性', icon: '⭐', rarity: 'rare' },
    { id: 'clean_season', name: '零负面', desc: '单赛季无负面事件选择', icon: '😇', rarity: 'rare' },
    { id: 'playoffs_run', name: '年度赛事', desc: '进入年度赛事阶段', icon: '🎪', rarity: 'common' },
    { id: 'major_appear', name: 'Major 亮相', desc: '进入 Major 正赛', icon: '🌍', rarity: 'epic' },
    { id: 'top_awp', name: '最佳狙击', desc: '获得 Best AWPer', icon: '🔭', rarity: 'epic' },
    { id: 'top_igl', name: '最佳指挥', desc: '获得 Best IGL', icon: '🧠', rarity: 'epic' },
    { id: 'rising_star', name: '新星', desc: '获得 Rising Star', icon: '🌟', rarity: 'rare' },
    { id: 'allstar', name: '全明星', desc: '入选 All-Star First Team', icon: '✨', rarity: 'epic' },
    { id: 'win_streak_5', name: '五连胜', desc: '联赛五连胜', icon: '🔥', rarity: 'rare' },
    { id: 'clutch_king', name: '残局之王', desc: '赛季 10+ 残局胜利', icon: '🃏', rarity: 'rare' },
    { id: 'complete_build', name: '完美构建', desc: '13 项属性全部 80+', icon: '💎', rarity: 'legendary' },
    { id: 'ovr_95', name: '95 OVR', desc: '建号 OVR ≥ 95', icon: '🚀', rarity: 'legendary' },
    { id: 'season_complete', name: '赛季完成', desc: '完成完整单赛季', icon: '✅', rarity: 'common' }
  ];

  const ACH_MAP = {};
  ACHIEVEMENTS.forEach(a => { ACH_MAP[a.id] = a; });

  function loadAchievements() {
    try {
      return JSON.parse(localStorage.getItem(ACH_KEY) || '{}');
    } catch (e) { return {}; }
  }

  function saveAchievements(map) {
    try { localStorage.setItem(ACH_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
  }

  function unlock(id, toastFn) {
    const map = loadAchievements();
    if (map[id]) return false;
    map[id] = { at: Date.now() };
    saveAchievements(map);
    const def = ACH_MAP[id];
    if (def && toastFn) toastFn(`🏅 成就解锁：${def.name}`);
    return true;
  }

  function syncAchievements(state, toastFn) {
    if (!state || !state.career) return;
    const c = state.career;
    const s = state.season;
    if (s && s.wins >= 1) unlock('first_win', toastFn);
    if (c.ovr >= 95) unlock('ovr_95', toastFn);
    if (c.attrs13 && Object.values(c.attrs13).every(v => v >= 80)) unlock('complete_build', toastFn);
    if ((c.attributeSources || []).some(x => x.playerKind && x.playerKind.includes('传奇'))) unlock('legend_attr', toastFn);
    if (s && s.playerStats && s.playerStats.rating >= 1.30 && s.games && s.games.length >= 10) unlock('rating_130', toastFn);
    if (s && s.playerStats && s.playerStats.clutches >= 10) unlock('clutch_king', toastFn);
    if (s && s.playoffState) unlock('playoffs_run', toastFn);
    if (s && s.majorState) unlock('major_appear', toastFn);
    if (s && s.games) {
      let streak = 0, maxStreak = 0;
      s.games.forEach(g => { streak = g.win ? streak + 1 : 0; maxStreak = Math.max(maxStreak, streak); });
      if (maxStreak >= 5) unlock('win_streak_5', toastFn);
      if (s.games.some(g => g.kills >= 40)) unlock('forty_kills', toastFn);
    }
    (s && s.awards || []).forEach(a => {
      if (a.id === 'league_mvp' && a.isUser) unlock('league_mvp', toastFn);
      if (a.id === 'major_mvp' && a.isUser) unlock('major_mvp', toastFn);
      if (a.id === 'major_champion' && a.isUser) unlock('major_champion', toastFn);
      if (a.id === 'best_awp' && a.isUser) unlock('top_awp', toastFn);
      if (a.id === 'best_igl' && a.isUser) unlock('top_igl', toastFn);
      if (a.id === 'rising_star' && a.isUser) unlock('rising_star', toastFn);
      if (a.id === 'allstar_first' && a.isUser) unlock('allstar', toastFn);
    });
    if (c.singleSeasonComplete) unlock('season_complete', toastFn);

    const map = loadAchievements();
    const roles = map.__roles || {};
    if (c.role) { roles[c.role] = true; map.__roles = roles; saveAchievements(map); }
    if (Object.keys(roles).length >= 5) unlock('all_roles', toastFn);
  }

  window.CS2_ACH = { ACHIEVEMENTS, ACH_MAP, loadAchievements, unlock, syncAchievements };
})();
