/* ═══════════════════════════════════════════════════════════════
   fsm.js  –  Finite State Machine Core for Traffic Light Controller
   
   States:
     S0 – Main Green    (main=GREEN,  side=RED)
     S1 – Main Yellow   (main=YELLOW, side=RED)
     S2 – Side Green    (main=RED,    side=GREEN)
     S3 – Side Yellow   (main=RED,    side=YELLOW)
     S4 – Pedestrian    (main=RED,    side=RED,  ped=WALK)
     S5 – Emergency     (direction dependent)
     S6 – All-Red Clear (safety clearance between phases)

   Normal cycle: S0 → S1 → S6 → S2 → S3 → S6 → S0
   Pedestrian:   current → (yellow if needed) → S6 → S4 → S6 → resume
   Emergency:    current → (yellow if needed) → S6 → S5 → (clear) → S6 → resume
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── Signal enum ── */
const SIG = Object.freeze({ OFF: 'OFF', RED: 'RED', YELLOW: 'YELLOW', GREEN: 'GREEN' });

/* ── State descriptors ── */
const STATES = {
  S0: { id: 'S0', name: 'Main Green',       color: '#3fb950' },
  S1: { id: 'S1', name: 'Main Yellow',      color: '#d29922' },
  S2: { id: 'S2', name: 'Side Green',       color: '#58a6ff' },
  S3: { id: 'S3', name: 'Side Yellow',      color: '#e3731a' },
  S4: { id: 'S4', name: 'Pedestrian',       color: '#2dd4bf' },
  S5: { id: 'S5', name: 'Emergency',        color: '#f85149' },
  S6: { id: 'S6', name: 'All-Red Clear',    color: '#6e7681' },
};

/* ── Default timer durations (seconds) ── */
const DEFAULT_TIMERS = {
  green:     10,
  yellow:    3,
  allRed:    2,
  pedestrian:8,
  emergency: 12,
};

/* ═══════════════════════════════════════════════════════════════
   TrafficFSM – the controller class
═══════════════════════════════════════════════════════════════ */
class TrafficFSM {
  constructor(onTick) {
    this.onTick = onTick;          // Callback called every ~100 ms with full state snapshot

    /* Mutable config (can be changed at runtime) */
    this.timers = { ...DEFAULT_TIMERS };

    /* Runtime state */
    this._state          = 'S0';
    this._elapsed        = 0;       // seconds elapsed in current phase
    this._duration       = 0;       // seconds this phase should last
    this._running        = false;
    this._paused         = false;
    this._speedFactor    = 1;
    this._manualMode     = false;

    /* Request flags */
    this._pedRequested   = false;
    this._pedPending     = false;   // set once we've started servicing the request
    this._emRequested    = false;
    this._emVehicle      = '';
    this._emDirection    = 'main';  // 'main' | 'side'

    /* After-state bookkeeping */
    this._nextState      = null;    // queued next state after S6

    /* Stats */
    this.stats = { cycles: 0, pedCrossings: 0, emEvents: 0, uptime: 0 };

    /* History */
    this.history = [];

    /* Tick interval */
    this._interval       = null;
    this._tickMs         = 100;     // real-time ms per tick

    /* Bind */
    this._tick = this._tick.bind(this);
  }

  /* ── Public API ─────────────────────────────────────────── */

