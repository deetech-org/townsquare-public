// Townsquare Web — UI controller. State → DOM, buttons → reducer, camera loop, QR render.
import {
  appReducer, QRCodec, scanRolesPayload, NarrationEngine,
  effectiveMinRoleHolders, pickNextModerator, setDev, DEV,
} from './core.js';

// ---- URL params ------------------------------------------------------------
// ?dev=1  lowers the min players to 3 for solo testing.
// ?u=N    namespaces localStorage so multiple browser tabs are INDEPENDENT
//         "devices" (each tab = one player). See README "Multi-session testing".
const PARAMS = new URLSearchParams(location.search);
setDev(PARAMS.get('dev') === '1');
const SLOT = PARAMS.get('u') || '';

// ---- Persisted app state ---------------------------------------------------
const STORE_KEY = 'townsquare_web_v1' + (SLOT ? '_' + SLOT : '');
let state = { session: null, alert: null };
try {
  const raw = localStorage.getItem(STORE_KEY);
  state = appReducer(state, { type: 'HYDRATED', session: raw ? JSON.parse(raw) : null });
} catch { /* fresh start */ }

// ---- Transient UI-only state ----------------------------------------------
const ui = {
  ballotTarget: null,
  revealRole: false, peekBallot: false, revealRoster: false, showHandoff: false, showHelp: false,
  scanHandler: null, rolesCache: null,
};

const $ = (sel) => document.querySelector(sel);
const app = $('#app');

// ---- Dispatch / render -----------------------------------------------------
function persist() {
  try {
    if (state.session) localStorage.setItem(STORE_KEY, JSON.stringify(state.session));
    else localStorage.removeItem(STORE_KEY);
  } catch { /* private mode: stay in memory */ }
}
function dispatch(action) {
  state = appReducer(state, action);
  if (state.alert) { toast(state.alert); state = appReducer(state, { type: 'ALERT_CLEARED' }); }
  persist();
  render();
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.style.display = 'none'; }, 3200);
}

// ---- QR rendering (canvas via qrcode-generator module API) ------------------
function qrCanvas(text, size = 200) {
  if (typeof qrcode === 'undefined') {
    const d = document.createElement('div');
    d.className = 'dim';
    d.textContent = 'QR library missing — see vendor/README.md';
    return d;
  }
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const margin = 2;
  const cell = Math.max(2, Math.floor(size / (count + margin * 2)));
  const dim = cell * (count + margin * 2);
  const canvas = document.createElement('canvas');
  canvas.width = dim; canvas.height = dim;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#000';
  for (let r = 0; r < count; r++)
    for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  return canvas;
}
function qrBlock(text, size) {
  const box = document.createElement('div');
  const wrap = document.createElement('div');
  wrap.className = 'qrwrap';
  wrap.appendChild(qrCanvas(text, size));
  box.appendChild(wrap);
  if (DEV) {
    // Tab-to-tab testing without a camera: copy this payload, switch to another
    // tab's scanner, and paste it. Mirrors the native app's DEV payload path.
    const dp = document.createElement('div');
    dp.className = 'devpay';
    const btn = document.createElement('button');
    btn.className = 'link';
    btn.textContent = 'DEV: copy payload';
    btn.style.marginTop = '4px';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try { await navigator.clipboard.writeText(text); toast('Payload copied — paste into another tab'); }
      catch { window.prompt('Copy this payload:', text); }
    });
    dp.appendChild(btn);
    box.appendChild(dp);
  }
  return box;
}

// ---- Camera scanner (jsQR) -------------------------------------------------
let stream = null, scanning = false;
const decodeCanvas = document.createElement('canvas');

function openScanner(title, handler) {
  ui.scanHandler = handler;
  $('#scan-title').textContent = title;
  $('#scan-paste').value = '';
  $('#scanner').classList.add('on');
  startCamera();
}
function closeScanner() {
  scanning = false;
  $('#scanner').classList.remove('on');
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  ui.scanHandler = null;
}
async function startCamera() {
  const video = $('#scanvideo');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    await video.play();
    scanning = true;
    requestAnimationFrame(scanTick);
  } catch (e) {
    toast('Camera unavailable — paste the payload instead. (' + (e.name || 'error') + ')');
  }
}
let _lastDecode = 0;
function scanTick(ts) {
  if (!scanning) return;
  const video = $('#scanvideo');
  if (video.readyState >= 2 && typeof jsQR !== 'undefined' && ts - _lastDecode > 100) {
    _lastDecode = ts;
    const size = 360;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh) {
      const crop = Math.min(vw, vh);
      decodeCanvas.width = size; decodeCanvas.height = size;
      const ctx = decodeCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, (vw - crop) / 2, (vh - crop) / 2, crop, crop, 0, 0, size, size);
      const img = ctx.getImageData(0, 0, size, size);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        const handler = ui.scanHandler;
        closeScanner();
        if (handler) handler(code.data);
        return;
      }
    }
  }
  requestAnimationFrame(scanTick);
}

