/* ═══════════════════════════════════════════════════════════════
   ui.js  –  UI Controller & FSM Visualiser
   
   Responsibilities:
   • Instantiate TrafficFSM and IntersectionRenderer
   • Wire all HTML controls to FSM actions
   • Update all dashboard widgets on every FSM tick
   • Draw the FSM state-diagram SVG
   • Maintain the event log and state history list
   • Manage the real-time clock
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── DOM helpers ─── */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ─── Instantiate core objects ─── */
const fsm      = new TrafficFSM(onFsmTick);
const renderer = new IntersectionRenderer('intersectionCanvas');
renderer.start();

/* ─── State colours (matches STATES in fsm.js) ─── */
const STATE_COLORS = {
  S0: '#3fb950', S1: '#d29922', S2: '#58a6ff',
  S3: '#e3731a', S4: '#2dd4bf', S5: '#f85149', S6: '#6e7681',
};

/* ─── Statistics uptime tracker ─── */
let _uptimeInterval = null;

/* ═══════════════════════════════════════════════════════════════
   FSM Tick Callback – called ~10×/sec by TrafficFSM
═══════════════════════════════════════════════════════════════ */
function onFsmTick(snap) {
  renderer.update(snap);
  updateStatusBar(snap);
  updateFsmDiagram(snap);
  updateStats(snap);
  updateStateHistory(snap);
  updateSimBadge(snap);
  updatePedStatus(snap);
  updateEmergencyBanner(snap);
}

/* ═══════════════════════════════════════════════════════════════
   STATUS BAR
═══════════════════════════════════════════════════════════════ */
function updateStatusBar(snap) {
  $('fsmStateName').textContent    = snap.running ? `${snap.state} – ${snap.stateName}` : '—';
  $('phaseCountdown').textContent  = snap.running ? `${Math.ceil(snap.remaining)}s`       : '—';
  $('mainRoadSignal').textContent  = snap.running ? snap.mainSignal                        : '—';
  $('sideRoadSignal').textContent  = snap.running ? snap.sideSignal                        : '—';
  $('pedSignalStatus').textContent = snap.running ? (snap.pedWalk ? '🟢 WALK' : '🔴 WAIT') : '—';

  /* Colour the signal indicators */
  const sigColors = { RED:'#ff3b30', YELLOW:'#ffcc00', GREEN:'#34c759', OFF:'#8b949e' };
  $('mainRoadSignal').style.color = sigColors[snap.mainSignal] || '#e6edf3';
  $('sideRoadSignal').style.color = sigColors[snap.sideSignal] || '#e6edf3';

  /* Countdown colour  */
  const rem = snap.remaining;
  $('phaseCountdown').style.color = rem <= 3 ? '#ff3b30' : '#d29922';
}

/* ═══════════════════════════════════════════════════════════════
   SIM BADGE
═══════════════════════════════════════════════════════════════ */
function updateSimBadge(snap) {
  const badge = $('simBadge');
  if (!snap.running) {
    badge.textContent = '● STOPPED';
    badge.className = 'sim-badge';
  } else if (snap.paused) {
    badge.textContent = '⏸ PAUSED';
    badge.className = 'sim-badge paused';
  } else {
    badge.textContent = '● RUNNING';
    badge.className = 'sim-badge running';
  }
}

/* ═══════════════════════════════════════════════════════════════
   PEDESTRIAN STATUS
═══════════════════════════════════════════════════════════════ */
function updatePedStatus(snap) {
  const el = $('pedStatus');
  if (snap.state === 'S4') {
    el.textContent = `🚶 Crossing active – ${Math.ceil(snap.remaining)}s remaining`;
    el.style.color = '#2dd4bf';
  } else if (snap.pedRequested) {
    el.textContent = '⏳ Request queued – will activate at next safe phase';
    el.style.color = '#d29922';
  } else {
    el.textContent = 'No request pending';
    el.style.color = '#8b949e';
  }
}

/* ═══════════════════════════════════════════════════════════════
   EMERGENCY BANNER
═══════════════════════════════════════════════════════════════ */
function updateEmergencyBanner(snap) {
  const banner = $('emergencyBanner');
  if (snap.emActive) {
    banner.classList.remove('hidden');
    $('emergencyBannerText').textContent =
      `EMERGENCY PRIORITY ACTIVE – ${snap.emVehicle} on ${snap.emDirection === 'main' ? 'Main Road' : 'Side Road'}`;
  } else {
    banner.classList.add('hidden');
  }
}