  start() {
    if (this._running) return;
    this._running = true;
    this._paused  = false;
    this._setState('S0');
    this.stats.uptime = 0;
    this._interval = setInterval(this._tick, this._tickMs);
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  reset() {
    clearInterval(this._interval);
    this._interval    = null;
    this._running     = false;
    this._paused      = false;
    this._state       = 'S0';
    this._elapsed     = 0;
    this._duration    = 0;
    this._pedRequested= false;
    this._pedPending  = false;
    this._emRequested = false;
    this._emVehicle   = '';
    this._emDirection = 'main';
    this._nextState   = null;
    this.stats        = { cycles:0, pedCrossings:0, emEvents:0, uptime:0 };
    this.history      = [];
    this._emit();
  }

  requestPedestrian() {
    if (!this._running || this._paused) return;
    this._pedRequested = true;
  }

  triggerEmergency(vehicle, direction) {
    if (!this._running || this._paused) return;
    this._emRequested  = true;
    this._emVehicle    = vehicle;
    this._emDirection  = direction;
  }

  clearEmergency() {
    this._emRequested  = false;
    /* If we are in S5, transition to S6 then back to S0 */
    if (this._state === 'S5') {
      this._nextState = 'S0';
      this._setState('S6');
    }
  }

  setSpeed(factor) {
    this._speedFactor = factor;
  }

  setManualMode(on) {
    this._manualMode = on;
    if (on) {
      /* Freeze the current phase */
    }
  }

  manualNext() {
    /* Advance immediately to next logical state */
    if (!this._running || !this._manualMode) return;
    this._elapsed = this._duration; // force expiry
    this._advanceState();
  }

  applyTimers(cfg) {
    Object.assign(this.timers, cfg);
    /* Refresh current phase duration if it's larger than the new setting */
    this._duration = this._phaseDuration(this._state);
    if (this._elapsed > this._duration) this._elapsed = 0;
  }

  /* ── Snapshot ───────────────────────────────────────────── */

  /**
   * Returns a full snapshot of the current controller state.
   * Used by the renderer and UI.
   */
  snapshot() {
    const s = this._state;
    return {
      state:        s,
      stateName:    STATES[s]?.name ?? s,
      elapsed:      this._elapsed,
      duration:     this._duration,
      remaining:    Math.max(0, this._duration - this._elapsed),
      mainSignal:   this._mainSignal(),
      sideSignal:   this._sideSignal(),
      pedWalk:      this._pedWalk(),
      running:      this._running,
      paused:       this._paused,
      manualMode:   this._manualMode,
      speedFactor:  this._speedFactor,
      pedRequested: this._pedRequested,
      emActive:     this._state === 'S5',
      emVehicle:    this._emVehicle,
      emDirection:  this._emDirection,
      stats:        { ...this.stats },
      history:      [...this.history],
    };
  }

  /* ── Internal tick ──────────────────────────────────────── */

  _tick() {
    if (this._paused || !this._running) {
      this._emit();
      return;
    }

    /* Advance simulation time */
    const dtSec = (this._tickMs / 1000) * this._speedFactor;
    this._elapsed += dtSec;
    this.stats.uptime += dtSec;

    /* Manual mode: don't auto-advance */
    if (!this._manualMode) {
      if (this._elapsed >= this._duration) {
        this._advanceState();
      }
    }

    this._emit();
  }

  /* ── State machine transition logic ─────────────────────── */

  _advanceState() {
    this._elapsed = 0;

    const cur = this._state;

    /* ── Emergency has highest priority ── */
    if (this._emRequested && cur !== 'S5') {
      /* Need safe clearance first */
      if (cur === 'S0' || cur === 'S2') {
        /* Currently on a green; go yellow first */
        const yellowState = cur === 'S0' ? 'S1' : 'S3';
        this._nextState = '__EM__';
        this._setState(yellowState);
        return;
      }
      if (cur === 'S1' || cur === 'S3') {
        /* On yellow; go all-red then emergency */
        this._nextState = '__EM__';
        this._setState('S6');
        return;
      }
      if (cur === 'S6') {
        if (this._nextState === '__EM__') {
          this.stats.emEvents++;
          this._setState('S5');
          return;
        }
      }
    }

    /* ── Pedestrian request (after emergency check) ── */
    if (this._pedRequested && !this._pedPending && cur !== 'S4' && cur !== 'S5') {
      this._pedPending  = true;
      this._pedRequested= false;

      if (cur === 'S0' || cur === 'S2') {
        const yellowState = cur === 'S0' ? 'S1' : 'S3';
        this._nextState = '__PED__';
        this._setState(yellowState);
        return;
      }
      if (cur === 'S1' || cur === 'S3') {
        this._nextState = '__PED__';
        this._setState('S6');
        return;
      }
    }

    /* ── Normal S6 (all-red clearance) resolution ── */
    if (cur === 'S6') {
      if (this._nextState === '__PED__') {
        this._pedPending = false;
        this.stats.pedCrossings++;
        this._nextState = null;
        this._setState('S4');
        return;
      }
      if (this._nextState === '__EM__') {
        this.stats.emEvents++;
        this._nextState = null;
        this._setState('S5');
        return;
      }
      /* Normal clearance – go to queued next */
      const next = this._nextState ?? 'S0';
      this._nextState = null;
      this._setState(next);
      return;
    }

    /* ── Normal cycle ── */
    const normalNext = { S0:'S1', S1:'S6', S2:'S3', S3:'S6', S4:'S6', S5:'S5' };
    let next = normalNext[cur] ?? 'S0';

    /* After S4 clearance, resume from S0 */
    if (cur === 'S4') {
      this._nextState = 'S0';
      this._setState('S6');
      return;
    }

    /* After S6 in normal flow */
    if (next === 'S6') {
      /* Determine what comes after S6 */
      const afterS6 = { S1:'S2', S3:'S0' };
      this._nextState = afterS6[cur] ?? 'S0';
    }

    /* Count full cycles (S3 → S6 → S0) */
    if (cur === 'S3') this.stats.cycles++;

    this._setState(next);
  }

  _setState(id) {
    this._state    = id;
    this._elapsed  = 0;
    this._duration = this._phaseDuration(id);

    /* Record history (keep last 20) */
    this.history.unshift({ id, name: STATES[id]?.name ?? id, ts: Date.now() });
    if (this.history.length > 20) this.history.pop();
  }

  _phaseDuration(id) {
    switch (id) {
      case 'S0':
      case 'S2': return this.timers.green;
      case 'S1':
      case 'S3': return this.timers.yellow;
      case 'S4': return this.timers.pedestrian;
      case 'S5': return this.timers.emergency;
      case 'S6': return this.timers.allRed;
      default:   return 5;
    }
  }

  /* ── Signal helpers ──────────────────────────────────────── */

  _mainSignal() {
    switch (this._state) {
      case 'S0': return SIG.GREEN;
      case 'S1': return SIG.YELLOW;
      default:   return SIG.RED;
    }
  }

  _sideSignal() {
    switch (this._state) {
      case 'S2': return SIG.GREEN;
      case 'S3': return SIG.YELLOW;
      default:   return SIG.RED;
    }
  }

  _pedWalk() {
    return this._state === 'S4';
  }

  /* ── Emit to callback ────────────────────────────────────── */
  _emit() {
    if (this.onTick) this.onTick(this.snapshot());
  }
}

/* Export as global so other scripts can use it */
window.TrafficFSM = TrafficFSM;
window.SIG        = SIG;
window.STATES     = STATES;