// ---- Scan handlers ---------------------------------------------------------
function handleGenericDecode(kinds, onOk) {
  return (data) => {
    const payload = QRCodec.decode(data);
    if (!payload || !kinds.includes(payload.kind)) { toast('That is not the QR code this step expects.'); return; }
    onOk(payload);
  };
}
async function handleRolesScan(data) {
  const res = await scanRolesPayload(data, state.session, dispatch);
  toast(res.message);
  render();
}

// ============================================================================
// RENDER
// ============================================================================
let slotBadge;
function renderSlotBadge(s) {
  if (!SLOT && !DEV) return;
  if (!slotBadge) { slotBadge = document.createElement('div'); slotBadge.className = 'devslot'; document.body.appendChild(slotBadge); }
  const mode = s ? (s.deviceMode === 'MODERATOR' ? 'MOD' : 'PLAYER') : '—';
  slotBadge.textContent = (SLOT ? 'u' + SLOT + ' · ' : '') + (s?.self?.name || 'new') + ' · ' + mode;
}

function render() {
  const s = state.session;
  document.title = 'Townsquare' + (SLOT ? ' [' + SLOT + ']' : '') + (s?.self?.name ? ' · ' + s.self.name : '');
  renderSlotBadge(s);
  if (ui.showHelp) { app.innerHTML = helpScreen(); return; }
  if (!s) { app.innerHTML = setupScreen(); focusName(); return; }
  if (!s.sessionId) { app.innerHTML = homeScreen(s); return; }
  if (s.deviceMode === 'MODERATOR') { renderModerator(s); return; }
  renderPlayer(s);
}
// ---- Setup / Home ----------------------------------------------------------
function setupScreen() {
  return `
    <img class="brandimg" src="icons/icon-192.png" alt="Townsquare" />
    <h1>Townsquare</h1>
    <p class="dim">Enter your name — it stays on this device and is only shared with your game's Moderator.</p>
    <div style="margin-top:20px">
      <input type="text" id="name" placeholder="Your name" autocapitalize="words" />
      <button class="btn gold" data-action="createProfile">Continue</button>
    </div>`;
}
function focusName() { const n = $('#name'); if (n) setTimeout(() => n.focus(), 50); }

function homeScreen(s) {
  return `
    <img class="brandimg" src="icons/icon-192.png" alt="Townsquare" />
    <h2>Hi ${esc(s.self.name)}</h2>
    <p class="dim">Start a game night as Moderator, or join one by scanning the Moderator's QR code.</p>
    <button class="btn gold" data-action="createGame">Create Game Night (become Moderator)</button>
    <button class="btn" data-action="scanJoin">Join a Game (scan QR)</button>
    <button class="link" data-action="clearProfile">Change name</button>`;
}

