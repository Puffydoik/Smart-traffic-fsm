# 🚦 Smart Traffic Light Controller

> **Live demo:** _coming soon via GitHub Pages_

A fully interactive **Traffic Light Controller** built on a real **Finite State Machine (FSM)**. Simulates a four-way road intersection with normal traffic flow, pedestrian crossings, and emergency vehicle priority — all running in your browser with zero dependencies.

---

## ✨ Features

| Feature | Details |
|---|---|
| **FSM Engine** | 7 states: Main Green, Main Yellow, All-Red Clearance, Side Green, Side Yellow, Pedestrian, Emergency |
| **Top-down Intersection** | Canvas-drawn 4-way road with 12 animated cars, zebra crossings, lane markings |
| **Traffic Lights** | Full red / yellow / green with glow effects on all 4 corners |
| **Pedestrian Crossing** | Request button → safe yellow/clearance → Walk signal + animated pedestrian walker |
| **Emergency Priority** | Ambulance 🚑 / Fire Truck 🚒 / Police 🚓 — highest priority, safe transitions |
| **FSM Diagram** | Full-width horizontal state diagram at the bottom, active state glows |
| **Simulation Controls** | Start / Pause / Resume / Reset, Auto / Manual mode, 1× / 2× / 5× speed |
| **Configurable Timers** | Green, Yellow, All-Red, Pedestrian, Emergency durations — live editable |
| **Statistics & Log** | Cycle counter, pedestrian crossings, emergency events, uptime, event log |

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/Puffydoik/smart-traffic-fsm.git
cd smart-traffic-fsm

# Open in browser (no build step needed)
start index.html        # Windows
open index.html         # macOS
xdg-open index.html     # Linux
```

Or just **[visit the live site](#)** hosted on GitHub Pages.

---

## 🗂️ Project Structure

```
smart-traffic-fsm/
├── index.html      # Dashboard layout
├── style.css       # Dark professional theme
├── fsm.js          # Finite State Machine core logic
├── renderer.js     # Canvas-based intersection renderer
└── ui.js           # UI wiring, FSM diagram SVG, event log
```

---

## 🔄 FSM States

```
S0 (Main Green) → S1 (Main Yellow) → S6 (All-Red) → S2 (Side Green)
→ S3 (Side Yellow) → S6 (All-Red) → S0  [normal cycle]

Pedestrian: any state → yellow → S6 → S4 (Walk) → S6 → resume
Emergency:  any state → yellow → S6 → S5 (Priority) → S6 → resume
```

All transitions are **safety-guaranteed** — no conflicting greens ever occur simultaneously.

---

## 🛠️ Technology

- **Pure Vanilla JS** — no frameworks, no build tools
- **HTML5 Canvas** — for the 2D intersection animation
- **SVG** — for the interactive FSM state diagram
- Runs entirely in the browser as a **static site**

---

## 📄 License

MIT — free to use, modify, and distribute.