/* ═══════════════════════════════════════════════════════════════
   STATISTICS
═══════════════════════════════════════════════════════════════ */
function updateStats(snap) {
  $('statCycles').textContent      = snap.stats.cycles;
  $('statPedCrossings').textContent = snap.stats.pedCrossings;
  $('statEmEvents').textContent    = snap.stats.emEvents;
  $('statUptime').textContent      = `${Math.floor(snap.stats.uptime)}s`;
}

/* ═══════════════════════════════════════════════════════════════
   STATE HISTORY LIST
═══════════════════════════════════════════════════════════════ */
let _lastHistoryLen = 0;

function updateStateHistory(snap) {
  if (snap.history.length === _lastHistoryLen) return;
  _lastHistoryLen = snap.history.length;

  const container = $('stateHistory');
  container.innerHTML = '';
  snap.history.forEach(h => {
    const div = document.createElement('div');
    div.className = 'sh-entry';
    const dot = document.createElement('span');
    dot.className = 'sh-dot';
    dot.style.background = STATE_COLORS[h.id] || '#666';
    const name = document.createElement('span');
    name.className = 'sh-name';
    name.textContent = `${h.id}: ${h.name}`;
    const time = document.createElement('span');
    time.className = 'sh-time';
    time.textContent = new Date(h.ts).toLocaleTimeString('en-US', { hour12:false });
    div.appendChild(dot);
    div.appendChild(name);
    div.appendChild(time);
    container.appendChild(div);
  });
}

/* ═══════════════════════════════════════════════════════════════
   FSM STATE DIAGRAM (SVG)
═══════════════════════════════════════════════════════════════ */

/* Node layout — horizontal flow across 1060×240 viewBox
   Normal cycle left→right: S0 → S1 → S6 → S2 → S3
   Loop-back arrow from S3 back to S0 (below the row)
   S4 (Pedestrian) branches below S6
   S5 (Emergency) branches above S6
*/
const FSM_NODES = [
  { id: 'S0', name: 'Main Green',    x:  90, y: 110, color: '#3fb950' },
  { id: 'S1', name: 'Main Yellow',   x: 240, y: 110, color: '#d29922' },
  { id: 'S6', name: 'All-Red Clear', x: 400, y: 110, color: '#6e7681' },
  { id: 'S2', name: 'Side Green',    x: 560, y: 110, color: '#58a6ff' },
  { id: 'S3', name: 'Side Yellow',   x: 720, y: 110, color: '#e3731a' },
  { id: 'S4', name: 'Pedestrian',    x: 400, y: 205, color: '#2dd4bf' },
  { id: 'S5', name: 'Emergency',     x: 920, y: 110, color: '#f85149' },
];

/* Edges — defined as { from, to, label, type }
   type: 'straight' | 'loop-back' | 'branch-down' | 'branch-up' | 'side'
*/
const FSM_EDGES = [
  { from:'S0', to:'S1', label:'Green expires',  type:'straight' },
  { from:'S1', to:'S6', label:'Yellow expires', type:'straight' },
  { from:'S6', to:'S2', label:'→ S2',           type:'straight' },
  { from:'S2', to:'S3', label:'Green expires',  type:'straight' },
  { from:'S3', to:'S0', label:'loop back → S0', type:'loop-back' },
  { from:'S6', to:'S4', label:'Ped request',    type:'branch-down' },
  { from:'S4', to:'S6', label:'Walk done',      type:'branch-down-ret' },
  { from:'S3', to:'S5', label:'Emergency',      type:'side' },
  { from:'S5', to:'S6', label:'EM cleared',     type:'side-ret' },
];

let _fsmInitialized  = false;
let _lastActiveState = null;

function updateFsmDiagram(snap) {
  const svg = $('fsmSvg');
  if (!_fsmInitialized) {
    _buildFsmSvg(svg);
    _fsmInitialized = true;
  }
  if (_lastActiveState === snap.state) return;
  _lastActiveState = snap.state;

  FSM_NODES.forEach(n => {
    const circle = svg.querySelector(`#fsm-node-${n.id}`);
    const idLbl  = svg.querySelector(`#fsm-lbl-${n.id}`);
    const namLbl = svg.querySelector(`#fsm-nam-${n.id}`);
    if (!circle) return;
    const active = n.id === snap.state;
    circle.setAttribute('fill',         active ? n.color : '#1c2230');
    circle.setAttribute('stroke',       n.color);
    circle.setAttribute('stroke-width', active ? '4' : '2');
    circle.setAttribute('filter',       active ? 'url(#glow)' : '');
    if (idLbl)  idLbl.setAttribute('fill',  active ? '#fff' : '#c9d1d9');
    if (namLbl) namLbl.setAttribute('fill', active ? '#fff' : '#8b949e');
  });
}

