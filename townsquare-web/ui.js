// Townsquare Web — UI controller. State → DOM, buttons → reducer, camera loop, QR render.
import {
  appReducer, QRCodec, scanRolesPayload, NarrationEngine,
  MIN_ROLE_HOLDERS, pickNextModerator, setDev, DEV,
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
  revealRole: false, peekBallot: false, revealRoster: false, showHandoff: false, showHelp: false, showSayings: false,
  scanHandler: null, rolesCache: null,
};
// Memo slots for random picks so they stay stable across re-renders (see narrationCard / suggested Moderator).
let _suggestPick = { key: null, name: '' };

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
  $('.help-fab')?.classList.toggle('active', ui.showHelp);
  $('.sayings-fab')?.classList.toggle('active', ui.showSayings);
  if (ui.showHelp) { app.innerHTML = helpScreen(); return; }
  if (ui.showSayings) { app.innerHTML = sayingsScreen(); return; }
  if (!s) { app.innerHTML = setupScreen(); focusName(); return; }
  if (!s.sessionId) { app.innerHTML = homeScreen(s); return; }
  if (s.deviceMode === 'MODERATOR') { renderModerator(s); return; }
  renderPlayer(s);
}
// ---- Setup / Home ----------------------------------------------------------
function setupScreen() {
  return `
    <img class="brandimg-hero" src="icons/icon-192.png" alt="Townsquare" />
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
        <img class="brandimg" src="icons/icon-192.png" alt="Townsquare" style="opacity:.25;filter:grayscale(1)" />
        <h2 style="color:#8A99AD">Night Has Fallen</h2>
        <p class="dim">Close your eyes and listen to the Moderator.</p>
      </div>`;
    return;
  }

  // Gameplay
  const alive = (roster || []).filter(p => p.status === 'ACTIVE' && !p.isModerator && p.name !== self.name).map(p => p.name);
  let body = `<h2>Round ${s.roundNumber}</h2>`;

  if (isDead) {
    body += `<div class="card center">
      <img class="brandimg sm" src="icons/icon-192.png" alt="Townsquare" style="filter:grayscale(1);opacity:.5;margin-bottom:12px" />
      <div class="role" style="color:var(--outlaw);font-size:20px">You are ${self.status}</div>
      <p class="dim">You can no longer vote, act, or speak. Please remain silent.</p></div>`;
  } else {
    const revealed = ui.revealRole;
    const roleColor = { OUTLAW: 'var(--outlaw)', DETECTIVE: 'var(--detective)', DOCTOR: 'var(--doctor)', TOWN: 'var(--town)' }[self.role] || 'var(--dim)';
    body += `<div class="card center" data-hold="role">
      ${revealed
        ? `<div class="dim">You are</div><div class="role" style="color:${roleColor}">${self.role}</div>
           ${self.role === 'OUTLAW' && s.companions && s.companions.length ? `<div class="dim">Fellow outlaws: ${esc(s.companions.join(', '))}</div>` : ''}`
        : `<img class="brandimg" src="icons/icon-192.png" alt="Townsquare" style="margin-bottom:12px" /><div class="reveal-hint">Hold to reveal your role — release to hide</div>`}
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
      <button class="btn gold" data-action="startRound" ${roleHolders.length < MIN_ROLE_HOLDERS ? 'disabled' : ''}>Start Round</button>
      ${roleHolders.length < 6 && roleHolders.length >= 3 ? `<div class="reveal-hint" style="margin-top:8px;">💡 Recommended: 7+ total people (1 Mod + 6 Players) for optimal balance.</div>` : ''}
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
    // Memoize the fair-random suggestion per round+roster so ties don't re-roll each render.
    const suggKey = s.roundNumber + '|' + activeNames.join(',');
    if (_suggestPick.key !== suggKey) {
      _suggestPick = { key: suggKey, name: activeNames.some(n => n !== s.self.name) ? pickNextModerator(activeNames, s.rotationTally, s.self.name) : '' };
    }
    const suggested = _suggestPick.name;
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
  const rows = s.roster.map(p => {
    const canRestore = (p.status === 'DECEASED' || p.status === 'ELIMINATED');
    const restoreBtn = canRestore ? `<button class="rm" style="background:var(--gold);color:#000;padding:2px 8px;border-radius:4px;" data-action="restore" data-name="${esc(p.name)}">Restore / Undo</button>` : '';
    return `<div class="rosterline ${p.status !== 'ACTIVE' ? 'dead' : ''}"><span>${esc(p.name)}${ui.revealRoster && !p.isModerator ? ' — ' + p.role : ''} [${p.status}]</span>${restoreBtn}</div>`;
  }).join('');
  return `<div class="card"><div class="step">Players Status:</div>${rows}
    <div class="reveal-hint" data-hold="roster">${ui.revealRoster ? 'Roles visible — release to hide' : 'Hold to reveal roles (peek privately)'}</div></div>`;
}
// Cache the drawn saying per category so it stays stable across re-renders (mirrors the
// native useMemo([category])) — otherwise the card would re-randomize on every render.
let _narrationPick = { category: null, saying: null };
function narrationCard(category, victim) {
  if (_narrationPick.category !== category) {
    _narrationPick = { category, saying: NarrationEngine.pickSaying(category) };
  }
  const saying = _narrationPick.saying;
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
    <p class="dim">Townsquare is a local, serverless social deduction party game. All state passes screen-to-screen via QR codes. 100% offline with zero network connectivity.</p>

    <div class="card"><div class="step">Objective & Room Size</div>
      <p>Outlaws win when they equal or outnumber the Townspeople. Townspeople win by voting out every Outlaw.<br><br>
      <strong>Room Size:</strong> Designed for 4–17 total people in the same room (1 Moderator + 3 to 16 Players). Recommended: 7+ people for optimal balance. The Moderator role rotates to a new player every round.</p></div>

    <div class="card"><div class="step">1. Join the Lobby</div>
      <p>The Moderator taps "Create Game Night" and shows the Join QR. Players scan it and show their joinAck QR back to register into the lobby.</p></div>

    <div class="card"><div class="step">2. Get Your Role</div>
      <p>The Moderator taps "Start Round" and displays one Roles QR. Every player scans it. Hold your blank card to peek your role privately. Outlaws see their companions' names.</p></div>

    <div class="card"><div class="step">3. The Silent Night</div>
      <p>Everyone closes their eyes. The Moderator calls out roles in turn (Outlaws, Doctor, Detective). Called players open their eyes and point silently to their target.</p></div>

    <div class="card"><div class="step">4. Morning Narration & Sync</div>
      <p>Everyone wakes up. The Moderator reads a classical Tamil moral saying and shows the morning Sync QR. Every player scans it to learn who survived.</p></div>

    <div class="card"><div class="step">5. Discuss, Nominate & Vote</div>
      <p>Townspeople debate and nominate suspects. Each player casts a secret vote on their device, which renders a Ballot QR. The Moderator scans all Ballot QRs to tally the vote and announce the exiled player.</p></div>

    <div class="card"><div class="step">6. Next Round & Moderator Rotation</div>
      <p>When the round ends, the Moderator hands off to the next player. The rotation algorithm ensures fair role distribution.<br><br>
      <span style="color:var(--outlaw)">⚠️ Warning: "New Game Night" wipes the entire session history. Only use it when starting a completely new party.</span></p></div>

    <div class="card"><div class="step">Troubleshooting Scanner & Payload Fallback</div>
      <p>• Turn screen brightness to max.<br>
      • Hold phones 15–30 cm apart in landscape/portrait.<br>
      • If camera is unavailable, tap "DEV: copy payload" under any QR and paste it into the target scanner.</p></div>

    <button class="btn gold" data-action="closeHelp">Back to the game</button>`;
}

