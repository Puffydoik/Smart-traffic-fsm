# 🚦 Smart Traffic Light Controller

> **Live demo:** [https://puffydoik.github.io/Smart-traffic-fsm/](https://puffydoik.github.io/Smart-traffic-fsm/)

A fully interactive **Traffic Light Controller** built on a real **Finite State Machine (FSM)**. Simulates a four-way road intersection with normal traffic flow, pedestrian crossings, and emergency vehicle priority — all running in your browser with zero dependencies.

---

## ✨ Features

| Feature | Details |
|---|---|
| **FSM Engine** | 16-state cycle: Straight/Right, Left-Turn, All-Red Clearance, and Pedestrian phases for both directions, plus Emergency Priority |
| **Multi-Lane Intersection** | Canvas-drawn 4-way road with dedicated inner Left-Turn lanes and outer Straight/Right lanes |
| **Traffic Lights** | Complex signal clusters with independent Straight/Right and Left-Turn indicators |
| **Pedestrian Crossing** | Permanent, automatic phases integrated directly into the FSM traffic cycle |
| **Emergency Priority** | Ambulance 🚑 / Fire Truck 🚒 / Police 🚓 — safely interrupts FSM cycle and resumes afterward |
| **FSM Diagram** | Full-width "snake" state diagram at the bottom, active state glows |
| **Simulation Controls** | Start / Pause / Resume / Reset, Auto / Manual mode, 1× / 2× / 5× speed |
| **Configurable Timers** | Green, Yellow, All-Red, Pedestrian, Emergency durations — live editable |
| **Statistics & Log** | Cycle counter, pedestrian crossings, emergency events, uptime, event log |

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/Puffydoik/Smart-traffic-fsm.git
cd Smart-traffic-fsm

# Open in browser (no build step needed)
start index.html        # Windows
open index.html         # macOS
xdg-open index.html     # Linux
```

Or just **[visit the live site](https://puffydoik.github.io/Smart-traffic-fsm/)** hosted on GitHub Pages.

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

The simulation follows a robust **16-state permanent cycle** to ensure complete safety:

```
NS Straight/Right → Yellow → All-Red
NS Left Turn → Yellow → All-Red
Pedestrian Crossing → All-Red
EW Straight/Right → Yellow → All-Red
EW Left Turn → Yellow → All-Red
Pedestrian Crossing → All-Red
(Repeat)
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