function _buildFsmSvg(svg) {
  svg.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  const R  = 28; // node radius

  /* ── Defs ── */
  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#555"/>
    </marker>
    <marker id="arr-hi" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#8b949e"/>
    </marker>
  `;
  svg.appendChild(defs);

  const nodeMap = {};
  FSM_NODES.forEach(n => { nodeMap[n.id] = n; });

  /* ── Helper: draw a labelled path ── */
  function addEdge(pathD, label, lx, ly, curved = false) {
    const g = document.createElementNS(NS, 'g');

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('stroke', '#3d444d');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arr)');
    g.appendChild(path);

    if (label) {
      /* Semi-transparent label background */
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('x', lx - 36);
      bg.setAttribute('y', ly - 9);
      bg.setAttribute('width', '72');
      bg.setAttribute('height', '13');
      bg.setAttribute('rx', '3');
      bg.setAttribute('fill', 'rgba(13,17,23,0.75)');
      g.appendChild(bg);

      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('x', lx);
      txt.setAttribute('y', ly);
      txt.setAttribute('fill', '#6e7681');
      txt.setAttribute('font-size', '9');
      txt.setAttribute('font-family', 'Segoe UI, system-ui, sans-serif');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('dominant-baseline', 'middle');
      txt.textContent = label;
      g.appendChild(txt);
    }

    svg.appendChild(g);
  }

  /* ── Draw edges first (so nodes render on top) ── */
  FSM_EDGES.forEach(e => {
    const f = nodeMap[e.from];
    const t = nodeMap[e.to];
    if (!f || !t) return;

    switch (e.type) {
      case 'straight': {
        // Horizontal arrow between adjacent nodes
        const x1 = f.x + R, y1 = f.y;
        const x2 = t.x - R, y2 = t.y;
        addEdge(`M${x1},${y1} L${x2},${y2}`, e.label,
                (x1+x2)/2, y1 - 14);
        break;
      }
      case 'loop-back': {
        // Curved arc going below the row from S3 back to S0
        const x1 = f.x, y1 = f.y + R;
        const x2 = t.x, y2 = t.y + R;
        const mid_y = 215;
        addEdge(`M${x1},${y1} C${x1},${mid_y} ${x2},${mid_y} ${x2},${y2}`,
                e.label, (x1+x2)/2, mid_y + 12);
        break;
      }
      case 'branch-down': {
        // S6 → S4: vertical down
        const x1 = f.x, y1 = f.y + R;
        const x2 = t.x, y2 = t.y - R;
        addEdge(`M${x1},${y1} L${x2},${y2}`, e.label, x1 + 42, (y1+y2)/2);
        break;
      }
      case 'branch-down-ret': {
        // S4 → S6: offset return line beside the down line
        const x1 = f.x - 18, y1 = f.y - R;
        const x2 = t.x - 18, y2 = t.y + R;
        addEdge(`M${x1},${y1} L${x2},${y2}`, e.label, x1 - 42, (y1+y2)/2);
        break;
      }
      case 'side': {
        // S3 → S5: horizontal to the right
        const x1 = f.x + R, y1 = f.y - 14;
        const x2 = t.x - R, y2 = t.y - 14;
        addEdge(`M${x1},${y1} Q${(x1+x2)/2},${y1-24} ${x2},${y2}`,
                e.label, (x1+x2)/2, y1 - 32);
        break;
      }
      case 'side-ret': {
        // S5 → S6: goes left back to S6
        const x1 = t.x + R, y1 = t.y;   // S6 right
        const x2 = f.x - R, y2 = f.y;   // S5 left
        addEdge(`M${x2},${y2} Q${(x1+x2)/2},${y1+40} ${x1},${y1}`,
                e.label, (x1+x2)/2, y1 + 52);
        break;
      }
    }
  });

  /* ── Draw nodes on top ── */
  FSM_NODES.forEach(n => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${n.x},${n.y})`);

    /* Outer glow ring (always visible, dim when inactive) */
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('r', R + 5);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', n.color);
    ring.setAttribute('stroke-width', '1');
    ring.setAttribute('opacity', '0.25');
    g.appendChild(ring);

    /* Main circle */
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('id', `fsm-node-${n.id}`);
    circle.setAttribute('r', R);
    circle.setAttribute('fill', '#1c2230');
    circle.setAttribute('stroke', n.color);
    circle.setAttribute('stroke-width', '2');
    g.appendChild(circle);

    /* State ID label (e.g. "S0") */
    const idLbl = document.createElementNS(NS, 'text');
    idLbl.setAttribute('id', `fsm-lbl-${n.id}`);
    idLbl.setAttribute('text-anchor', 'middle');
    idLbl.setAttribute('dominant-baseline', 'middle');
    idLbl.setAttribute('font-size', '13');
    idLbl.setAttribute('font-weight', 'bold');
    idLbl.setAttribute('font-family', 'Segoe UI, system-ui, sans-serif');
    idLbl.setAttribute('fill', '#c9d1d9');
    idLbl.setAttribute('y', '-6');
    idLbl.textContent = n.id;
    g.appendChild(idLbl);

    /* State name label (e.g. "Main Green") */
    const namLbl = document.createElementNS(NS, 'text');
    namLbl.setAttribute('id', `fsm-nam-${n.id}`);
    namLbl.setAttribute('text-anchor', 'middle');
    namLbl.setAttribute('dominant-baseline', 'middle');
    namLbl.setAttribute('font-size', '8');
    namLbl.setAttribute('font-family', 'Segoe UI, system-ui, sans-serif');
    namLbl.setAttribute('fill', '#8b949e');
    namLbl.setAttribute('y', '9');
    namLbl.textContent = n.name;
    g.appendChild(namLbl);

    svg.appendChild(g);
  });
}


