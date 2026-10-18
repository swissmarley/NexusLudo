# NEXUS LUDO

A premium, fully playable **3D cyberpunk Ludo** game — a floating holographic board, neon lighting, animated circuitry, cinematic effects and a sci-fi interface. Runs entirely in the browser.

**▶ Play it: https://swissmarley.github.io/NexusLudo/**

## Features

- **Complete Ludo rules for 2–4 players** — launch on a 6, bonus rolls (6 / capture / reaching the core), triple-six forfeit, safe cells, exact roll to finish, final placings.
- **Local multiplayer + AI** — easy / normal / hard opponents and strategic move suggestions with explained reasons.
- **NEXUS mode** — optional power-ups: Aegis Shield, Overdrive (+2), Quantum Reroll, EMP Pulse.
- **Cinematic 3D** — physics-style dice, glowing energy-core tokens with neon trails, holographic path previews, capture shockwaves and digital disintegration, six-roll energy effects, victory fireworks and camera sequences.
- **Procedural audio** — every sound and the generative music bed are synthesized with the Web Audio API (no audio files).
- **Stats & settings** — live player statistics and progress chart; configurable effect intensity, game speed, volume, camera mode, screen shake.
- **Responsive** — desktop, phone portrait and landscape layouts.

### Controls

| Input | Action |
|---|---|
| `Space` / `Enter` | Roll the die |
| `1`–`4` | Move that unit |
| `H` / `T` / `C` / `S` | Toggle hints / top view / reset camera / stats |
| `Esc` | Pause |
| Drag / scroll / pinch | Orbit and zoom the camera |

## Tech

React 19 · TypeScript · Vite · Three.js · React Three Fiber · Drei · postprocessing · GSAP · Zustand · Tailwind CSS 4 · custom GLSL shaders.

Architecture in one line: a pure, tested rules engine (`src/game`) → one authoritative Zustand store and turn controller (`src/store`) → presentation layers (3D scene, UI, audio) that react to a typed FX event bus (`src/core/fx.ts`). See [ARCHITECTURE.md](ARCHITECTURE.md).

## Development

```bash
npm install
npm run dev        # start the dev server
npm run typecheck  # TypeScript
npm test           # rules engine, AI and full-match controller tests
npm run build      # production build into dist/
```

Pushes to `main` are type-checked, tested and deployed to GitHub Pages by `.github/workflows/deploy.yml`.