// ---- Player ----------------------------------------------------------------
function renderPlayer(s) {
  const { self, phase, roster } = s;
  const isDead = self.status === 'DECEASED' || self.status === 'ELIMINATED';
  const isDay = phase === 'DAY_NARRATION' || phase === 'DAY_NOMINATION' || phase === 'DAY_VOTE';

  // Lobby onboarding (joined, no role yet)
  if (self.role === 'UNASSIGNED') {
    const ackWire = QRCodec.encode({ kind: 'joinAck', sid: s.sessionId, name: self.name });
    app.innerHTML = `
      <h2>Lobby Onboarding</h2>
      <p class="dim">Show this QR to the Moderator to complete your registration:</p>
      <div class="card center"><div id="qr-ack"></div><div class="badge">Name: ${esc(self.name)}</div></div>
      <button class="btn gold" data-action="scanRoles">Scan Roles QR (when started)</button>
      <button class="link leave" data-action="leave">Leave game night</button>`;
    $('#qr-ack').appendChild(qrBlock(ackWire, 180));
    return;
  }

  // Night screen (alive)
  if (phase === 'NIGHT' && !isDead) {
    app.innerHTML = `
      <div class="fullscreen black">
        <div class="hero" style="opacity:.3">🌙</div>
        <h2 style="color:#8A99AD">Night Has Fallen</h2>
        <p class="dim">Close your eyes and listen to the Moderator.</p>
      </div>`;
    return;
  }

  // Gameplay
  const alive = (roster || []).filter(p => p.status === 'ACTIVE' && !p.isModerator && p.name !== self.name).map(p => p.name);
  let body = `<h2>Round ${s.roundNumber}</h2>`;

  if (isDead) {
    body += `<div class="card center"><div class="hero">⚰️</div>
      <div class="role" style="color:var(--outlaw);font-size:20px">You are ${self.status}</div>
      <p class="dim">You can no longer vote, act, or speak. Please remain silent.</p></div>`;
  } else {
    const revealed = ui.revealRole;
    const roleColor = { OUTLAW: 'var(--outlaw)', DETECTIVE: 'var(--detective)', DOCTOR: 'var(--doctor)', TOWN: 'var(--town)' }[self.role] || 'var(--dim)';
    body += `<div class="card center" data-hold="role">
      ${revealed
        ? `<div class="dim">You are</div><div class="role" style="color:${roleColor}">${self.role}</div>
           ${self.role === 'OUTLAW' && s.companions && s.companions.length ? `<div class="dim">Fellow outlaws: ${esc(s.companions.join(', '))}</div>` : ''}`
        : `<div class="hero">🎴</div><div class="reveal-hint">Hold to reveal your role — release to hide</div>`}
    </div>`;
  }

  // Ballot
  if (!isDead && isDay) {
    if (ui.ballotTarget) {
      const ballotWire = QRCodec.encode({ kind: 'ballot', sid: s.sessionId, roundNumber: s.roundNumber, voter: self.name, target: ui.ballotTarget });
      body += `<div class="card center">
        <div class="badge">Your secret ballot is ready</div>
        <p class="dim">Show this QR to the Moderator. Your choice is only inside the code.</p>
        <div id="qr-ballot"></div>
        <div class="reveal-hint" data-hold="ballot">${ui.peekBallot ? 'Voting for: ' + esc(ui.ballotTarget) : 'Hold to check your choice'}</div>
        <button class="btn" data-action="changeVote">Change Vote</button>
      </div>`;
    } else if (alive.length) {
      body += `<div class="card"><div class="step">Cast your secret ballot — select a suspect:</div>
        <div class="picker">${alive.map(n => `<button data-action="pickBallot" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>`;
    } else {
      body += `<p class="dim">Scan the Sync QR first to refresh active candidates.</p>`;
    }
  }

  body += `
    <button class="btn gold" data-action="scanSync">Scan Sync QR (State Sync)</button>
    <button class="btn" data-action="scanRoles">Scan Roles QR (new round)</button>
    <button class="link" data-action="scanHandoff">I'm the next Moderator — scan handoff QR</button>
    <button class="link leave" data-action="leave">Leave game night</button>`;

  app.innerHTML = body;
  if (ui.ballotTarget && !isDead && isDay) $('#qr-ballot')?.appendChild(qrBlock(QRCodec.encode({ kind: 'ballot', sid: s.sessionId, roundNumber: s.roundNumber, voter: self.name, target: ui.ballotTarget }), 150));
  wireHold();
}

// ---- Moderator -------------------------------------------------------------
function renderModerator(s) {
  const { phase, roster } = s;
  const roleHolders = (roster || []).filter(p => !p.isModerator && p.status === 'ACTIVE');
  const outlaws = roleHolders.filter(p => p.role === 'OUTLAW').length;
  const townCount = roleHolders.filter(p => p.role !== 'OUTLAW').length;
  let winner = null;
  if (outlaws === 0 && roleHolders.length) winner = 'TOWN';
  else if (outlaws >= townCount && roleHolders.length) winner = 'OUTLAWS';

  let body = `<div style="text-align:center;margin-bottom:12px">
    <img class="brandimg sm" src="icons/icon-192.png" alt="" />
    <h2 style="margin:4px 0">Moderator Dashboard</h2>
    <div class="badge">Round ${s.roundNumber} — ${phase}</div></div>`;

  if (phase === 'LOBBY') {
    const joinWire = QRCodec.encode({ kind: 'join', sid: s.sessionId, roundNumber: s.roundNumber, moderatorName: s.self.name });
    body += `
      <div class="card center"><div class="step">1. Players Scan to Join:</div><div id="qr-join"></div></div>
      <button class="btn" data-action="scanAck">2. Scan Player's joinAck QR</button>
      <div class="card"><div class="step">Roster (${roleHolders.length} joined):</div>
        ${roleHolders.map(p => `<div class="rosterline"><span>✓ ${esc(p.name)}</span><button class="rm" data-action="remove" data-name="${esc(p.name)}">remove</button></div>`).join('') || '<div class="dim">No players yet</div>'}
      </div>
      <button class="btn gold" data-action="startRound" ${roleHolders.length < effectiveMinRoleHolders() ? 'disabled' : ''}>Start Round</button>
      ${roleHolders.length < 6 && roleHolders.length >= 3 ? `<p class="dim">DEV: starting with ${roleHolders.length} players (release min is 6).</p>` : ''}
      <button class="btn danger" data-action="cancelGame">Cancel — someone else is the Moderator</button>`;
    app.innerHTML = body;
    $('#qr-join').appendChild(qrBlock(joinWire, 160));
    return;
  }

  if (phase === 'ROLE_ASSIGNMENT') {
    const wire = ensureRolesQR(s);
    body += `<div class="card center"><div class="step">Players Scan to Receive Roles:</div>
      ${wire ? '<div id="qr-roles"></div>' : '<p class="dim">Encrypting roles…</p>'}</div>
      <button class="btn gold" data-action="toNight">Enter Night Phase</button>`;
    body += rosterStatus(s);
    app.innerHTML = body;
    if (wire) $('#qr-roles').appendChild(qrBlock(wire, 200));
    wireHold();
    return;
  }

  if (phase === 'NIGHT') {
    const pending = s.pendingActions || [];
    const kill = pending.find(a => a.action === 'KILL');
    const save = pending.find(a => a.action === 'SAVE');
    const inspect = pending.find(a => a.action === 'INVESTIGATE');
    let verdict = '';
    if (inspect && roster) { const t = roster.find(p => p.name === inspect.target); if (t) verdict = t.role === 'OUTLAW' ? 'GUILTY (OUTLAW)' : 'INNOCENT (TOWN)'; }
    const names = roleHolders.map(p => p.name);
    const nightPicker = (label, actor, act, current, extra) => `
      <div class="pickerbox"><div class="lbl">${label}: ${current ? esc(current.target) + (extra || '') : 'None'}</div>
        ${current ? '' : `<div class="picker">${names.map(n => `<button data-action="night" data-actor="${actor}" data-act="${act}" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>`}
      </div>`;
    body += `<div class="card"><div class="step">Silent Night Console — ask everyone to close eyes, call roles in turn:</div>
      ${nightPicker('1. Outlaws (Kill)', 'OUTLAW', 'KILL', kill)}
      ${nightPicker('2. Doctor (Save)', 'DOCTOR', 'SAVE', save)}
      ${nightPicker('3. Detective (Inspect)', 'DETECTIVE', 'INVESTIGATE', inspect, inspect ? ' → ' + verdict : '')}
      <button class="btn gold" data-action="resolveNight" ${(!kill || !save || !inspect) ? 'disabled' : ''}>Resolve Night</button>
      <button class="btn" data-action="backToRoles">Back — re-show the Roles QR</button>
    </div>`;
    body += rosterStatus(s);
    app.innerHTML = body;
    wireHold();
    return;
  }

  if (phase === 'DAY_NARRATION') {
    const cat = s.lastOutcome?.victim ? 'DAY_START_LOSS' : 'DAY_START_PEACE';
    const syncWire = syncQRWire(s);
    body += narrationCard(cat, s.lastOutcome?.victim);
    body += `<div class="card center"><div class="step">Show this Sync QR — wait until every player has scanned it:</div><div id="qr-sync"></div></div>
      <button class="btn gold" data-action="toNomination">Open nominations</button>`;
    body += rosterStatus(s);
    app.innerHTML = body;
    $('#qr-sync').appendChild(qrBlock(syncWire, 160));
    wireHold();
    return;
  }

  if (phase === 'DAY_NOMINATION') {
    const syncWire = syncQRWire(s);
    body += narrationCard('NOMINATION_TENSION');
    body += `<div class="card center"><div class="step">Latecomer missed the morning scan? Sync QR is still here:</div><div id="qr-sync"></div></div>
      <button class="btn gold" data-action="toVote">Move to the vote</button>`;
    body += rosterStatus(s);
    app.innerHTML = body;
    $('#qr-sync').appendChild(qrBlock(syncWire, 140));
    wireHold();
    return;
  }

  if (phase === 'DAY_VOTE') {
    const ballots = Object.entries(s.ballots || {});
    const tally = {};
    for (const [, t] of ballots) tally[t] = (tally[t] || 0) + 1;
    const counts = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    body += narrationCard('EXECUTION_RESOLVED', s.lastElimination);
    body += `<div class="step">1. Walk the circle and scan each alive player's ballot QR:</div>
      <button class="btn gold" data-action="scanBallot">Scan Player Ballot QR (${ballots.length}/${roleHolders.length})</button>
      <div class="card"><div class="step">Live Ballot Tally:</div>
        ${counts.map(([n, c]) => `<div class="tally">${esc(n)}: ${c} ${c === 1 ? 'vote' : 'votes'}</div>`).join('') || '<div class="dim">No ballots yet</div>'}</div>
      <div class="step">2. Announce the result and confirm the banishment:</div>
      <div class="card picker">${roleHolders.map(p => `<button data-action="eliminate" data-name="${esc(p.name)}">${esc(p.name)}</button>`).join('')}</div>
      <div class="step">3. Read the card's verdict aloud, then close the day:</div>`;
    if (winner) {
      const wc = winner === 'TOWN' ? 'var(--town)' : 'var(--outlaw)';
      body += `<div class="win-banner" style="color:${wc}">🏆 ${winner === 'TOWN' ? 'TOWN WINS' : 'OUTLAWS WIN'}</div>
        <button class="btn gold win" style="border-color:${wc}" data-action="endRound">${winner} win — end the round</button>`;
    } else {
      body += `<button class="btn gold" data-action="nightFalls" ${!s.lastElimination ? 'disabled' : ''}>Night falls again</button>`;
    }
    body += rosterStatus(s);
    app.innerHTML = body;
    wireHold();
    return;
  }

  if (phase === 'ROUND_OVER') {
    const activeNames = (roster || []).filter(p => p.status === 'ACTIVE').map(p => p.name);
    const suggested = activeNames.some(n => n !== s.self.name) ? pickNextModerator(activeNames, s.rotationTally, s.self.name) : '';
    body += narrationCard('GAME_OVER');
    if (suggested) body += `<p class="dim">Suggested next Moderator: ${esc(suggested)}</p>`;
    body += `<div class="card"><div class="step">Next round's roster (remove anyone who left):</div>
      ${(roster || []).filter(p => !p.isModerator).map(p => `<div class="rosterline"><span>${esc(p.name)}</span><button class="rm" data-action="remove" data-name="${esc(p.name)}">remove</button></div>`).join('')}</div>`;
    const handoffWire = QRCodec.encode({ kind: 'handoff', sid: s.sessionId, roundNumber: s.roundNumber + 1, roster: roster || [], rotationTally: s.rotationTally });
    body += ui.showHandoff
      ? `<div class="card center"><div class="step">Next Moderator: scan to take over</div><div id="qr-handoff"></div></div>`
      : `<button class="btn gold" data-action="showHandoff">Hand off Moderator (show QR)</button>`;
    body += `<button class="btn" data-action="stepDown">Handed off — join the next round as a player</button>
      <button class="btn danger" data-action="newGame">New Game Night (wipe this session)</button>`;
    app.innerHTML = body;
    if (ui.showHandoff) $('#qr-handoff')?.appendChild(qrBlock(handoffWire, 190));
    return;
  }
}

function rosterStatus(s) {
  if (!s.roster) return '';
  const rows = s.roster.map(p =>
    `<div class="rosterline ${p.status !== 'ACTIVE' ? 'dead' : ''}"><span>${esc(p.name)}${ui.revealRoster && !p.isModerator ? ' — ' + p.role : ''} [${p.status}]</span></div>`).join('');
  return `<div class="card"><div class="step">Players Status:</div>${rows}
    <div class="reveal-hint" data-hold="roster">${ui.revealRoster ? 'Roles visible — release to hide' : 'Hold to reveal roles (peek privately)'}</div></div>`;
}
function narrationCard(category, victim) {
  const saying = NarrationEngine.pickSaying(category);
  if (!saying) return '';
  const script = NarrationEngine.scriptFor(category, victim);
  return `<div class="card" style="border-color:var(--gold)">
    <div class="dim" style="letter-spacing:2px;font-size:11px">${saying.source.toUpperCase()} · ${NarrationEngine.poetFor(saying)}</div>
    <div style="font-size:24px;margin:8px 0">${saying.tamil}</div>
    <div class="dim" style="font-style:italic">${saying.transliteration}</div>
    <div style="margin-top:8px">${saying.translation}</div>
    <div class="dim" style="margin-top:10px;font-size:13px">📢 ${esc(script)}</div>
  </div>`;
}
function syncQRWire(s) {
  const statusCodes = (s.roster || []).map(p => {
    let code = 'A';
    if (p.isModerator) code = 'M';
    else if (p.status === 'DECEASED') code = 'D';
    else if (p.status === 'ELIMINATED') code = 'E';
    else if (p.status === 'WAITING_FOR_MODERATOR') code = 'W';
    return [p.name, code];
  });
  return QRCodec.encode({ kind: 'sync', sid: s.sessionId, roundNumber: s.roundNumber, phase: s.phase, statusCodes });
}

// Roles QR encryption (async, cached per sid+round)
function ensureRolesQR(s) {
  const key = `${s.sessionId}:${s.roundNumber}`;
  if (ui.rolesCache && ui.rolesCache.key === key) return ui.rolesCache.wire;
  if (ui.rolesCache && ui.rolesCache.computing === key) return null;
  ui.rolesCache = { computing: key };
  (async () => {
    const map = {};
    const outlaws = s.roster.filter(p => p.role === 'OUTLAW').map(p => p.name);
    const codes = { OUTLAW: 'O', DETECTIVE: 'E', DOCTOR: 'D', TOWN: 'T' };
    for (const p of s.roster) {
      if (p.isModerator) continue;
      let plaintext = codes[p.role] || 'T';
      if (p.role === 'OUTLAW') { const c = outlaws.filter(n => n !== p.name); if (c.length) plaintext += '|' + c.join(','); }
      map[p.name] = await QRCodec.encryptRole(plaintext, p.name, s.sessionId, s.roundNumber);
    }
    const wire = QRCodec.encode({ kind: 'roles', sid: s.sessionId, roundNumber: s.roundNumber, encryptedRoles: map });
    ui.rolesCache = { key, wire };
    render();
  })();
  return null;
}

// ---- Hold-to-reveal wiring -------------------------------------------------
function wireHold() {
  document.querySelectorAll('[data-hold]').forEach(el => {
    const key = { role: 'revealRole', ballot: 'peekBallot', roster: 'revealRoster' }[el.dataset.hold];
    const down = (e) => { e.preventDefault(); ui[key] = true; render(); };
    const up = () => { ui[key] = false; render(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  });
}

// ---- Help ------------------------------------------------------------------
function helpScreen() {
  return `<h2>How to Play</h2>
    <p class="dim">Townsquare needs no internet — the game travels between phones as QR codes and spoken cues.</p>
    <div class="card"><div class="step">Objective</div>
      <p>Outlaws win when they equal or outnumber the Townspeople. Townspeople win by voting out every Outlaw.</p></div>
    <div class="card"><div class="step">Flow</div>
      <p>1. Moderator shows the Join QR; each player scans it and shows their joinAck QR back.<br>
      2. Moderator shows one Roles QR — hold your blank card to peek your role.<br>
      3. Silent night: eyes closed, Moderator calls each role and logs targets.<br>
      4. Morning: scan the Sync QR to update who's alive; the day's one scan also unlocks voting.<br>
      5. Discuss, then show your secret ballot QR to the Moderator.<br>
      6. Round over: the Moderator hands off to the next person and everyone scans a fresh Roles QR.</p></div>
    <div class="card"><div class="step">If a scan won't work</div>
      <p>Turn the displaying phone's brightness up, hold phones 15–30 cm apart, avoid glare. No camera? Paste the payload text in any scanner screen.</p></div>
    <button class="btn gold" data-action="closeHelp">Back to the game</button>`;
}

// ---- Event delegation ------------------------------------------------------
const leaveConfirm = () => confirm('Leave this game night? Tell the Moderator — your seat stays in their roster.');

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  const name = t.dataset.name;
  const s = state.session;
  switch (a) {
    case 'help': ui.showHelp = true; render(); break;
    case 'closeHelp': ui.showHelp = false; render(); break;
    case 'createProfile': { const v = ($('#name')?.value || '').trim(); if (v) dispatch({ type: 'PROFILE_CREATED', name: v }); break; }
    case 'clearProfile': dispatch({ type: 'PROFILE_CLEARED' }); break;
    case 'createGame': dispatch({ type: 'SESSION_CREATED' }); break;
    case 'cancelGame': if (!s.roster || s.roster.filter(p => !p.isModerator).length === 0 || confirm('Cancel this game night? Joined players must rescan the real Moderator.')) dispatch({ type: 'SESSION_CANCELLED' }); break;
    case 'scanJoin': openScanner("Scan the Moderator's join QR", handleGenericDecode(['join'], p => dispatch({ type: 'JOIN_SCANNED', payload: p }))); break;
    case 'scanAck': openScanner("Scan Player's joinAck QR", handleGenericDecode(['joinAck'], p => dispatch({ type: 'JOIN_ACK_SCANNED', payload: p }))); break;
    case 'scanRoles': openScanner("Scan Moderator's Roles QR", handleRolesScan); break;
    case 'scanSync': openScanner("Scan Moderator's Sync QR", handleGenericDecode(['sync'], p => { ui.ballotTarget = p.phase !== 'DAY_VOTE' ? null : ui.ballotTarget; dispatch({ type: 'STATE_SYNC_SCANNED', payload: p }); })); break;
    case 'scanHandoff': openScanner('Scan the handoff QR', handleGenericDecode(['handoff'], p => dispatch({ type: 'HANDOFF_SCANNED', payload: p }))); break;
    case 'scanBallot': openScanner("Scan Player's Ballot QR", handleGenericDecode(['ballot'], p => dispatch({ type: 'BALLOT_SCANNED', payload: p }))); break;
    case 'stepDown': openScanner("Scan the new Moderator's Roles QR", handleRolesScan); break;
    case 'remove': if (confirm(`Remove ${name}?`)) dispatch({ type: 'PLAYER_REMOVED', name }); break;
    case 'startRound': ui.rolesCache = null; dispatch({ type: 'ROUND_STARTED' }); break;
    case 'toNight': dispatch({ type: 'PHASE_ADVANCED', to: 'NIGHT' }); break;
    case 'backToRoles': dispatch({ type: 'PHASE_ADVANCED', to: 'ROLE_ASSIGNMENT' }); break;
    case 'night': dispatch({ type: 'NIGHT_ACTION_LOGGED', actor: t.dataset.actor, action: t.dataset.act, target: name }); break;
    case 'resolveNight': dispatch({ type: 'NIGHT_RESOLVED' }); break;
    case 'toNomination': dispatch({ type: 'PHASE_ADVANCED', to: 'DAY_NOMINATION' }); break;
    case 'toVote': dispatch({ type: 'PHASE_ADVANCED', to: 'DAY_VOTE' }); break;
    case 'eliminate': dispatch({ type: 'PLAYER_ELIMINATED', name }); break;
    case 'endRound': ui.showHandoff = false; dispatch({ type: 'ROUND_ENDED' }); break;
    case 'nightFalls': if (s.lastElimination || confirm('No one was voted out. Proceed to night without a banishment?')) dispatch({ type: 'PHASE_ADVANCED', to: 'NIGHT' }); break;
    case 'showHandoff': ui.showHandoff = true; render(); break;
    case 'newGame': if (confirm('New Game Night wipes the whole session — roster, history, everything. Continue?')) { ui.rolesCache = null; ui.showHandoff = false; dispatch({ type: 'GAME_NIGHT_CLEARED' }); } break;
    case 'pickBallot': ui.ballotTarget = name; render(); break;
    case 'changeVote': ui.ballotTarget = null; render(); break;
    case 'leave': if (leaveConfirm()) dispatch({ type: 'SESSION_LEFT' }); break;
    case 'scanPaste': { const v = ($('#scan-paste')?.value || '').trim(); if (v && ui.scanHandler) { const h = ui.scanHandler; closeScanner(); h(v); } break; }
    case 'scanCancel': closeScanner(); break;
  }
});
$('#scan-paste')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = document.querySelector('[data-action="scanPaste"]'); b?.click(); } });

// ---- utils -----------------------------------------------------------------
function esc(str) { return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---- Service worker --------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