/* ═══════════════════════════════════════════════════════════════
   EVENT LOG
═══════════════════════════════════════════════════════════════ */
let _lastLogState = null;
let _lastLogPed   = false;
let _lastLogEm    = false;

function maybeLog(snap) {
  /* Log state changes */
  if (snap.state !== _lastLogState) {
    const cls = { S5:'em', S4:'info', S1:'warn', S3:'warn', S6:'log' }[snap.state] || 'info';
    appendLog(`State → ${snap.state}: ${snap.stateName}`, cls);
    _lastLogState = snap.state;
  }
  /* Log pedestrian */
  if (snap.pedWalk && !_lastLogPed) {
    appendLog('🚶 Pedestrian crossing started', 'info');
  }
  if (!snap.pedWalk && _lastLogPed && snap.state !== 'S0') {
    appendLog('🚶 Pedestrian crossing ended', 'info');
  }
  _lastLogPed = snap.pedWalk;

  /* Log emergency */
  if (snap.emActive && !_lastLogEm) {
    appendLog(`🚨 Emergency: ${snap.emVehicle} on ${snap.emDirection} road`, 'em');
  }
  if (!snap.emActive && _lastLogEm) {
    appendLog('✔ Emergency cleared – resuming normal cycle', 'info');
  }
  _lastLogEm = snap.emActive;
}

