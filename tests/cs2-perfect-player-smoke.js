#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8037;

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.csv': 'text/csv', '.png': 'image/png', '.jpg': 'image/jpeg'
};

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = req.url.split('?')[0];
      const filePath = path.join(ROOT, url === '/' ? 'index.html' : url.replace(/^\//, ''));
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      serveFile(filePath, res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function fetchText(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

async function run() {
  const server = await startServer();
  const errors = [];

  const html = await fetchText('/cs2-perfect-player.html');
  if (!html.includes('CS2 Perfect Player')) errors.push('HTML missing title');
  if (!html.includes('cs2-perfect-player.js')) errors.push('HTML missing main script');

  const core = await fetchText('/assets/js/cs2-core.js');
  if (!core.includes('ATTR_KEYS')) errors.push('core missing ATTR_KEYS');

  const poolRaw = await fetchText('/assets/data/cs2-player-pool.json');
  const pool = JSON.parse(poolRaw);
  const teamCount = Object.keys(pool.teams || {}).length;
  if (teamCount < 50) errors.push(`expected 50+ teams, got ${teamCount}`);
  let total = 0;
  Object.values(pool.teams).forEach(t => { total += (t.players || []).length + (t.historicalPlayers || []).length; });
  if (total < 500) errors.push(`expected 500+ players, got ${total}`);

  const eventsSrc = await fetchText('/assets/js/cs2-event-library.js');

  // VM smoke: core + sim logic
  const vm = require('vm');
  const sandbox = { window: {}, console, Math, JSON, Object, Array, Set, Promise, fetch: async () => ({ ok: false }) };
  sandbox.window = sandbox;
  vm.runInNewContext(core, sandbox);
  vm.runInNewContext(await fetchText('/assets/js/cs2-sim.js'), sandbox);
  vm.runInNewContext(eventsSrc, sandbox);
  const eventCount = sandbox.window.CS2_EVENTS.catalog.length;
  if (eventCount < 80) errors.push(`expected 80+ events, got ${eventCount}`);

  const C = sandbox.window.CS2;
  const SIM = sandbox.window.CS2_SIM;
  if (!C || !SIM) errors.push('CS2 / CS2_SIM not exported');

  const attrs = {};
  C.ATTR_KEYS.forEach((k, i) => { attrs[k] = 70 + i; });
  const ovr = C.calcOVR(attrs, 'Entry');
  if (ovr < 25 || ovr > 99) errors.push('OVR out of range');

  const teamIds = Object.keys(pool.teams);
  C.LEAGUE.teamList = teamIds;
  C.LEAGUE.teams = {};
  teamIds.forEach(tid => {
    C.LEAGUE.teams[tid] = {
      meta: { id: tid, name: tid, nameCn: tid, color: '#555' },
      players: (pool.teams[tid].players || []).slice(0, 5).map(p => ({
        ...p, attrs13: p.attrs ? C.attrsToThirteen(p.attrs) : attrs
      }))
    };
  });
  const career = { teamId: 'navi', role: 'Entry', ovr: 96, attrs13: attrs, attrs10: C.thirteenToMatch(attrs), profile: {}, currentStamina: 100, seasonMods: {}, age: 22 };
  const season = SIM.initSeason(career);
  if (season.schedule.length !== 18) errors.push('schedule not 18 games');
  let wins = 0;
  for (let i = 0; i < 20; i++) {
    const g = SIM.simBO1('navi', 'vitality', 'navi', career);
    if (g.win) wins++;
  }
  if (wins < 8) errors.push(`star player win rate too low: ${wins}/20`);
  const game = SIM.simBO1('navi', 'vitality', 'navi', career);
  if (!game.maps || !game.maps[0].map) errors.push('simBO1 missing map');

  server.close();

  if (errors.length) {
    console.error('SMOKE FAILED:');
    errors.forEach(e => console.error(' -', e));
    process.exit(1);
  }
  console.log('SMOKE OK:', { teams: teamCount, players: total, events: eventCount, ovr, map: game.maps[0].map });
}

run().catch(err => { console.error(err); process.exit(1); });
