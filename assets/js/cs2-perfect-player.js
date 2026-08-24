(function () {
  'use strict';

  const C = window.CS2;
  const SIM = window.CS2_SIM;
  const EVENTS = window.CS2_EVENTS;
  const AWARDS = window.CS2_AWARDS;
  const ACH = window.CS2_ACH;
  const RANK = window.CS2_RANKINGS;

  const SAVE_KEY = 'cs2PerfectPlayerSaveV1';
  const AVATAR_GROUPS = ['亚洲', '白人', '黑人'];
  let AVATAR_META = [];
  let activeAvatarGroup = AVATAR_GROUPS[0];
  const HS = window.CS2_HEADSHOTS;

  const SLOT = { ITEM_H: 38, COPIES: 5, spinning: false, built: false };

  const PP = {
    screen: 'menu', role: null, playerName: '', avatar: '',
    build: {
      team: null, drawPlayers: [], rerollsLeft: 3, swapsLeft: 3,
      selectedPlayer: null, lockedAttrs: {}, attrSlots: {}, lockCount: 0,
      usedPlayers: new Set(), sourceRoll: null, sourceHistory: [],
      mustLockAfterSpin: false, locking: false
    },
    attributePool: null, career: null, season: null, leagueReady: false, busy: false, adRerollsLeft: 3
  };
  window.PP = PP;

  function $(id) { return document.getElementById(id); }
  function parseNum(v, d) { return C.parseNum(v, d); }
  function clamp(v, a, b) { return C.clamp(v, a, b); }
  function esc(v) { return C.esc(v); }
  function pick(a) { return C.pick(a); }

  function ensureSeasonVrs(season) {
    if (!season || !RANK) return;
    if (!season.vrs) RANK.initSeasonVrs(season);
    if (!season.matchLog) season.matchLog = [];
    if (!season.eventStats) season.eventStats = {};
  }

  function formatStatsBlock(ps, label) {
    if (!ps || !ps.maps) return `<div class="my-stats-block"><div class="my-stats-label">${esc(label)}</div><div class="sub">暂无数据</div></div>`;
    const kd = ps.deaths ? (ps.kills / ps.deaths).toFixed(2) : '—';
    return `<div class="my-stats-block">
      <div class="my-stats-label">${esc(label)}</div>
      <div class="my-stats-grid">
        <div><span>Rating</span><b>${ps.rating || '—'}</b></div>
        <div><span>K/D/A</span><b>${ps.kills}/${ps.deaths}/${ps.assists}</b></div>
        <div><span>ADR</span><b>${ps.adr || '—'}</b></div>
        <div><span>K/D</span><b>${kd}</b></div>
        <div><span>地图</span><b>${ps.maps || 0}</b></div>
        <div><span>残局</span><b>${ps.clutches || 0}</b></div>
      </div>
    </div>`;
  }

  function renderMyStatsPanel(season) {
    const el = $('my-stats-panel');
    if (!el || !season) return;
    ensureSeasonVrs(season);
    const active = SIM.getActiveEvent(season);
    let eventBlock = '';
    if (active && season.eventStats && season.eventStats[active.id]) {
      eventBlock = formatStatsBlock(season.eventStats[active.id], `本赛事 · ${active.label}`);
    } else if (active && active.status === 'active') {
      eventBlock = `<div class="my-stats-block"><div class="my-stats-label">本赛事 · ${esc(active.label)}</div><div class="sub">你出场后将显示数据</div></div>`;
    }
    el.innerHTML = formatStatsBlock(season.playerStats, '赛季累计') + eventBlock;
  }

  function renderMatchLogPanel(season) {
    const el = $('match-log-panel');
    if (!el || !season) return;
    const log = season.matchLog || [];
    if (!log.length) {
      el.innerHTML = '<div class="match-log-empty sub">暂无比赛记录</div>';
      return;
    }
    el.innerHTML = log.slice(0, 8).map(m => {
      const opp = m.opponent ? C.teamMeta(m.opponent) : null;
      const oppName = opp ? (opp.nameCn || opp.name) : '';
      return `<div class="match-log-row ${m.win ? 'win' : 'loss'}">
        <div class="ml-main"><span class="ml-tag">${esc(m.label)}</span> ${esc(m.map)} ${m.win ? '胜' : '负'}${oppName ? ' vs ' + esc(oppName) : ''}${m.series ? ' · ' + esc(m.series) : ''}</div>
        <div class="ml-stat">${m.kills}/${m.deaths}/${m.assists} · ADR ${m.adr} · Rtg ${m.rating}</div>
      </div>`;
    }).join('');
  }

  function renderRankings(tab) {
    PP.rankTab = tab || PP.rankTab || 'teams';
    const s = PP.season;
    if (!s) return;
    ensureSeasonVrs(s);
    const content = $('rankings-content');
    if (!content) return;
    let html = `<div class="rank-tabs">
      <button type="button" class="rank-tab ${PP.rankTab === 'teams' ? 'active' : ''}" data-tab="teams">战队 VRS</button>
      <button type="button" class="rank-tab ${PP.rankTab === 'players' ? 'active' : ''}" data-tab="players">选手排名</button>
    </div>`;
    if (PP.rankTab === 'teams') {
      const teams = RANK.sortedTeamVrs(s);
      const userTeam = PP.career.teamId;
      html += `<div class="rank-list">${teams.slice(0, 30).map((t, i) => {
        const isUser = t.team === userTeam;
        return `<div class="rank-row ${isUser ? 'user' : ''}">
          <span class="rank-num">#${i + 1}</span>
          ${C.teamLogoHtml(t.meta, 24)}
          <span class="rank-name">${esc(t.meta.nameCn || t.meta.name)}${isUser ? ' <b class="you">你</b>' : ''}</span>
          <span class="rank-val">${t.vrs} VRS</span>
          <span class="rank-sub">Valve #${t.valveRank || '—'}</span>
        </div>`;
      }).join('')}</div>`;
      const ur = RANK.userTeamVrsRank(s, userTeam);
      html += `<div class="rank-foot sub">你的战队 VRS 排名：${ur ? '#' + ur : '—'} · 积分 ${s.vrs[userTeam] || '—'}</div>`;
    } else {
      const players = RANK.buildPlayerRankings({ career: PP.career, season: s });
      html += `<div class="rank-list">${players.slice(0, 30).map((p, i) => {
        const tm = C.teamMeta(p.team);
        return `<div class="rank-row ${p.isUser ? 'user' : ''}">
          <span class="rank-num">#${i + 1}</span>
          <span class="rank-name">${p.isUser ? '⭐ ' : ''}${esc(p.name)}</span>
          <span class="rank-sub">${esc(tm.nameCn || tm.name)} · ${p.role}</span>
          <span class="rank-val">OVR ${p.ovr}</span>
          <span class="rank-sub">Rtg ${p.rating || '—'}</span>
        </div>`;
      }).join('')}</div>`;
      const pr = RANK.userPlayerRank({ career: PP.career, season: s });
      html += `<div class="rank-foot sub">你的选手排名：${pr ? '#' + pr : '—'} · 赛季 Rating ${s.playerStats.rating || '—'}</div>`;
    }
    content.innerHTML = html;
    Array.from(content.querySelectorAll('.rank-tab')).forEach(btn => {
      btn.onclick = () => renderRankings(btn.dataset.tab);
    });
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), career: PP.career, season: PP.season }));
    } catch (e) { /* ignore */ }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.career ? data : null;
    } catch (e) { return null; }
  }

  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

  async function ensureLeague() {
    if (PP.leagueReady && C.LEAGUE.loaded) return;
    showToast('正在加载 CS2 联赛数据…');
    await C.loadLeagueData();
    PP.attributePool = C.LEAGUE.pool;
    PP.leagueReady = true;
  }

  function sourcePoolTeams() { return PP.attributePool && PP.attributePool.teams; }

  function sourcePlayerKey(p) {
    return playerIdentityKey(p);
  }

  function playerIdentityKey(p) {
    if (!p) return '';
    return `${p.teamId}:${p.name}`;
  }

  function drawCardKey(p) {
    if (!p) return '';
    return `${p.teamId}:${p.name}:${p.role || ''}`;
  }

  function dedupePlayersByName(players) {
    const seen = new Map();
    players.forEach(p => {
      const k = playerIdentityKey(p);
      const prev = seen.get(k);
      const ovr = p.ovr || C.calcOVR(playerAttrs13(p), p.role);
      if (!prev || ovr > (prev.ovr || 0)) seen.set(k, p);
    });
    return Array.from(seen.values());
  }

  function sourceKindLabel() {
    return '现役';
  }

  function getRolePenalty(userRole, srcRole, key) {
    const srcAvg = C.ROLE_AVG[srcRole] && C.ROLE_AVG[srcRole][key];
    const userAvg = C.ROLE_AVG[userRole] && C.ROLE_AVG[userRole][key];
    if (!srcAvg || srcAvg <= 0) return 1;
    return Math.min(1, userAvg / srcAvg);
  }

  function buildReset() {
    PP.build = {
      team: null, drawPlayers: [], rerollsLeft: 3, swapsLeft: 3,
      selectedPlayer: null, lockedAttrs: {}, attrSlots: {}, lockCount: 0,
      usedPlayers: new Set(), sourceRoll: null, sourceHistory: [],
      mustLockAfterSpin: false, locking: false
    };
    PP.adRerollsLeft = 3;
    SLOT.built = false;
    SLOT.spinning = false;
  }

  function getTeamPool(teamId) {
    const pool = sourcePoolTeams();
    if (!pool || !pool[teamId]) return [];
    return pool[teamId].players || [];
  }

  function drawBuildPlayers(teamId, count) {
    const uniqueCurrent = dedupePlayersByName(getTeamPool(teamId));
    const source = C.shuffle(uniqueCurrent.slice()).filter(p => !PP.build.usedPlayers.has(playerIdentityKey(p)));
    return source.slice(0, Math.min(count || 5, source.length));
  }

  async function loadAvatarManifest() {
    if (AVATAR_META.length) return;
    try {
      const res = await fetch('assets/data/character-avatar-manifest.json');
      if (res.ok) {
        const data = await res.json();
        AVATAR_META = (data.avatars || []).map(a => ({
          id: a.id, group: a.group, color: a.color, tone: a.tone, src: a.photoLocal
        }));
      }
    } catch (e) { /* ignore */ }
    if (!AVATAR_META.length) {
      AVATAR_GROUPS.forEach((group, gi) => {
        for (let i = 0; i < 6; i++) {
          AVATAR_META.push({
            id: `avatar-${gi * 6 + i + 1}`, group,
            color: '#ff6b35', tone: '默认', src: ''
          });
        }
      });
    }
  }

  function sortedTeamIds() {
    const pool = sourcePoolTeams();
    if (!pool) return [];
    return Object.keys(pool).sort((a, b) => {
      const ma = C.teamMeta(a), mb = C.teamMeta(b);
      return String(ma.nameCn || ma.name).localeCompare(String(mb.nameCn || mb.name));
    });
  }

  function pickSpinTargets() {
    const pool = sourcePoolTeams();
    if (!pool) return null;
    const eligible = Object.keys(pool).filter(id => (pool[id].players || []).length >= 5);
    if (!eligible.length) return null;
    let id = pick(eligible);
    let guard = 0;
    while (id === PP.build.team && eligible.length > 1 && guard++ < 8) id = pick(eligible);
    return { teamId: id };
  }

  function applySpinResult(target) {
    if (!target) return null;
    PP.build.team = target.teamId;
    PP._teamsVisited = PP._teamsVisited || [];
    if (!PP._teamsVisited.includes(target.teamId)) PP._teamsVisited.push(target.teamId);
    PP.build.drawPlayers = drawBuildPlayers(target.teamId, 5);
    PP.build.swapsLeft = 3;
    PP.build.selectedPlayer = null;
    PP.build.mustLockAfterSpin = true;
    PP.build.sourceRoll = { teamId: target.teamId };
    return PP.build.drawPlayers;
  }

  function spinTeam(opts) {
    const pool = sourcePoolTeams();
    if (!pool) return null;
    if (PP.build.mustLockAfterSpin && !(opts && opts.force)) {
      showToast('请先选择选手并锁定一项属性');
      return null;
    }
    const target = pickSpinTargets();
    if (!target) return null;
    if (opts && opts.animate === false) {
      applySpinResult(target);
      if (SLOT.built) highlightSpinResult(target);
      return PP.build.drawPlayers;
    }
    runSlotSpin(target);
    return target;
  }

  function buildReelHtml(items, dataKey) {
    const all = [];
    for (let c = 0; c < SLOT.COPIES; c++) items.forEach(it => all.push(it));
    return all.map(it =>
      `<div class="br-slot-item" data-${dataKey}="${esc(it.id)}">${esc(it.label)}</div>`
    ).join('');
  }

  function highlightSlotItem(reelId, middleIndex) {
    const reel = $(reelId);
    if (!reel) return;
    reel.querySelectorAll('.br-slot-item.highlight').forEach(el => el.classList.remove('highlight'));
    const items = reel.querySelectorAll('.br-slot-item');
    if (items[middleIndex]) items[middleIndex].classList.add('highlight');
  }

  function initReelPosition(reelId, sortedItems, targetId) {
    const reel = $(reelId);
    if (!reel) return;
    const idx = Math.max(0, sortedItems.findIndex(it => it.id === targetId));
    const snapIdx = (idx - 1 + sortedItems.length) % sortedItems.length;
    const copyLen = sortedItems.length * SLOT.ITEM_H;
    const offset = copyLen + snapIdx * SLOT.ITEM_H;
    reel.style.transition = 'none';
    reel.style.transform = `translateY(-${offset}px)`;
    void reel.offsetHeight;
    reel.style.transition = '';
    highlightSlotItem(reelId, sortedItems.length + snapIdx + 1);
  }

  function animateReel(reelId, sortedItems, targetId, done) {
    const reel = $(reelId);
    if (!reel) { if (done) done(); return; }
    const teamCount = sortedItems.length;
    const copyLen = teamCount * SLOT.ITEM_H;
    const targetIdx = Math.max(0, sortedItems.findIndex(it => it.id === targetId));
    const snapIdx = (targetIdx - 1 + teamCount) % teamCount;
    const targetY = copyLen * 2 + snapIdx * SLOT.ITEM_H;
    const curMatch = reel.style.transform.match(/([\d.]+)/);
    const curY = curMatch ? parseFloat(curMatch[1]) : copyLen;
    let finalY = targetY;
    const minSpin = copyLen * 0.5;
    while (finalY <= curY + minSpin) finalY += copyLen;
    const maxY = copyLen * 4 - SLOT.ITEM_H * 2;
    if (finalY > maxY) {
      reel.style.transition = 'none';
      reel.style.transform = `translateY(-${copyLen}px)`;
      void reel.offsetHeight;
      reel.style.transition = '';
      finalY = targetY + copyLen;
    }
    reel.classList.add('spinning');
    reel.style.transform = `translateY(-${finalY}px)`;
    setTimeout(() => {
      reel.classList.remove('spinning');
      const exactY = copyLen * 3 + snapIdx * SLOT.ITEM_H;
      reel.style.transition = 'none';
      reel.style.transform = `translateY(-${exactY}px)`;
      void reel.offsetHeight;
      reel.style.transition = '';
      highlightSlotItem(reelId, teamCount * 3 + snapIdx + 1);
      if (done) done();
    }, 2800);
  }

  function highlightSpinResult(target) {
    const teams = sortedTeamIds().map(id => {
      const m = C.teamMeta(id);
      return { id, label: m.nameCn || m.name };
    });
    initReelPosition('slot-reel-team', teams, target.teamId);
  }

  function runSlotSpin(target) {
    if (SLOT.spinning) return;
    SLOT.spinning = true;
    updateSlotButtons();
    const teams = sortedTeamIds().map(id => {
      const m = C.teamMeta(id);
      return { id, label: m.nameCn || m.name };
    });
    const teamReel = $('slot-reel-team');
    if (teamReel) teamReel.classList.add('spinning');
    animateReel('slot-reel-team', teams, target.teamId, () => {
      if (teamReel) teamReel.classList.remove('spinning');
      applySpinResult(target);
      SLOT.spinning = false;
      updateSlotResultPanel();
      updateSlotButtons();
      renderLeftAttrs();
      renderRosterArea();
      showToast(C.teamMeta(target.teamId).nameCn || target.teamId);
    });
  }

  function pullHandle() {
    if (SLOT.spinning || PP.build.mustLockAfterSpin) return;
    spinTeam({ animate: true });
  }

  function getRerollPlayersBtnHtml() {
    const b = PP.build;
    const hasTeam = !!b.team;
    if (b.swapsLeft > 0) {
      return `<button type="button" class="btn btn-sm slot-btn" id="btn-swap-slot" ${hasTeam ? '' : 'disabled'}>🔄 换一批 (${b.swapsLeft})</button>`;
    }
    if (PP.adRerollsLeft <= 0) {
      return `<button type="button" class="btn btn-sm slot-btn" disabled>📺 广告重选已用完</button>`;
    }
    return `<button type="button" class="btn btn-sm slot-btn" id="btn-ad-slot" ${hasTeam ? '' : 'disabled'} style="background:linear-gradient(135deg,#3a2a1a,#2a2015);color:#f5d060;border-color:#d4af37;">📺 广告重选 (${PP.adRerollsLeft})</button>`;
  }

  function updateSlotButtons() {
    const area = $('br-slot-area');
    if (!area) return;
    const actions = area.querySelector('.br-slot-actions');
    const warn = area.querySelector('.br-slot-warn');
    const canSpin = !PP.build.mustLockAfterSpin && !SLOT.spinning;
    if (actions) {
      actions.innerHTML = `
        <button type="button" class="btn btn-sm slot-btn" id="btn-pull-handle" ${canSpin ? '' : 'disabled'} style="background:var(--orange);color:#fff;${canSpin ? '' : 'opacity:.35;'}">🎲 随机战队</button>
        ${getRerollPlayersBtnHtml()}`;
      bindSlotActionButtons();
    }
    if (warn) {
      warn.textContent = PP.build.mustLockAfterSpin ? '⚠️ 先选择选手并锁定属性才能再次随机' : '';
    }
  }

  function bindSlotActionButtons() {
    const pull = $('btn-pull-handle');
    if (pull) pull.onclick = pullHandle;
    const swap = $('btn-swap-slot');
    if (swap) swap.onclick = () => { rerollTeamPlayers(); renderBuild(); };
    const ad = $('btn-ad-slot');
    if (ad) ad.onclick = () => { adRerollTeam(); renderBuild(); };
  }

  function updateSlotResultPanel() {
    const panel = $('slot-result-panel');
    if (!panel) return;
    const b = PP.build;
    if (!b.team) { panel.innerHTML = ''; return; }
    const meta = C.teamMeta(b.team);
    const remaining = C.ATTR_KEYS.filter(k => b.lockedAttrs[k] == null).length;
    const selectedName = b.selectedPlayer ? b.selectedPlayer.name : '待选择';
    const selectedSource = b.selectedPlayer
      ? `${sourceKindLabel()} · ${b.selectedPlayer.role || 'Entry'}`
      : '现役名单';
    panel.innerHTML = `
      <div class="slot-result-card">
        <div class="slot-team">
          ${C.teamLogoHtml(meta, 44).replace('tp-logo', 'slot-logo tp-logo')}
          <div>
            <div class="slot-team-name">${esc(meta.nameCn || meta.name)}</div>
            <div class="slot-team-sub">现役选手 · 还需锁定 ${remaining} 项</div>
          </div>
        </div>
        <div class="slot-source-chain">
          <span class="source-chip">战队 ${esc(meta.nameCn || meta.name)}</span><b>→</b>
          <span class="source-chip">选手 ${esc(selectedName)}</span>
        </div>
        <div class="slot-source-note">来源：${esc(selectedSource)}</div>
        <div class="slot-hint">${b.selectedPlayer ? `已选择 ${esc(b.selectedPlayer.name)}，点击左侧属性锁定，或 <button type="button" class="link-btn" id="btn-open-lock">查看全部属性</button>` : '👆 选择一名选手，再锁定一项属性'}</div>
      </div>`;
    const openLock = $('btn-open-lock');
    if (openLock) openLock.onclick = () => openAttrLockModal(b.selectedPlayer);
  }

  function renderTeamPicker() {
    const box = $('br-slot-area');
    if (!box) return;
    const teams = sortedTeamIds().map(id => {
      const m = C.teamMeta(id);
      return { id, label: m.nameCn || m.name };
    });
    const canSpin = !PP.build.mustLockAfterSpin && !SLOT.spinning;
    box.innerHTML = `
      <div class="br-slot-area-inner">
        <div class="br-slot-label">🎰 随机战队</div>
        <div class="br-slot-single">
          <div class="br-slot-col">
            <div class="br-slot-col-label">战队</div>
            <div class="br-slot-wrapper">
              <div class="br-slot-machine">
                <div class="br-slot-reel" id="slot-reel-team">${buildReelHtml(teams, 'team')}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="br-slot-actions">
          <button type="button" class="btn btn-sm slot-btn" id="btn-pull-handle" ${canSpin ? '' : 'disabled'} style="background:var(--orange);color:#fff;${canSpin ? '' : 'opacity:.35;'}">🎲 随机战队</button>
          ${getRerollPlayersBtnHtml()}
        </div>
        <div class="br-slot-warn">${PP.build.mustLockAfterSpin ? '⚠️ 先选择选手并锁定属性才能再次随机' : ''}</div>
        <div id="slot-result-panel"></div>
      </div>`;
    SLOT.built = true;
    bindSlotActionButtons();
    if (PP.build.team && PP.build.sourceRoll) {
      highlightSpinResult({ teamId: PP.build.team });
    } else if (teams.length) {
      initReelPosition('slot-reel-team', teams, teams[0].id);
    }
    updateSlotResultPanel();
  }

  function rerollTeamPlayers() {
    if (!PP.build.team || PP.build.swapsLeft <= 0) return;
    PP.build.swapsLeft--;
    PP.build.drawPlayers = drawBuildPlayers(PP.build.team, 5);
    PP.build.selectedPlayer = null;
    showToast('已换一批选手');
  }

  function adRerollTeam() {
    if (PP.adRerollsLeft <= 0 || !PP.build.team) return;
    PP.adRerollsLeft--;
    PP.build.drawPlayers = drawBuildPlayers(PP.build.team, 5);
    PP.build.selectedPlayer = null;
    showToast('广告重选完成');
  }

  function pickPlayerAt(index) {
    const p = PP.build.drawPlayers[index];
    if (!p || PP.build.usedPlayers.has(playerIdentityKey(p))) return;
    PP.build.selectedPlayer = p;
    renderBuild();
  }

  function swapPlayer() {
    if (!PP.build.drawPlayers.length || PP.build.swapsLeft <= 0) return null;
    rerollTeamPlayers();
    return PP.build.selectedPlayer;
  }

  function playerAttrs13(p) {
    return p.attrs13 || C.attrsToThirteen(p.attrs || {});
  }

  function playerHeadshotHtml(p, size) {
    if (HS && HS.headshotHtml) return HS.headshotHtml(p, size || 32);
    const s = size || 32;
    const initial = (p.name || '?').slice(0, 1).toUpperCase();
    const bg = C.teamMeta(p.teamId).color || '#334155';
    return `<div class="bp-headshot" style="width:${s}px;height:${s}px;background:linear-gradient(145deg,${bg},#111827);">${initial}</div>`;
  }

  function openAttrLockModal(p) {
    if (!p) return;
    const avail = C.ATTR_KEYS.filter(k => PP.build.lockedAttrs[k] == null);
    if (!avail.length) return;
    const srcRole = p.role || 'Entry';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-content">
      <div class="modal-header"><span class="help-title">锁定属性 · ${esc(p.name)}</span><button class="modal-close" type="button">✕</button></div>
      <div class="attr-lock-grid">${avail.map(k => {
        const raw = parseNum(playerAttrs13(p)[k], 55);
        const pen = getRolePenalty(PP.role, srcRole, k);
        const val = clamp(Math.round(raw * pen), 25, 99);
        const g = C.getGrade(val);
        return `<button class="attr-lock-cell" type="button" data-k="${k}">
          <div class="alc-name">${C.ATTR_CN[k]}</div>
          <div class="alc-val">${val}</div>
          <div class="alc-grade" style="color:${g.color}">${g.letter}${pen < 1 ? ' ↓' : ''}</div>
        </button>`;
      }).join('')}</div>
      <div class="slot-hint" style="margin-top:10px;">跨角色属性会按均值比例衰减（↓ 标记）。也可直接点击左侧属性栏锁定。</div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    Array.from(overlay.querySelectorAll('.attr-lock-cell')).forEach(cell => {
      cell.onclick = () => { close(); lockAttr(cell.dataset.k); };
    });
  }

  function lockAttr(key) {
    const b = PP.build;
    if (b.locking || b.lockedAttrs[key] != null) return;
    const p = b.selectedPlayer;
    if (!p) { showToast('请先选择一名选手'); return; }
    b.locking = true;
    const srcRole = p.role || 'Entry';
    const raw = parseNum(playerAttrs13(p)[key], parseNum(p.ovr, 60));
    const pen = getRolePenalty(PP.role, srcRole, key);
    const val = clamp(Math.round(raw * pen), 25, 99);
    b.lockedAttrs[key] = val;
    b.attrSlots[key] = { playerName: p.name, playerKind: sourceKindLabel(p), value: val, raw, penalty: pen };
    b.usedPlayers.add(playerIdentityKey(p));
    b.sourceHistory.push({
      attrKey: key, attrName: C.ATTR_CN[key], value: val, playerName: p.name,
      playerKind: sourceKindLabel(p), teamId: b.team, penalty: pen
    });
    b.lockCount = Object.keys(b.lockedAttrs).length;
    b.selectedPlayer = null;
    b.mustLockAfterSpin = false;
    const penTxt = pen < 1 ? `（跨角色衰减 ${Math.round((1 - pen) * 100)}%）` : '';
    showToast(`${C.ATTR_CN[key]} 已锁定：${val} ${penTxt}`);
    b.locking = false;
    if (b.lockCount >= C.ATTR_KEYS.length) {
      setTimeout(revealPlayer, 500);
      return;
    }
    spinTeam({ animate: true });
    if (!SLOT.spinning) renderBuild();
  }

  function findSimilarPlayers(attrs13, role) {
    const pool = sourcePoolTeams();
    if (!pool) return [];
    const avg = C.ROLE_AVG[role] || C.ROLE_AVG.Entry;
    const myZ = {};
    C.ATTR_KEYS.forEach(k => { myZ[k] = parseNum(attrs13[k], 55) - avg[k]; });
    const normMy = Math.sqrt(C.ATTR_KEYS.reduce((s, k) => s + myZ[k] * myZ[k], 0)) || 1;
    const scored = [];
    Object.keys(pool).forEach(tid => {
      (pool[tid].players || []).slice(0, 8).forEach(p => {
        const t13 = p.attrs13 || C.attrsToThirteen(p.attrs || {});
        let dot = 0, normO = 0;
        C.ATTR_KEYS.forEach(k => { const z = parseNum(t13[k], 55) - avg[k]; dot += myZ[k] * z; normO += z * z; });
        normO = Math.sqrt(normO) || 1;
        scored.push({ player: p, sim: Math.round(dot / (normMy * normO) * 100) });
      });
    });
    return scored.sort((a, b) => b.sim - a.sim).slice(0, 3);
  }

  function revealPlayer() {
    const b = PP.build;
    const attrs13 = {};
    C.ATTR_KEYS.forEach(k => { attrs13[k] = b.lockedAttrs[k]; });
    const ovr = C.calcOVR(attrs13, PP.role);
    PP.career = {
      playerName: PP.playerName || '我的选手', avatar: PP.avatar, role: PP.role,
      attrs13, attrs10: C.thirteenToMatch(attrs13), ovr,
      archetype: C.matchArchetype(attrs13, PP.role),
      similar: findSimilarPlayers(attrs13, PP.role),
      attributeSources: b.sourceHistory.slice(),
      teamId: null, age: 20, currentYear: 2026, seasonCount: 0, singleSeasonComplete: false,
      retired: false, careerHistory: [],
      totalStats: C.emptyStats(), honors: [], profile: {
        fame: 5, businessValue: 0, mediaTrust: 40, controversy: 0, chinaPopularity: 0,
        loyalty: 50, leadership: 30, coachTrust: 50, lockerRoomTrust: 50, fanSupport: 40
      },
      seasonMods: { formVariance: 0, mediaPressure: 0 }, currentStamina: 100
    };
    PP.season = null;
    saveGame();
    renderReveal();
    showScreen('screen-reveal');
  }

  function beginCareer() {
    if (!PP.career.teamId) { showToast('请选择战队'); return; }
    PP.season = SIM.initSeason(PP.career);
    ensureSeasonVrs(PP.season);
    saveGame();
    renderSeason();
    showScreen('screen-season');
  }

  function simNextGame() {
    if (PP.busy) return;
    const s = PP.season;
    const c = PP.career;
    if (s.phase !== 'league') return;
    const idx = s.games.length;
    if (idx >= C.LEAGUE_GAMES) return;
    const match = s.schedule[idx];
    PP.busy = true;
    const game = SIM.simBO1(c.teamId, match.opponent, c.teamId, c);
    game.index = idx;
    game.type = match.type;
    SIM.applyGameResult(s, c, game);
    c.currentStamina = clamp(parseNum(c.currentStamina, 100) - 4, 0, 100);
    maybeTriggerEvent();
    saveGame();
    PP.busy = false;
    renderSeason();
    renderMyStatsPanel(s);
    renderMatchLogPanel(s);
    if (game.kills >= 40) ACH.unlock('forty_kills', showToast);
  }

  function simBatch(n) {
    for (let i = 0; i < n; i++) {
      if (PP.season.phase !== 'league' || PP.season.games.length >= C.LEAGUE_GAMES) break;
      simNextGame();
    }
  }

  function enterEventCalendar() {
    SIM.initEventCalendar(PP.season, PP.career.teamId);
    PP.playoffView = { stage: 'calendar', roundIdx: 0 };
    saveGame();
    renderPlayoffs();
    showScreen('screen-playoffs');
  }

  function simEventStepUI() {
    const s = PP.season;
    const res = SIM.simEventStep(s, PP.career.teamId, PP.career);
    const ev = SIM.getActiveEvent(s);
    if (ev && ev.status === 'complete') {
      SIM.advanceToNextEvent(s, PP.career.teamId);
      if (s.phase === 'complete') {
        finishSeason();
        return;
      }
      showToast(`${ev.label} 结束`);
    } else if (res.message) {
      showToast(res.message);
    }
    saveGame();
    renderPlayoffs();
    renderMyStatsPanel(PP.season);
    renderMatchLogPanel(PP.season);
  }

  function simCurrentEventComplete() {
    const s = PP.season;
    SIM.simEventComplete(s, PP.career.teamId, PP.career);
    if (s.phase === 'complete') {
      finishSeason();
      return;
    }
    saveGame();
    renderPlayoffs();
    renderMyStatsPanel(s);
    renderMatchLogPanel(s);
    showToast('本赛事已模拟完毕');
  }

  function simAllEventsUI() {
    const s = PP.season;
    SIM.simAllRemainingEvents(s, PP.career.teamId, PP.career);
    if (s.phase === 'complete') {
      finishSeason();
      return;
    }
    saveGame();
    renderPlayoffs();
    showToast('全部赛事已快速模拟');
  }

  function applyAgeEffects(c) {
    if (c.age <= 28) return [];
    const notes = [];
    const decline = c.age >= 36 ? 2 : (c.age >= 32 ? 1 : 0);
    if (decline > 0) {
      ['REFL', 'SPRY', 'ENTR'].forEach(k => {
        if (Math.random() < 0.55) {
          const before = c.attrs13[k];
          c.attrs13[k] = clamp(parseNum(c.attrs13[k], 55) - decline, 25, 99);
          if (c.attrs13[k] < before) notes.push(`${C.ATTR_CN[k]} -${before - c.attrs13[k]}`);
        }
      });
      c.attrs10 = C.thirteenToMatch(c.attrs13);
      c.ovr = C.calcOVR(c.attrs13, c.role);
    }
    return notes;
  }

  function startNextSeason() {
    const c = PP.career;
    if (!c || c.retired) return;
    if (c.age >= 40) {
      c.retired = true;
      renderRetirement();
      showScreen('screen-results');
      saveGame();
      return;
    }
    c.age += 1;
    c.currentYear = parseNum(c.currentYear, 2026) + 1;
    if (c.age >= 40) {
      c.retired = true;
      renderRetirement();
      showScreen('screen-results');
      saveGame();
      return;
    }
    const ageNotes = applyAgeEffects(c);
    c.singleSeasonComplete = false;
    PP.season = SIM.initSeason(c);
    ensureSeasonVrs(PP.season);
    saveGame();
    if (ageNotes.length) showToast(`新赛季 · 年龄 ${c.age} · ${ageNotes.join(' ')}`);
    else showToast(`${c.currentYear} 赛季开始 · 年龄 ${c.age}`);
    renderSeason();
    showScreen('screen-season');
  }

  function renderRetirement() {
    const c = PP.career;
    const hist = (c.careerHistory || []).map(h =>
      `<div class="similar-row"><span>${h.year}</span><span>${h.wins}-${h.losses} · Rating ${h.rating}</span></div>`
    ).join('');
    $('results-content').innerHTML = `
      <h2>职业生涯结束</h2>
      <p>${esc(c.playerName)} · ${c.role} · 退役年龄 ${c.age}</p>
      <p>共征战 ${c.seasonCount} 个赛季 · 最终 OVR ${c.ovr}</p>
      <div class="similar-title">赛季回顾</div>${hist || '<p>暂无记录</p>'}`;
    $('awards-list-results').innerHTML = '';
    const btn = $('btn-next-season');
    if (btn) btn.style.display = 'none';
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function finishSeason() {
    const c = PP.career;
    const s = PP.season;
    c.seasonCount = parseNum(c.seasonCount, 0) + 1;
    c.careerHistory = c.careerHistory || [];
    c.careerHistory.push({
      year: parseNum(s.year, c.currentYear || 2026),
      wins: s.wins, losses: s.losses,
      rating: round2(parseNum(s.playerStats && s.playerStats.rating, 0)),
      teamId: c.teamId,
      events: (s.eventCalendar || []).filter(e => e.status === 'complete').map(e => ({
        id: e.id, label: e.label, champion: e.champion, userPlaced: e.userPlaced
      })),
      major: (s.eventCalendar || []).find(e => e.id === 'major' && e.champion)?.champion || (s.majorState && s.majorState.champion) || null
    });
    PP.season.awards = AWARDS.computeSeasonAwards({ career: PP.career, season: PP.season });
    PP.career.singleSeasonComplete = true;
    PP.career.honors = PP.career.honors.concat(PP.season.awards.filter(a => a.isUser).map(a => a.label));
    saveGame();
    ACH.syncAchievements({ career: PP.career, season: PP.season }, showToast);
    showAwardsScreen();
  }

  function maybeTriggerEvent() {
    const s = PP.season;
    if (!EVENTS.shouldTrigger(s)) return;
    const ev = EVENTS.pickEvent(s, s.eventLog.recent);
    showEventModal(ev);
    s.eventLog.count++;
    s.eventLog.lastGame = s.games.length;
    s.eventLog.recent.push(ev.id);
    if (s.eventLog.recent.length > 40) s.eventLog.recent.shift();
  }

  function applyEventEffects(effects) {
    const c = PP.career;
    if (!effects) return [];
    const deltas = [];
    Object.keys(effects).forEach(k => {
      const v = effects[k];
      if (C.ATTR_CN[k]) {
        c.attrs13[k] = clamp(parseNum(c.attrs13[k], 55) + v, 25, 99);
        c.attrs10 = C.thirteenToMatch(c.attrs13);
        c.ovr = C.calcOVR(c.attrs13, c.role);
        deltas.push(`${C.ATTR_CN[k]} ${v > 0 ? '+' : ''}${v}`);
      } else if (k === 'stamina') {
        c.currentStamina = clamp(parseNum(c.currentStamina, 100) + v, 0, 100);
        deltas.push(`体力 ${v > 0 ? '+' : ''}${v}`);
      } else if (c.profile && k in c.profile) {
        c.profile[k] = clamp(parseNum(c.profile[k], 50) + v, 0, 100);
        deltas.push(`${k} ${v > 0 ? '+' : ''}${v}`);
      } else if (k === 'mediaPressure' && c.seasonMods) {
        c.seasonMods.mediaPressure = parseNum(c.seasonMods.mediaPressure, 0) + v;
        deltas.push(`媒体压力 ${v > 0 ? '+' : ''}${v}`);
      }
    });
    return deltas;
  }

  function showEventModal(ev) {
    $('event-title').textContent = ev.title;
    $('event-body').textContent = ev.scene;
    $('event-choices').innerHTML = ev.choices.map((ch, i) =>
      `<button class="event-choice" data-i="${i}"><div class="ec-label">${esc(ch.label)}</div><div class="ec-hint">${esc(ch.hint || '')}</div></button>`
    ).join('');
    $('eventModal').style.display = 'flex';
    Array.from($('event-choices').children).forEach(btn => {
      btn.onclick = () => {
        const ch = ev.choices[parseNum(btn.dataset.i, 0)];
        const deltas = applyEventEffects(ch.effects);
        $('eventModal').style.display = 'none';
        showToast(deltas.length ? `事件：${deltas.join('，')}` : '事件已处理');
        saveGame();
        renderSeason();
      };
    });
  }

  const SCREENS = ['screen-menu', 'screen-character', 'screen-role', 'screen-build', 'screen-reveal', 'screen-team', 'screen-season', 'screen-playoffs', 'screen-rankings', 'screen-awards', 'screen-results', 'screen-mycard'];

  function showScreen(id) {
    SCREENS.forEach(s => { const el = $(s); if (el) el.classList.toggle('active', s === id); });
    PP.screen = id;
  }

  let toastTimer;
  function showToast(msg) {
    const el = $('pp-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function renderMenu() {
    const c = PP.career;
    const cont = $('btn-continue');
    if (cont) {
      cont.style.display = c ? 'inline-flex' : 'none';
      cont.textContent = c ? (c.retired ? `生涯已结束（${c.playerName}）` : c.singleSeasonComplete ? `赛季总结（${c.playerName} · ${c.age}岁 · OVR ${c.ovr}）` : `继续（${c.playerName} · ${c.age}岁 · OVR ${c.ovr}）`) : '';
    }
  }

  function getAvatarMeta() {
    return AVATAR_META.find(a => String(a.id) === String(PP.avatar)) || AVATAR_META[0] || { color: '#ff6b35', src: '', tone: '?' };
  }

  function renderCharacter() {
    const tabs = $('char-avatar-tabs');
    const grid = $('char-avatar-grid');
    tabs.innerHTML = AVATAR_GROUPS.map(g =>
      `<button type="button" class="character-avatar-tab ${g === activeAvatarGroup ? 'active' : ''}" data-group="${g}">${g} · 6</button>`
    ).join('');
    Array.from(tabs.children).forEach(btn => {
      btn.onclick = () => { activeAvatarGroup = btn.dataset.group; renderCharacter(); };
    });
    const visible = AVATAR_META.filter(a => a.group === activeAvatarGroup);
    grid.innerHTML = visible.map(a => `
      <button type="button" class="character-avatar ${String(PP.avatar) === String(a.id) ? 'selected' : ''}" data-av="${esc(a.id)}" data-avatar="${esc(a.src || '')}">
        ${a.src ? `<img src="${esc(a.src)}" alt="${esc(a.group)}">` : `<span class="av-icon">?</span>`}
      </button>`).join('');
    Array.from(grid.children).forEach(el => {
      el.onclick = () => {
        PP.avatar = el.dataset.av;
        const err = $('char-error'); if (err) err.textContent = '';
        updateCharPreview();
        renderCharacter();
      };
    });
    $('char-name-input').value = PP.playerName || '';
    $('char-name-input').oninput = e => {
      PP.playerName = e.target.value.trim();
      const err = $('char-error'); if (err) err.textContent = '';
      updateCharPreview();
    };
    updateCharPreview();
  }

  function updateCharPreview() {
    const preview = $('char-preview');
    const meta = getAvatarMeta();
    if (PP.avatar !== '' && PP.avatar != null && meta && meta.src) {
      preview.style.background = '';
      preview.innerHTML = `<img src="${esc(meta.src)}" alt="preview">`;
    } else if (PP.avatar !== '' && PP.avatar != null) {
      preview.innerHTML = '';
      preview.style.background = `radial-gradient(circle at 50% 115%, ${meta.color || '#ff6b35'}66, transparent 48%), linear-gradient(160deg, #2a3448, #111827)`;
      preview.textContent = (PP.playerName || '?').slice(0, 1) || '?';
    } else {
      preview.innerHTML = '';
      preview.style.background = '';
      preview.textContent = (PP.playerName || '?').slice(0, 1) || '?';
    }
  }

  function renderRole() {
    const roleDesc = {
      IGL: '战术指挥 · 沟通与意识权重高',
      AWP: '狙击专精 · 枪法与残局',
      Entry: '突破开路 · 反应与首杀',
      Lurk: '侧翼绕后 · 信息与时机',
      Support: '道具协作 · 团队粘合'
    };
    $('role-grid').innerHTML = C.ROLE_LIST.map(r =>
      `<div class="role-card ${PP.role === r ? 'sel' : ''}" data-role="${r}">
        <div class="role-en">${r}</div>
        <div class="role-name">${C.ROLES[r]}</div>
        <div class="role-desc">${roleDesc[r] || ''}</div>
      </div>`
    ).join('');
    Array.from($('role-grid').children).forEach(el => {
      el.onclick = () => { PP.role = el.dataset.role; $('btn-confirm-role').disabled = false; renderRole(); };
    });
    $('btn-confirm-role').disabled = !PP.role;
  }

  function calcBuildOvr() {
    const b = PP.build;
    if (!PP.role) return 0;
    const w = C.OVR_WEIGHTS[PP.role];
    let lockedSum = 0, lockedWeight = 0;
    C.ATTR_KEYS.forEach(k => {
      const val = b.lockedAttrs[k];
      const weight = w[k] || 0.07;
      if (val != null) { lockedSum += val * weight; lockedWeight += weight; }
    });
    if (!lockedWeight) return 0;
    const fillAvg = lockedSum / lockedWeight;
    let total = 0;
    C.ATTR_KEYS.forEach(k => {
      const val = b.lockedAttrs[k] != null ? b.lockedAttrs[k] : Math.round(fillAvg);
      total += val * (w[k] || 0.07);
    });
    return Math.round(total);
  }

  function renderLeftAttrs() {
    const b = PP.build;
    const container = $('bl-attrs');
    if (!container) return;
    const ovr = calcBuildOvr();
    $('bl-ovr').textContent = ovr > 0 ? ovr : '--';
    container.innerHTML = C.ATTR_KEYS.map(k => {
      const val = b.lockedAttrs[k];
      const locked = val != null;
      const slot = b.attrSlots[k];
      const clickable = !locked && b.selectedPlayer;
      let inner;
      if (locked) {
        const g = C.getGrade(val);
        inner = `<span class="ba-label">${C.ATTR_CN[k]}</span><span class="ba-grade" style="color:${g.color}">${g.letter}</span><span class="ba-owner">${esc(slot && slot.playerName || '')}</span>`;
      } else if (b.selectedPlayer) {
        const raw = parseNum(playerAttrs13(b.selectedPlayer)[k], 55);
        const pen = getRolePenalty(PP.role, b.selectedPlayer.role, k);
        const adj = clamp(Math.round(raw * pen), 25, 99);
        const g = C.getGrade(adj);
        inner = `<span class="ba-label">${C.ATTR_CN[k]}</span><span class="ba-grade" style="color:${g.color}">${g.letter}</span><span class="ba-owner" style="${pen < 1 ? 'color:var(--orange)' : ''}">${adj}${pen < 1 ? '▼' : ''}</span>`;
      } else {
        inner = `<span class="ba-label">${C.ATTR_CN[k]}</span><span class="ba-empty">+</span>`;
      }
      return `<div class="ba-slot ${locked ? 'locked' : ''} ${clickable ? 'clickable' : ''}" data-k="${k}" title="${C.ATTR_DESC[k]}">${inner}</div>`;
    }).join('');
    Array.from(container.querySelectorAll('.ba-slot.clickable')).forEach(el => {
      el.onclick = () => lockAttr(el.dataset.k);
    });
    const footer = $('bl-footer');
    if (footer) {
      footer.innerHTML = b.lockCount < 13
        ? '随机战队 → 选手 → 锁定 1 项属性'
        : '<span style="color:var(--gold)">全部属性已锁定！</span>';
    }
  }

  function renderBuild() {
    const b = PP.build;
    $('build-pos-indicator').textContent = `我的角色：${PP.role} ${C.ROLES[PP.role]} · 已锁定 ${b.lockCount}/13`;
    const pct = Math.round(b.lockCount / 13 * 100);
    $('build-progress-area').innerHTML = `
      <div class="build-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-text">${b.lockCount}/13</div>
      </div>`;
    renderLeftAttrs();
    renderSlotArea();
    renderRosterArea();
  }

  function renderSlotArea() {
    const box = $('br-slot-area');
    if (!box) return;
    if (!SLOT.built || !box.querySelector('.br-slot-area-inner')) {
      renderTeamPicker();
      return;
    }
    updateSlotButtons();
    updateSlotResultPanel();
  }

  function renderRosterArea() {
    const b = PP.build;
    const box = $('br-roster-area');
    if (!b.team) { box.innerHTML = ''; return; }
    const meta = C.teamMeta(b.team);
    const list = b.drawPlayers.map((p, i) => {
      const cardKey = drawCardKey(p);
      const sel = b.selectedPlayer && drawCardKey(b.selectedPlayer) === cardKey;
      const used = b.usedPlayers.has(playerIdentityKey(p));
      const t13 = playerAttrs13(p);
      const top3 = C.ATTR_KEYS.filter(k => b.lockedAttrs[k] == null)
        .map(k => ({ k, v: parseNum(t13[k], 55) }))
        .sort((x, y) => y.v - x.v).slice(0, 3);
      const attrsTxt = top3.map(x => `${C.ATTR_CN[x.k]} ${x.v}`).join(' / ');
      const ovr = p.ovr || C.calcOVR(t13, p.role);
      return `<div class="br-player ${sel ? 'selected' : ''} ${used ? 'used' : ''}" data-idx="${i}" data-card-key="${esc(cardKey)}">
        <div class="bp-left">
          ${playerHeadshotHtml(p, 32)}
          <div>
            <div class="bp-name">${esc(p.name)}</div>
            <div class="bp-detail">${p.role} · 现役 · OVR ${ovr}</div>
            <div class="bp-attrs-preview">${attrsTxt}</div>
          </div>
        </div>
        <div class="bp-meta">
          <span class="bp-ovr">${ovr}</span>
        </div>
      </div>`;
    }).join('');
    box.innerHTML = `
      <div class="br-roster-header">
        <span class="br-roster-title">${esc(meta.nameCn || meta.name)}</span>
        <span class="br-roster-sub">本轮 ${b.drawPlayers.length} 名现役 · 同轮不重复</span>
      </div>
      <div class="br-roster-list">${list}</div>
      <div class="roster-footnote">
        <span>${b.drawPlayers.some(p => p.role !== PP.role) ? '⚠️ 跨角色衰减生效' : '✅ 同角色无衰减'}</span>
        <span class="hint-action">👆 选选手 → 锁属性</span>
      </div>`;
    Array.from(box.querySelectorAll('.br-player')).forEach(el => {
      if (el.classList.contains('used')) return;
      el.onclick = () => {
        const idx = parseNum(el.dataset.idx, 0);
        const p = b.drawPlayers[idx];
        if (!p) return;
        const cardKey = drawCardKey(p);
        const already = b.selectedPlayer && drawCardKey(b.selectedPlayer) === cardKey;
        pickPlayerAt(idx);
        if (already) openAttrLockModal(p);
      };
    });
  }

  function renderReveal() {
    const c = PP.career;
    const meta = getAvatarMeta();
    const avatarHtml = meta && meta.src
      ? `<img class="reveal-avatar" src="${esc(meta.src)}" alt="${esc(c.playerName)}">`
      : `<div class="reveal-avatar" style="background:radial-gradient(circle at 50% 115%, ${(meta && meta.color) || '#ff6b35'}66, transparent 48%), linear-gradient(160deg, #2a3448, #111827)">${esc(c.playerName.slice(0, 1))}</div>`;
    $('reveal-content').innerHTML = `
      <div class="reveal-card">
        ${avatarHtml}
        <div class="reveal-name">${esc(c.playerName)}</div>
        <div class="reveal-meta">${c.role} ${C.ROLES[c.role]} · ${C.SINGLE_SEASON.label}</div>
        <div class="reveal-ovr">${c.ovr}</div>
        <div class="reveal-grade">${C.getOvrGrade(c.ovr)}</div>
        <div class="reveal-archetype">${esc(c.archetype)}</div>
        <div class="reveal-attrs">${C.ATTR_KEYS.map(k => `<div class="reveal-stat"><span>${C.ATTR_CN[k]}</span><b style="color:${C.getGrade(c.attrs13[k]).color}">${c.attrs13[k]}</b></div>`).join('')}</div>
        <div class="similar-title">相似选手</div>
        ${c.similar.map(s => `<div class="similar-row">${HS && HS.headshotHtml ? HS.headshotHtml(s.player, 28, 'sr-img') : ''}<span>${esc(s.player.name)}</span><span>${s.sim}%</span></div>`).join('')}
      </div>`;
  }

  const CAREER_SLOT = { spinning: false, ITEM_H: 38 };

  function careerTeamPool() {
    const all = sortedTeamIds();
    const visited = (PP._teamsVisited && PP._teamsVisited.length) ? PP._teamsVisited.filter(t => all.includes(t)) : [];
    return (visited.length >= 3 ? visited : all).slice().sort((a, b) => {
      const ma = C.teamMeta(a), mb = C.teamMeta(b);
      return String(ma.nameCn || ma.name).localeCompare(String(mb.nameCn || mb.name));
    });
  }

  function predictRoleOnTeam(teamId) {
    const players = (C.LEAGUE.teams[teamId] && C.LEAGUE.teams[teamId].players) || [];
    const same = players.filter(p => p.role === PP.career.role);
    const ratings = same.map(p => p.ovr).sort((a, b) => b - a);
    if (!ratings.length) return '首发';
    if (PP.career.ovr >= ratings[0]) return '绝对首发';
    if (PP.career.ovr >= ratings[Math.min(1, ratings.length - 1)]) return '首发';
    return '轮换';
  }

  function renderCareerTeamSelect() {
    const area = $('career-area');
    const reveal = $('career-reveal');
    const btn = $('btn-confirm-team');
    if (reveal) reveal.style.display = 'none';
    if (btn) btn.style.display = 'none';
    if (!area) return;

    const pool = careerTeamPool();
    const items = [];
    for (let c = 0; c < 5; c++) pool.forEach(tid => {
      const m = C.teamMeta(tid);
      items.push({ id: tid, label: m.nameCn || m.name });
    });

    area.innerHTML = `
      <div class="career-slot-wrap">
        <div class="br-slot-area-inner" style="max-width:320px;width:100%;margin:0 auto">
          <div class="br-slot-label">🎰 选择我的生涯战队</div>
          <div class="br-slot-wrapper">
            <div class="br-slot-machine career-slot">
              <div class="br-slot-reel" id="career-slot-reel">${buildReelHtml(items, 'team')}</div>
            </div>
          </div>
          <div class="br-slot-actions">
            <button type="button" class="btn btn-sm slot-btn" id="btn-career-spin" style="background:var(--orange);color:#fff">🎲 随机球队</button>
            <button type="button" class="btn btn-sm slot-btn" id="btn-career-pick" style="background:var(--bg-card);color:var(--text)">🎯 自选球队</button>
          </div>
          <div class="br-slot-warn" id="career-pool-hint">可选池：建号过程中访问过的 ${Math.min(pool.length, PP._teamsVisited && PP._teamsVisited.length || pool.length)} 支战队</div>
        </div>
      </div>`;

    const reel = $('career-slot-reel');
    if (reel) {
      const offset = pool.length * CAREER_SLOT.ITEM_H + CAREER_SLOT.ITEM_H;
      reel.style.transition = 'none';
      reel.style.transform = `translateY(-${offset}px)`;
      void reel.offsetHeight;
      reel.style.transition = '';
    }

    const spinBtn = $('btn-career-spin');
    if (spinBtn) spinBtn.onclick = () => { if (!CAREER_SLOT.spinning) setTimeout(pullCareerHandle, 200); };
    const pickBtn = $('btn-career-pick');
    if (pickBtn) pickBtn.onclick = showCareerTeamPicker;
  }

  function pullCareerHandle() {
    if (CAREER_SLOT.spinning) return;
    spinCareerSlot();
  }

  function spinCareerSlot() {
    const pool = careerTeamPool();
    const teamCount = pool.length;
    if (!teamCount) return;
    const targetIdx = Math.floor(Math.random() * teamCount);
    const targetTeam = pool[targetIdx];
    CAREER_SLOT.spinning = true;
    const items = pool.map(tid => ({ id: tid, label: C.teamMeta(tid).nameCn || C.teamMeta(tid).name }));
    animateReel('career-slot-reel', items, targetTeam, () => {
      CAREER_SLOT.spinning = false;
      selectCareerTeam(targetTeam, false);
    });
  }

  function showCareerTeamPicker() {
    closeCareerTeamPicker();
    const pool = careerTeamPool();
    const gridHtml = pool.map(tid => {
      const m = C.teamMeta(tid);
      return `<div class="team-pick-card" data-id="${tid}">${C.teamLogoHtml(m, 36)}<div class="team-pick-abbr">${esc(m.nameCn || m.name)}</div></div>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.className = 'team-picker-overlay';
    overlay.id = 'team-picker-overlay';
    overlay.innerHTML = `
      <div class="team-picker-modal">
        <div class="team-picker-header">
          <span>🎯 自选战队</span>
          <button type="button" class="team-picker-close" id="team-picker-close">✕</button>
        </div>
        <div class="team-picker-sub">从 ${pool.length} 支候选战队中选择</div>
        <div class="team-picker-grid">${gridHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) closeCareerTeamPicker(); };
    $('team-picker-close').onclick = closeCareerTeamPicker;
    Array.from(overlay.querySelectorAll('.team-pick-card')).forEach(el => {
      el.onclick = () => {
        selectCareerTeam(el.dataset.id, true);
        closeCareerTeamPicker();
      };
    });
  }

  function closeCareerTeamPicker() {
    const el = $('team-picker-overlay');
    if (el) el.remove();
  }

  function selectCareerTeam(teamId, selfPick) {
    PP.career.teamId = teamId;
    PP._draftSelfPick = !!selfPick;
    renderCareerTeamReveal();
  }

  function renderCareerTeamReveal() {
    const tid = PP.career.teamId;
    if (!tid) return;
    const meta = C.teamMeta(tid);
    const roleLine = predictRoleOnTeam(tid);
    const roster = (C.LEAGUE.teams[tid] && C.LEAGUE.teams[tid].players) || [];
    const rosterHtml = roster.slice(0, 8).map(p =>
      `<div class="career-roster-row ${p.role === PP.career.role ? 'user' : ''}">
        <span>${esc(p.name)} · ${p.role}</span><span>OVR ${p.ovr}</span>
      </div>`
    ).join('');

    $('career-area').innerHTML = '';
    $('career-reveal').style.display = 'block';
    $('career-reveal').innerHTML = `
      <div class="career-reveal-card">
        <div class="career-reveal-logo">
          ${C.teamLogoHtml(meta, 56)}
          <div>
            <div class="career-reveal-title">${esc(meta.nameCn || meta.name)}</div>
            <div class="career-reveal-sub">${PP._draftSelfPick ? '自选加盟' : '随机分配'} · 预计 ${roleLine}</div>
          </div>
        </div>
        <div class="similar-title">战队阵容</div>
        <div class="career-roster-list">${rosterHtml || '<div class="career-roster-row">暂无名单</div>'}</div>
      </div>`;
    const btn = $('btn-confirm-team');
    if (btn) {
      btn.style.display = 'inline-flex';
      btn.disabled = false;
    }
  }

  function renderTeamSelect() {
    renderCareerTeamSelect();
  }

  function renderVitals() {
    const p = PP.career.profile || {};
    $('vitals-grid').innerHTML = [
      ['舆论', p.mediaTrust], ['粉丝', p.fanSupport], ['队内', p.lockerRoomTrust],
      ['教练', p.coachTrust], ['士气', parseNum(PP.career.currentStamina, 100)], ['热度', p.fame]
    ].map(([l, v]) => `<div class="vital-chip"><span>${l}</span><b>${Math.round(parseNum(v, 50))}</b></div>`).join('');
  }

  function renderSeason() {
    const c = PP.career;
    const s = PP.season;
    if (!s) return;
    const meta = C.teamMeta(c.teamId);
    $('season-team-name').innerHTML = `${C.teamLogoHtml(meta, 36)}<span>${esc(meta.nameCn || meta.name)} · ${parseNum(c.currentYear, 2026)} · 年龄 ${parseNum(c.age, 20)}</span>`;
    $('season-record').textContent = `${s.wins}-${s.losses}`;
    $('season-progress').textContent = `联赛 ${s.games.length}/${C.LEAGUE_GAMES}`;
    renderVitals();
    renderMyStatsPanel(s);
    renderMatchLogPanel(s);
    const idx = s.games.length;
    const actions = $('season-actions');
    const rankBtn = `<button class="btn btn-secondary" id="btn-rankings">📊 排行榜</button>`;
    if (s.phase === 'league' && idx < C.LEAGUE_GAMES) {
      const next = s.schedule[idx];
      const opp = C.teamMeta(next.opponent);
      $('season-next').innerHTML = `下场：vs ${esc(opp.nameCn || opp.name)} ${next.type === 'derby' ? '🔥德比' : ''}`;
      actions.innerHTML = `
        <button class="btn btn-primary" id="btn-sim-one">▶ 模拟下场</button>
        <button class="btn btn-secondary" id="btn-sim-all">⏩ 模拟剩余</button>
        ${rankBtn}`;
      $('btn-sim-one').onclick = simNextGame;
      $('btn-sim-all').onclick = () => simBatch(C.LEAGUE_GAMES - idx);
    } else if (s.phase === 'league') {
      $('season-next').textContent = '常规赛已完成';
      actions.innerHTML = `${rankBtn}<button class="btn btn-primary" id="btn-events">📅 进入年度赛事</button>`;
      $('btn-events').onclick = enterEventCalendar;
    } else if (s.phase === 'events' || s.phase === 'playoffs' || s.phase === 'major') {
      const cal = s.eventCalendar || [];
      const done = cal.filter(e => e.status === 'complete').length;
      $('season-next').textContent = `赛事阶段 ${done}/${cal.length || 7}`;
      actions.innerHTML = `
        ${rankBtn}
        <button class="btn btn-primary" id="go-events">查看赛事日历</button>
        <button class="btn btn-secondary" id="sim-all-ev">⏩ 快速模拟剩余赛事</button>`;
      $('go-events').onclick = () => { renderPlayoffs(); showScreen('screen-playoffs'); };
      $('sim-all-ev').onclick = simAllEventsUI;
    } else if (s.phase === 'complete') {
      $('season-next').textContent = '年度已结束';
      actions.innerHTML = `${rankBtn}<button class="btn btn-primary" id="btn-year-awards">🏆 年度奖项评选</button>`;
      $('btn-year-awards').onclick = () => showAwardsScreen();
    }
    const rb = $('btn-rankings');
    if (rb) rb.onclick = () => { renderRankings('teams'); showScreen('screen-rankings'); };
    const dots = s.games.map(g => `<i class="${g.win ? 'w' : 'l'}"></i>`).join('');
    $('schedule-dots').innerHTML = dots + '<i class="pending"></i>'.repeat(Math.max(0, C.LEAGUE_GAMES - s.games.length));
    if (s.games.length) {
      const last = s.games[s.games.length - 1];
      $('last-match').innerHTML = `最近：${last.maps[0].map} ${last.win ? '胜' : '负'} · ${last.kills}/${last.deaths}/${last.assists} · Rating ${last.rating}`;
    }
  }

  const ROUND_LABELS = { QF: '四分之一决赛', SF: '半决赛', F: '总决赛' };

  function initPlayoffView() {
    if (!PP.playoffView) PP.playoffView = { stage: 'po', roundIdx: 0 };
  }

  function seriesScore(match) {
    if (!match || !match.games) return '';
    return match.games.series || '';
  }

  function renderBracketTeam(tid, opts) {
    const meta = C.teamMeta(tid);
    const isUser = opts && opts.isUser;
    const isWinner = opts && opts.isWinner;
    const isLoser = opts && opts.isLoser;
    const score = opts && opts.score;
    let cls = 'bv-s-team';
    if (isUser) cls += ' bv-s-gold';
    if (isWinner) cls += ' bv-winner';
    if (isLoser) cls += ' bv-loser';
    return `<div class="${cls}">
      ${C.teamLogoHtml(meta, 28)}
      <div class="bv-s-name">${esc(meta.nameCn || meta.name)}${isUser ? ' <span class="bv-s-badge">你</span>' : ''}</div>
      ${score != null ? `<div class="bv-s-score">${esc(score)}</div>` : ''}
    </div>`;
  }

  function renderSeriesCard(match, userTeam) {
    const userInvolved = match.teamA === userTeam || match.teamB === userTeam;
    const done = !!match.winner;
    const score = seriesScore(match);
    const winA = done && match.winner === match.teamA;
    const winB = done && match.winner === match.teamB;
    const parts = score.split('-');
    const scoreA = done ? (winA ? parts[0] : parts[1]) : '';
    const scoreB = done ? (winB ? parts[0] : parts[1]) : '';
    return `<div class="bv-series ${userInvolved ? 'user-series' : ''}">
      ${renderBracketTeam(match.teamA, { isUser: match.teamA === userTeam, isWinner: winA, isLoser: winB, score: scoreA })}
      <div class="bv-s-vs">${done ? '系列赛结束' : 'BO3'}</div>
      ${renderBracketTeam(match.teamB, { isUser: match.teamB === userTeam, isWinner: winB, isLoser: winA, score: scoreB })}
    </div>`;
  }

  function getPlayoffRounds(ps) {
    const rounds = [];
    (ps.results || []).forEach(r => {
      let bucket = rounds.find(x => x.key === r.round);
      if (!bucket) { bucket = { key: r.round, label: ROUND_LABELS[r.round] || r.round, matches: [] }; rounds.push(bucket); }
      bucket.matches.push(r);
    });
    if (ps.bracket && ps.bracket.length && !ps.complete) {
      const rk = ps.round;
      let bucket = rounds.find(x => x.key === rk);
      if (!bucket) { bucket = { key: rk, label: ROUND_LABELS[rk] || rk, matches: [] }; rounds.push(bucket); }
      ps.bracket.forEach(m => {
        if (!bucket.matches.find(x => x.teamA === m.teamA && x.teamB === m.teamB)) bucket.matches.push(m);
      });
    }
    return rounds;
  }

  function renderSwissPanel(st, title, userTeam) {
    const sorted = (st.swiss || []).slice().sort((a, b) => b.wins - a.wins || a.losses - b.losses);
    return `<div class="swiss-panel">
      <div class="swiss-header">
        <h3>${esc(title)} · Swiss</h3>
        <span class="swiss-progress">第 ${st.swissDay}/${st.maxSwissDays} 天</span>
      </div>
      <div class="swiss-table">${sorted.map(t => {
        const meta = C.teamMeta(t.team);
        let cls = 'swiss-row';
        if (t.team === userTeam) cls += ' user';
        if (t.qualified) cls += ' qualified';
        if (t.eliminated) cls += ' eliminated';
        let badge = '';
        if (t.qualified) badge = '<span class="swiss-status q">晋级</span>';
        else if (t.eliminated) badge = '<span class="swiss-status out">淘汰</span>';
        return `<div class="${cls}">${C.teamLogoHtml(meta, 24)}<span>${esc(meta.nameCn || meta.name)}</span>${badge}<span class="swiss-record">${t.wins}W-${t.losses}L</span></div>`;
      }).join('')}</div>
    </div>`;
  }

  function renderEventDetail(ev, userTeam) {
    const st = ev.state;
    if (!st) return '<p class="sub">赛事尚未开始</p>';
    let html = '';
    const showBracket = ev.type === 'playoffs' || ev.type === 'elim8' ||
      (st.bracket && st.bracket.length && st.phase !== 'swiss' && st.phase !== 'major');
    if (showBracket) {
      const rounds = getPlayoffRounds(st);
      if (!rounds.length && st.bracket) {
        rounds.push({ key: st.round, label: ROUND_LABELS[st.round] || st.round, matches: st.bracket });
      }
      const round = rounds[rounds.length - 1] || { label: ROUND_LABELS[st.round] || st.round, matches: st.bracket || [] };
      html += `<div class="bv-round-nav"><span class="bv-round-label">${esc(round.label || ev.label)}</span></div>`;
      html += (round.matches || st.bracket || []).map(m => renderSeriesCard(m, userTeam)).join('');
    } else if (st.swiss) {
      html += renderSwissPanel(st, ev.label, userTeam);
    }
    if (ev.status === 'complete' && ev.champion) {
      const cm = C.teamMeta(ev.champion);
      html += `<div class="sub" style="text-align:center;margin-top:8px">冠军：${esc(cm.nameCn || cm.name)}</div>`;
    }
    return html;
  }

  function renderPlayoffs() {
    const s = PP.season;
    const userTeam = PP.career.teamId;
    initPlayoffView();
    if (!s.eventCalendar && (s.phase === 'events' || s.phase === 'playoffs' || s.phase === 'major')) {
      SIM.migrateSeasonEvents(s, userTeam);
    }
    const cal = s.eventCalendar || [];
    const active = SIM.getActiveEvent(s);
    let html = '<div class="po-wrap">';

    html += `<div class="event-calendar">${cal.map(ev => {
      const cls = ['event-cal-row', ev.status];
      if (active && ev.id === active.id) cls.push('current');
      const champ = ev.champion ? C.teamMeta(ev.champion) : null;
      return `<div class="${cls.join(' ')}">
        <span class="event-cal-emoji">${ev.emoji || '🏅'}</span>
        <div class="event-cal-body">
          <div class="event-cal-name">${esc(ev.label)}</div>
          <div class="event-cal-meta">${ev.status === 'complete' ? (champ ? `冠军 ${esc(champ.nameCn || champ.name)}` : '已结束') : (ev.status === 'active' ? '进行中' : '待赛')}</div>
        </div>
        <span class="event-cal-status">${ev.status === 'complete' ? '✓' : (ev.status === 'active' ? '▶' : '○')}</span>
      </div>`;
    }).join('')}</div>`;

    if (active) {
      html += `<div class="event-detail-panel"><h3 class="event-detail-title">${active.emoji || ''} ${esc(active.label)}</h3>`;
      html += renderEventDetail(active, userTeam);
      html += '</div><div class="bv-po-actions">';
      if (active.status === 'active') {
        html += `<button class="btn btn-primary" id="sim-ev-step">▶ 模拟一步</button>`;
        html += `<button class="btn btn-secondary" id="sim-ev-full">完成本赛事</button>`;
      }
      html += `<button class="btn btn-secondary" id="sim-ev-all">⏩ 快速模拟剩余</button></div>`;
    } else if (s.phase === 'complete') {
      html += `<div class="bv-po-actions"><button class="btn btn-primary" id="finish">🏆 年度奖项评选</button></div>`;
    }

    html += '</div>';
    $('playoffs-content').innerHTML = html;

    const poStats = $('po-my-stats');
    if (poStats) {
      poStats.innerHTML = '';
      const ps = s.playerStats || {};
      if (ps.maps) {
        poStats.innerHTML = formatStatsBlock(ps, '赛季累计') +
          (active && s.eventStats && s.eventStats[active.id] ? formatStatsBlock(s.eventStats[active.id], `本赛事 · ${active.label}`) : '');
      }
    }
    const poLog = $('po-match-log');
    if (poLog) {
      const log = s.matchLog || [];
      poLog.innerHTML = log.slice(0, 5).map(m =>
        `<div class="match-log-row ${m.win ? 'win' : 'loss'}"><div class="ml-main">${esc(m.label)} ${esc(m.map)} ${m.win ? '胜' : '负'}</div><div class="ml-stat">${m.kills}/${m.deaths}/${m.assists} · Rtg ${m.rating}</div></div>`
      ).join('') || '<div class="sub">暂无你的出场记录</div>';
    }

    const step = $('sim-ev-step'); if (step) step.onclick = simEventStepUI;
    const full = $('sim-ev-full'); if (full) full.onclick = simCurrentEventComplete;
    const all = $('sim-ev-all'); if (all) all.onclick = simAllEventsUI;
    const btnFin = $('finish'); if (btnFin) btnFin.onclick = finishSeason;
  }

  function renderAwardRow(a, idx) {
    const emoji = a.emoji || '🏅';
    const rankCls = a.rankClass || 'dim';
    let winnerHtml = '';
    if (a.isList && a.listMeta) {
      if (a.isRankedList) {
        winnerHtml = `<div class="top20-list">${a.listMeta.map(p =>
          `<div class="top20-row ${p.isUser ? 'user' : ''}">
            <span class="top20-rank">#${p.rank}</span>
            <span class="top20-name">${p.isUser ? '⭐ ' : ''}${esc(p.name)}</span>
            <span class="top20-team">${esc(p.teamName || p.team || '')}</span>
            <span class="top20-ovr">${p.ovr || '—'}</span>
          </div>`
        ).join('')}</div>`;
      } else {
        winnerHtml = `<div class="award-list-names">${a.listMeta.map(p =>
          `<span class="award-list-chip ${p.isUser ? 'user' : ''}">${p.isUser ? '⭐ ' : ''}${esc(p.name)}</span>`
        ).join('')}</div>`;
      }
    } else {
      const teamMeta = a.team ? C.teamMeta(a.team) : null;
      winnerHtml = `<div class="award-winner ${a.isUser ? 'user' : ''}">${a.isUser ? '⭐ ' : ''}${esc(a.winner || '')}</div>` +
        (teamMeta ? `<div class="award-team">${esc(teamMeta.nameCn || teamMeta.name)}</div>` : '');
    }
    return `<div class="award-row ${a.isUser ? 'user-win' : ''}" style="animation-delay:${idx * 0.35}s">
      <div class="award-icon">${emoji}</div>
      <div class="award-body"><div class="award-cat">${esc(a.label)}</div>${winnerHtml}</div>
      <div class="award-rank ${rankCls}">${esc(a.userRank || '—')}</div>
    </div>`;
  }

  function showAwardsScreen() {
    const s = PP.season;
    if (!s) return;
    if (!s.awards || !s.awards.length) {
      s.awards = AWARDS.computeSeasonAwards({ career: PP.career, season: s });
    }

    const sub = $('awards-sub');
    if (sub) sub.textContent = '年度评选 · 全部赛事结束后公布';
    showScreen('screen-awards');

    $('awards-content').innerHTML = `
      <div class="awards-wrap" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:40vh">
        <div class="loading-balls"><span class="loading-ball"></span><span class="loading-ball"></span><span class="loading-ball"></span></div>
        <div style="margin-top:16px;font-size:13px;color:var(--text-muted)">统计年度选票中…</div>
      </div>`;
    $('awards-footer').innerHTML = '';

    setTimeout(() => {
      const awards = s.awards || [];
      $('awards-content').innerHTML = `<div class="awards-wrap">${awards.map((a, i) => renderAwardRow(a, i)).join('')}</div>`;
      $('awards-footer').innerHTML = `<div class="awards-footer-actions">
        <button class="btn btn-primary" id="awards-to-results">📊 查看赛季总结</button>
      </div>`;
      const toRes = $('awards-to-results');
      if (toRes) toRes.onclick = () => { renderResults(); renderAwards(); showScreen('screen-results'); };
    }, 1200);
  }

  function renderAwards() {
    const awards = PP.season && PP.season.awards || [];
    const html = `<div class="awards-wrap">${awards.map((a, i) => renderAwardRow(a, i)).join('')}</div>`;
    const el = $('awards-content');
    const el2 = $('awards-list-results');
    if (el) el.innerHTML = html;
    if (el2) el2.innerHTML = html;
  }

  function renderResults() {
    const c = PP.career;
    if (c.retired) { renderRetirement(); renderAwards(); return; }
    const s = PP.season;
    const meta = C.teamMeta(c.teamId);
    const hist = (c.careerHistory || []).slice(-3).map(h =>
      `<div class="similar-row"><span>${h.year}</span><span>${h.wins}-${h.losses}</span></div>`
    ).join('');
    $('results-content').innerHTML = `
      <h2>${parseNum(s.year, c.currentYear)} 赛季总结</h2>
      <p>${C.teamLogoHtml(meta, 28)} ${esc(c.playerName)} · ${c.role} · ${esc(meta.nameCn || meta.name)} · 年龄 ${c.age}</p>
      <p>联赛 ${s.wins}-${s.losses} · Rating ${s.playerStats.rating} · K/D/A ${s.playerStats.kills}/${s.playerStats.deaths}/${s.playerStats.assists}</p>
      ${(s.eventCalendar || []).filter(e => e.status === 'complete').length ? `<div class="similar-title">本年度赛事</div>
        ${(s.eventCalendar || []).filter(e => e.status === 'complete').map(ev => {
          const cm = ev.champion ? C.teamMeta(ev.champion) : null;
          return `<div class="similar-row"><span>${esc(ev.label)}</span><span>${cm ? esc(cm.nameCn || cm.name) : '—'}</span></div>`;
        }).join('')}` : ''}
      <p>已征战 ${c.seasonCount} 赛季</p>
      ${hist ? `<div class="similar-title">近季战绩</div>${hist}` : ''}`;
    renderAwards();
    const btn = $('btn-next-season');
    if (btn) {
      const nextAge = parseNum(c.age, 20) + 1;
      if (nextAge > 40 || c.age >= 40) {
        btn.style.display = 'none';
      } else {
        btn.style.display = 'inline-flex';
        btn.textContent = nextAge >= 40 ? `最后一季（将满 40 岁）` : `继续 ${parseNum(c.currentYear, 2026) + 1} 赛季（${nextAge} 岁）`;
        btn.onclick = startNextSeason;
      }
    }
  }

  function bindNav() {
    $('btn-new').onclick = async () => {
      PP.career = null; PP.season = null; buildReset();
      PP.playerName = ''; PP.avatar = ''; PP.role = null;
      renderCharacter(); showScreen('screen-character');
    };
    $('btn-continue').onclick = async () => {
      await ensureLeague();
      if (PP.career.singleSeasonComplete) { renderResults(); showScreen('screen-results'); }
      else if (PP.season) { renderSeason(); showScreen('screen-season'); }
      else if (PP.career.teamId) { beginCareer(); }
      else { renderTeamSelect(); showScreen('screen-team'); }
    };
    $('btn-help').onclick = () => { $('helpModal').style.display = 'flex'; };
    $('help-close').onclick = () => { $('helpModal').style.display = 'none'; };
    $('btn-char-next').onclick = () => {
      if (!PP.playerName) { $('char-error').textContent = '请输入选手 ID'; return; }
      if (PP.avatar === '' || PP.avatar == null) { $('char-error').textContent = '请选择头像'; return; }
      renderRole(); showScreen('screen-role');
    };
    $('btn-confirm-role').onclick = async () => {
      await ensureLeague();
      buildReset();
      renderBuild();
      showScreen('screen-build');
    };
    $('btn-reveal-team').onclick = () => { renderTeamSelect(); showScreen('screen-team'); };
    $('btn-confirm-team').onclick = beginCareer;
    $('btn-next-season').onclick = startNextSeason;
    $('btn-menu').onclick = () => { renderMenu(); showScreen('screen-menu'); };
    $('btn-menu-po').onclick = () => { renderMenu(); showScreen('screen-menu'); };
    $('btn-rankings-po').onclick = () => { renderRankings('teams'); showScreen('screen-rankings'); };
    $('btn-rankings-back').onclick = () => {
      if (PP.season && (PP.season.phase === 'events' || PP.season.phase === 'complete')) {
        renderPlayoffs(); showScreen('screen-playoffs');
      } else { renderSeason(); showScreen('screen-season'); }
    };
    $('btn-menu-res').onclick = () => { renderMenu(); showScreen('screen-menu'); };
    $('event-close').onclick = () => { $('eventModal').style.display = 'none'; };
  }

  async function init() {
    bindNav();
    await loadAvatarManifest();
    if (HS && HS.loadPhotoManifest) await HS.loadPhotoManifest();
    const saved = loadGame();
    if (saved) {
      PP.career = saved.career;
      PP.season = saved.season;
      if (PP.season && PP.career) {
        SIM.migrateSeasonEvents(PP.season, PP.career.teamId);
        ensureSeasonVrs(PP.season);
      }
      if (PP.career) {
        PP.role = PP.career.role;
        PP.playerName = PP.career.playerName;
        PP.avatar = PP.career.avatar != null ? PP.career.avatar : '';
      }
    }
    try { await ensureLeague(); } catch (e) { console.error(e); }
    renderMenu();
    showScreen('screen-menu');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
