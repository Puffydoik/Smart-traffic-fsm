/* ═══════════════════════════════════════════════════════════════
   ui.js  –  UI Controller & FSM Visualiser
═══════════════════════════════════════════════════════════════ */

'use strict';

const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const fsm      = new TrafficFSM(onFsmTick);
const renderer = new IntersectionRenderer('intersectionCanvas');
renderer.start();

const STATE_COLORS = {
  S0: '#3fb950', S1: '#d29922', S2: '#6e7681', S3: '#58a6ff', S4: '#e3731a', S5: '#6e7681',
  S6: '#2dd4bf', S7: '#6e7681', S8: '#3fb950', S9: '#d29922', S10: '#6e7681', S11: '#58a6ff',
  S12: '#e3731a', S13: '#6e7681', S14: '#2dd4bf', S15: '#6e7681', S_EM: '#f85149'
};

function onFsmTick(snap) {
  renderer.update(snap);
  updateStatusBar(snap);
  updateFsmDiagram(snap);
  updateStats(snap);
  updateStateHistory(snap);
  updateSimBadge(snap);
  updateEmergencyBanner(snap);
}

function updateStatusBar(snap) {
  $('fsmStateName').textContent    = snap.running ? `${snap.state} – ${snap.stateName}` : '—';
  $('phaseCountdown').textContent  = snap.running ? `${Math.ceil(snap.remaining)}s`       : '—';
  $('nsSRSignal').textContent  = snap.running ? snap.nsSR : '—';
  $('nsLSignal').textContent   = snap.running ? snap.nsL  : '—';
  $('ewSRSignal').textContent  = snap.running ? snap.ewSR : '—';
  $('ewLSignal').textContent   = snap.running ? snap.ewL  : '—';
  $('pedSignalStatus').textContent = snap.running ? (snap.pedWalk ? '🟢 WALK' : '🔴 WAIT') : '—';

  const sigColors = { RED:'#ff3b30', YELLOW:'#ffcc00', GREEN:'#34c759', OFF:'#8b949e' };
  $('nsSRSignal').style.color = sigColors[snap.nsSR] || '#e6edf3';
  $('nsLSignal').style.color  = sigColors[snap.nsL] || '#e6edf3';
  $('ewSRSignal').style.color = sigColors[snap.ewSR] || '#e6edf3';
  $('ewLSignal').style.color  = sigColors[snap.ewL] || '#e6edf3';
  $('phaseCountdown').style.color = snap.remaining <= 3 ? '#ff3b30' : '#d29922';
}

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

function updateEmergencyBanner(snap) {
  const banner = $('emergencyBanner');
  if (snap.emActive) {
    banner.classList.remove('hidden');
    $('emergencyBannerText').textContent =
      `EMERGENCY PRIORITY ACTIVE – ${snap.emVehicle} on ${snap.emDirection === 'main' ? 'North/South' : 'East/West'}`;
  } else {
    banner.classList.add('hidden');
  }
}

function updateStats(snap) {
  $('statCycles').textContent      = snap.stats.cycles;
  $('statPedCrossings').textContent = snap.stats.pedCrossings;
  $('statEmEvents').textContent    = snap.stats.emEvents;
  $('statUptime').textContent      = `${Math.floor(snap.stats.uptime)}s`;
}

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

const FSM_NODES = [
  { id: 'S0', name: 'N/S S/R Green',    x:  70, y: 50, color: '#3fb950' },
  { id: 'S1', name: 'N/S S/R Yellow',   x: 200, y: 50, color: '#d29922' },
  { id: 'S2', name: 'All-Red',          x: 330, y: 50, color: '#6e7681' },
  { id: 'S3', name: 'N/S Left Green',   x: 460, y: 50, color: '#58a6ff' },
  { id: 'S4', name: 'N/S Left Yellow',  x: 590, y: 50, color: '#e3731a' },
  { id: 'S5', name: 'All-Red',          x: 720, y: 50, color: '#6e7681' },
  { id: 'S6', name: 'Ped Walk',         x: 850, y: 50, color: '#2dd4bf' },
  { id: 'S7', name: 'All-Red',          x: 980, y: 50, color: '#6e7681' },

  { id: 'S8', name: 'E/W S/R Green',    x: 980, y: 170, color: '#3fb950' },
  { id: 'S9', name: 'E/W S/R Yellow',   x: 850, y: 170, color: '#d29922' },
  { id: 'S10',name: 'All-Red',          x: 720, y: 170, color: '#6e7681' },
  { id: 'S11',name: 'E/W Left Green',   x: 590, y: 170, color: '#58a6ff' },
  { id: 'S12',name: 'E/W Left Yellow',  x: 460, y: 170, color: '#e3731a' },
  { id: 'S13',name: 'All-Red',          x: 330, y: 170, color: '#6e7681' },
  { id: 'S14',name: 'Ped Walk',         x: 200, y: 170, color: '#2dd4bf' },
  { id: 'S15',name: 'All-Red',          x: 70, y: 170, color: '#6e7681' },
  
  { id: 'S_EM',name: 'Emergency',       x: 525, y: 110, color: '#f85149' }
];