function appendLog(msg, cls = '') {
  const log  = $('eventLog');
  const time = new Date().toLocaleTimeString('en-US', { hour12:false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML =
    `<span class="log-time">${time}</span><span class="log-msg ${cls}">${msg}</span>`;
  log.prepend(entry);
  /* Keep max 60 entries */
  while (log.children.length > 60) log.removeChild(log.lastChild);
}

/* Wire logging into FSM tick */
const _origTick = onFsmTick;
function wrappedTick(snap) {
  _origTick(snap);
  maybeLog(snap);
}
fsm.onTick = wrappedTick;

/* ═══════════════════════════════════════════════════════════════
   REAL-TIME CLOCK
═══════════════════════════════════════════════════════════════ */
function updateClock() {
  const now = new Date();
  $('clockBox').textContent = now.toLocaleTimeString('en-US', { hour12:false });
}
setInterval(updateClock, 1000);
updateClock();

/* ═══════════════════════════════════════════════════════════════
   BUTTON WIRING
═══════════════════════════════════════════════════════════════ */

/* ── Start ── */
$('btnStart').addEventListener('click', () => {
  fsm.start();
  appendLog('▶ Simulation started', 'info');
  $('btnStart').disabled  = true;
  $('btnPause').disabled  = false;
  $('btnResume').disabled = true;
});

/* ── Pause ── */
$('btnPause').addEventListener('click', () => {
  fsm.pause();
  appendLog('⏸ Simulation paused', 'warn');
  $('btnPause').disabled  = true;
  $('btnResume').disabled = false;
});

/* ── Resume ── */
$('btnResume').addEventListener('click', () => {
  fsm.resume();
  appendLog('▷ Simulation resumed', 'info');
  $('btnResume').disabled = true;
  $('btnPause').disabled  = false;
});

/* ── Reset ── */
$('btnReset').addEventListener('click', () => {
  fsm.reset();
  appendLog('↺ Simulation reset', 'warn');
  $('btnStart').disabled  = false;
  $('btnPause').disabled  = true;
  $('btnResume').disabled = true;
  _lastLogState = null;
  _lastLogPed   = false;
  _lastLogEm    = false;
  _lastHistoryLen = 0;
  _lastActiveState = null;
  /* Re-draw idle canvas */
  renderer.update(fsm.snapshot());
});

/* ── Mode Toggle ── */
$('modeToggle').addEventListener('change', e => {
  const manual = e.target.checked;
  fsm.setManualMode(manual);
  $('modeLabel').textContent = manual ? 'Manual' : 'Auto';
  $('btnManualNext').classList.toggle('hidden', !manual);
  appendLog(`Mode: ${manual ? 'Manual' : 'Auto'}`, 'warn');
});

/* ── Manual Next ── */
$('btnManualNext').addEventListener('click', () => {
  fsm.manualNext();
  appendLog('⏭ Manual: advance state', 'warn');
});

/* ── Speed Buttons ── */
$$('.speed-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    $$('.speed-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const factor = parseInt(this.dataset.speed, 10);
    fsm.setSpeed(factor);
    appendLog(`Speed set to ${factor}×`, '');
  });
});

/* ── Pedestrian Request ── */
$('btnPedRequest').addEventListener('click', () => {
  if (!fsm._running) {
    appendLog('⚠ Start the simulation first', 'warn');
    return;
  }
  fsm.requestPedestrian();
  appendLog('🚶 Pedestrian crossing requested', 'info');
  $('pedStatus').textContent  = '⏳ Request queued...';
  $('pedStatus').style.color  = '#d29922';
});

/* ── Emergency Trigger ── */
$('btnTriggerEM').addEventListener('click', () => {
  if (!fsm._running) {
    appendLog('⚠ Start the simulation first', 'warn');
    return;
  }
  const vehicle   = document.querySelector('input[name="emVehicle"]:checked')?.value ?? 'Ambulance';
  const direction = $('emDirection').value;
  fsm.triggerEmergency(vehicle, direction);
  appendLog(`🚨 Emergency triggered: ${vehicle} on ${direction} road`, 'em');
  $('btnTriggerEM').disabled = true;
  $('btnClearEM').disabled   = false;
});

/* ── Emergency Clear ── */
$('btnClearEM').addEventListener('click', () => {
  fsm.clearEmergency();
  appendLog('✔ Emergency cleared by operator', 'info');
  $('btnTriggerEM').disabled = false;
  $('btnClearEM').disabled   = true;
});

/* ── Apply Timers ── */
$('btnApplyTimers').addEventListener('click', () => {
  const cfg = {
    green:      parseInt($('cfgGreen').value,  10) || 10,
    yellow:     parseInt($('cfgYellow').value, 10) || 3,
    allRed:     parseInt($('cfgAllRed').value, 10) || 2,
    pedestrian: parseInt($('cfgPed').value,    10) || 8,
    emergency:  parseInt($('cfgEM').value,     10) || 12,
  };
  fsm.applyTimers(cfg);
  appendLog(`⏱ Timers updated: G=${cfg.green}s Y=${cfg.yellow}s R=${cfg.allRed}s P=${cfg.pedestrian}s EM=${cfg.emergency}s`, 'info');
});

/* ═══════════════════════════════════════════════════════════════
   INITIAL RENDER (idle state)
═══════════════════════════════════════════════════════════════ */
renderer.update(fsm.snapshot());
appendLog('🚦 Smart Traffic Light Controller ready', 'info');
appendLog('Press ▶ Start to begin the simulation', '');
_buildFsmSvg($('fsmSvg'));
_fsmInitialized = true;