// ---- Tamil Moral Wisdom (all 50 sayings, grouped by the game moment they appear in) ----
const SAYING_GROUPS = [
  { cat: 'LOBBY_WELCOME',      title: '🤝 The Lobby',          sub: 'gathering the players' },
  { cat: 'DAY_START_PEACE',   title: '🌅 A Peaceful Morning',  sub: 'the night passed without loss' },
  { cat: 'DAY_START_LOSS',    title: '🌫️ A Grim Morning',      sub: 'a neighbour was taken' },
  { cat: 'NOMINATION_TENSION',title: '⚖️ Nomination',          sub: 'the town debates and accuses' },
  { cat: 'EXECUTION_RESOLVED',title: '🔨 The Verdict',         sub: 'a player is voted out' },
  { cat: 'GAME_OVER',         title: '🏁 Game Over',           sub: 'the round is decided' },
];
function sayingsScreen() {
  const db = NarrationEngine.allByCategory();
  const groups = SAYING_GROUPS.map(g => {
    const items = (db[g.cat] || []).map(sy => `
      <div class="saying">
        <div class="saying-src">${esc(sy.source.toUpperCase())} · ${esc(NarrationEngine.poetFor(sy))}</div>
        <div class="saying-ta">${sy.tamil}</div>
        <div class="saying-tr">${esc(sy.transliteration)}</div>
        <div class="saying-en">${esc(sy.translation)}</div>
      </div>`).join('');
    return `<div class="saying-group"><div class="saying-head">${g.title} <span class="dim">· ${esc(g.sub)}</span></div>${items}</div>`;
  }).join('');
  return `
    <h2>Tamil Moral Wisdom</h2>
    <p class="dim">50 sayings from Avvaiyar &amp; Bharathiyar, woven into the game's narration.</p>
    ${groups}
    <button class="btn gold" data-action="closeSayings">Back to the game</button>`;
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
    // The FABs toggle: tapping the same one again returns to the game. Opening one
    // closes the other (the two overlays are mutually exclusive).
    case 'help': ui.showHelp = !ui.showHelp; if (ui.showHelp) ui.showSayings = false; render(); break;
    case 'closeHelp': ui.showHelp = false; render(); break;
    case 'sayings': ui.showSayings = !ui.showSayings; if (ui.showSayings) ui.showHelp = false; render(); break;
    case 'closeSayings': ui.showSayings = false; render(); break;
    case 'createProfile': { const v = ($('#name')?.value || '').trim(); if (v) dispatch({ type: 'PROFILE_CREATED', name: v }); break; }
    case 'clearProfile': dispatch({ type: 'PROFILE_CLEARED' }); break;
    case 'createGame': dispatch({ type: 'SESSION_CREATED' }); break;
    case 'cancelGame': if (!s.roster || s.roster.filter(p => !p.isModerator).length === 0 || confirm('Cancel this game night? Joined players must rescan the real Moderator.')) dispatch({ type: 'SESSION_CANCELLED' }); break;
    case 'scanJoin': openScanner("Scan the Moderator's join QR", handleGenericDecode(['join'], p => dispatch({ type: 'JOIN_SCANNED', payload: p }))); break;
    case 'restore': dispatch({ type: 'PLAYER_STATUS_RESTORED', name }); break;
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