const FSM_EDGES = [
  { from:'S0', to:'S1', label:'' }, { from:'S1', to:'S2', label:'' }, { from:'S2', to:'S3', label:'' },
  { from:'S3', to:'S4', label:'' }, { from:'S4', to:'S5', label:'' }, { from:'S5', to:'S6', label:'' },
  { from:'S6', to:'S7', label:'' }, { from:'S7', to:'S8', label:'' }, { from:'S8', to:'S9', label:'' },
  { from:'S9', to:'S10', label:'' }, { from:'S10', to:'S11', label:'' }, { from:'S11', to:'S12', label:'' },
  { from:'S12', to:'S13', label:'' }, { from:'S13', to:'S14', label:'' }, { from:'S14', to:'S15', label:'' },
  { from:'S15', to:'S0', label:'' }
];

let _fsmInitialized  = false;
let _lastActiveState = null;

function updateFsmDiagram(snap) {
  const svg = $('fsmSvg');
  if (!_fsmInitialized) { _buildFsmSvg(svg); _fsmInitialized = true; }
  if (_lastActiveState === snap.state) return;
  _lastActiveState = snap.state;

  FSM_NODES.forEach(n => {
    const circle = svg.querySelector(`#fsm-node-${n.id}`);
    const idLbl  = svg.querySelector(`#fsm-lbl-${n.id}`);
    const namLbl = svg.querySelector(`#fsm-nam-${n.id}`);
    if (!circle) return;
    const active = n.id === snap.state;
    circle.setAttribute('fill', active ? n.color : '#1c2230');
    circle.setAttribute('stroke', n.color);
    circle.setAttribute('stroke-width', active ? '4' : '2');
    circle.setAttribute('filter', active ? 'url(#glow)' : '');
    if (idLbl) idLbl.setAttribute('fill', active ? '#fff' : '#c9d1d9');
    if (namLbl) namLbl.setAttribute('fill', active ? '#fff' : '#8b949e');
  });
}

function _buildFsmSvg(svg) {
  svg.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  const R  = 28;

  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#555"/>
    </marker>
  `;
  svg.appendChild(defs);

  const nodeMap = {};
  FSM_NODES.forEach(n => { nodeMap[n.id] = n; });

  function addEdge(pathD, label, lx, ly) {
    const g = document.createElementNS(NS, 'g');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('stroke', '#3d444d');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arr)');
    g.appendChild(path);
    svg.appendChild(g);
  }

  FSM_EDGES.forEach(e => {
    const f = nodeMap[e.from], t = nodeMap[e.to];
    if (!f || !t) return;

    if (f.y === t.y) {
      if (f.x < t.x) addEdge(`M${f.x+R},${f.y} L${t.x-R},${t.y}`); // Right
      else addEdge(`M${f.x-R},${f.y} L${t.x+R},${t.y}`); // Left
    } else if (f.x === t.x) {
      if (f.y < t.y) addEdge(`M${f.x},${f.y+R} L${t.x},${t.y-R}`); // Down
      else addEdge(`M${f.x},${f.y-R} L${t.x},${t.y+R}`); // Up
    }
  });

  FSM_NODES.forEach(n => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${n.x},${n.y})`);

    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('r', R + 5);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', n.color);
    ring.setAttribute('stroke-width', '1');
    ring.setAttribute('opacity', '0.25');
    g.appendChild(ring);

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('id', `fsm-node-${n.id}`);
    circle.setAttribute('r', R);
    circle.setAttribute('fill', '#1c2230');
    circle.setAttribute('stroke', n.color);
    circle.setAttribute('stroke-width', '2');
    g.appendChild(circle);

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

    const namLbl = document.createElementNS(NS, 'text');
    namLbl.setAttribute('id', `fsm-nam-${n.id}`);
    namLbl.setAttribute('text-anchor', 'middle');
    namLbl.setAttribute('dominant-baseline', 'middle');
    namLbl.setAttribute('font-size', '8');
    namLbl.setAttribute('font-family', 'Segoe UI, system-ui, sans-serif');
    namLbl.setAttribute('fill', '#8b949e');
    namLbl.setAttribute('y', '9');
    
    // Split long names into two lines if needed
    const parts = n.name.split(' ');
    if (parts.length > 2) {
       const l1 = parts.slice(0, 2).join(' ');
       const l2 = parts.slice(2).join(' ');
       namLbl.innerHTML = `<tspan x="0" y="8">${l1}</tspan><tspan x="0" y="18">${l2}</tspan>`;
    } else {
       namLbl.textContent = n.name;
    }
    
    g.appendChild(namLbl);
    svg.appendChild(g);
  });
}

let _lastLogState = null;
let _lastLogPed   = false;
let _lastLogEm    = false;

function maybeLog(snap) {
  if (snap.state !== _lastLogState) {
    const cls = { S_EM:'em', S6:'info', S14:'info' }[snap.state] || 'log';
    appendLog(`State → ${snap.state}: ${snap.stateName}`, cls);
    _lastLogState = snap.state;
  }
  if (snap.pedWalk && !_lastLogPed) appendLog('🚶 Pedestrian crossing started', 'info');
  if (!snap.pedWalk && _lastLogPed && snap.state !== 'S0') appendLog('🚶 Pedestrian crossing ended', 'info');
  _lastLogPed = snap.pedWalk;

  if (snap.emActive && !_lastLogEm) appendLog(`🚨 Emergency: ${snap.emVehicle} on ${snap.emDirection} road`, 'em');
  if (!snap.emActive && _lastLogEm) appendLog('✔ Emergency cleared – resuming normal cycle', 'info');
  _lastLogEm = snap.emActive;
}

function appendLog(msg, cls = '') {
  const log  = $('eventLog');
  const time = new Date().toLocaleTimeString('en-US', { hour12:false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg ${cls}">${msg}</span>`;
  log.prepend(entry);
  while (log.children.length > 60) log.removeChild(log.lastChild);
}

const _origTick = onFsmTick;
function wrappedTick(snap) {
  _origTick(snap);
  maybeLog(snap);
}
fsm.onTick = wrappedTick;

function updateClock() {
  const now = new Date();
  $('clockBox').textContent = now.toLocaleTimeString('en-US', { hour12:false });
}
setInterval(updateClock, 1000);
updateClock();

$('btnStart').addEventListener('click', () => {
  fsm.start();
  appendLog('▶ Simulation started', 'info');
  $('btnStart').disabled  = true;
  $('btnPause').disabled  = false;
  $('btnResume').disabled = true;
});

$('btnPause').addEventListener('click', () => {
  fsm.pause();
  appendLog('⏸ Simulation paused', 'warn');
  $('btnPause').disabled  = true;
  $('btnResume').disabled = false;
});

$('btnResume').addEventListener('click', () => {
  fsm.resume();
  appendLog('▷ Simulation resumed', 'info');
  $('btnResume').disabled = true;
  $('btnPause').disabled  = false;
});

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
  renderer.update(fsm.snapshot());
});

$('modeToggle').addEventListener('change', e => {
  const manual = e.target.checked;
  fsm.setManualMode(manual);
  $('modeLabel').textContent = manual ? 'Manual' : 'Auto';
  $('btnManualNext').classList.toggle('hidden', !manual);
  appendLog(`Mode: ${manual ? 'Manual' : 'Auto'}`, 'warn');
});

$('btnManualNext').addEventListener('click', () => {
  fsm.manualNext();
  appendLog('⏭ Manual: advance state', 'warn');
});

$$('.speed-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    $$('.speed-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const factor = parseInt(this.dataset.speed, 10);
    fsm.setSpeed(factor);
    appendLog(`Speed set to ${factor}×`, '');
  });
});

$('btnTriggerEM').addEventListener('click', () => {
  if (!fsm._running) { appendLog('⚠ Start the simulation first', 'warn'); return; }
  const vehicle   = document.querySelector('input[name="emVehicle"]:checked')?.value ?? 'Ambulance';
  const direction = $('emDirection').value;
  fsm.triggerEmergency(vehicle, direction);
  appendLog(`🚨 Emergency triggered: ${vehicle} on ${direction} road`, 'em');
  $('btnTriggerEM').disabled = true;
  $('btnClearEM').disabled   = false;
});

$('btnClearEM').addEventListener('click', () => {
  fsm.clearEmergency();
  appendLog('✔ Emergency cleared by operator', 'info');
  $('btnTriggerEM').disabled = false;
  $('btnClearEM').disabled   = true;
});

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

renderer.update(fsm.snapshot());
appendLog('🚦 Smart Traffic Light Controller ready', 'info');
appendLog('Press ▶ Start to begin the simulation', '');
_buildFsmSvg($('fsmSvg'));
_fsmInitialized = true;
