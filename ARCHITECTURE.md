# NEXUS LUDO — Architecture & Contracts

Stack: React 19, TypeScript (strict-ish, `verbatimModuleSyntax` → use `import type`; `erasableSyntaxOnly` → NO `enum`, NO constructor parameter properties), Vite 8, Three r186, @react-three/fiber 9, @react-three/drei 10, @react-three/postprocessing 3, GSAP 3, Zustand 5, Tailwind CSS 4 (via `@tailwindcss/vite`, theme tokens in `src/index.css`).

Node lives at `/opt/homebrew/bin` — prefix shell commands with `export PATH=/opt/homebrew/bin:$PATH;`.
Typecheck: `npx tsc -p tsconfig.app.json --noEmit`. Tests: `npx vitest run`. Do NOT run long-lived dev servers.

## Layers (strict one-way dependencies)

```
src/game/      PURE rules: types.ts, board.ts (geometry), engine.ts, ai.ts   ← no React/Three
src/core/      fx.ts (typed event bus), theme.ts (palette, seat colours, power-up meta)
src/store/     game.ts (authoritative store + turn controller), settings.ts (persisted), view.ts (camera/quality)
src/scene/     React Three Fiber world (reads stores, listens to fx; never mutates game state except via store intents)
src/ui/        DOM overlay (Tailwind) — menus, HUD, modals
src/audio/     WebAudio procedural sound, driven by fx bus + settings
```

**Shared files (src/game, src/core, src/store, App.tsx, main.tsx, index.css) are owned by the lead. Do not edit them.** If you need a change there, describe it in your final report.

## Board geometry (src/game/board.ts)
- 15×15 grid. Cell (row, col) centre → world `x = col-7, z = row-7`. Board plane = XZ, Y up, 1 unit per cell.
- **Board top surface is y = 0.** Board spans x,z ∈ [-7.5, 7.5]. Tiles may rise ≤ 0.06. Tokens stand on y ≈ 0.06.
- `TRACK[52]` main loop, `HOME_LANES[seat][5]`, `BASE_ORIGIN[seat]` (6×6 quadrants: seat0 top-left (x−,z−), seat1 top-right (x+,z−), seat2 bottom-right (x+,z+), seat3 bottom-left (x−,z+)).
- Centre 3×3 (rows/cols 6–8) is the **Nexus Core** where finished tokens rest (`finishWorld`).
- Helpers: `progressToWorld(seat, progress, index, y)`, `trackCellWorld(cell)`, `baseSlotWorld`, `baseCenterWorld`, `finishWorld`, `stackOffset(i, n)` (offset co-located tokens), `describeBoard()` (every cell with kind: track/safe/start/home/core + seat tint), `SAFE_CELLS`, `START_CELLS`, `STAR_CELLS`, `trackCell(seat, progress)`.
- Base tokens sit at ±1.05 around `baseCenterWorld(seat)`. **The base centre is the dice landing pad**: the die for the current player tumbles onto `baseCenterWorld(current)`.

## Token progress
`-1` base, `0..50` main track, `51..55` home lane, `56` finished. Token id = seat*4+index.

## Seats & colours (src/core/theme.ts → SEAT_THEME)
0 CYAN `#00f0ff`, 1 AMBER `#ffb300`, 2 MAGENTA `#ff2bd6`, 3 VIOLET `#9d4dff`. 2-player games use seats 0 & 2.
Power-ups meta: `POWER_THEME` (shield/boost/reroll/emp → label, colour, icon, desc).

## Store (src/store/game.ts → `useGame`)
State: `screen` ('menu'|'setup'|'game'|'victory'|'results'), `game: GameState|null`, `busy` (animation in flight — ignore input), `paused`, `dice: DiceView|null` ({value, nonce, seat, durationMs, rolling}), `moving: MovingView|null` ({move, hopMs, nonce}), `hoveredToken`, `hint: ScoredMove|null` ({move, score, reasons[]}), `toasts`, `history` (progress samples per move, values[4] in 0..1), `victorySeat`.
Intents: `goto(screen)`, `startGame(config)`, `rematch()`, `quitToMenu()`, `continueAfterVictory()`, `setPaused(b)`, `rollDice()`, `selectToken(id)`, `activatePower(type)`, `skip()`, `hoverToken(id|null)`, `dismissToast(id)`.
Selectors: `selectCurrentPlayer`, `selectIsHumanTurn`. Timing constants `TIMING`, `scaled(ms)` (applies speed setting).

GameState (src/game/types.ts): `players[4]` (inactive seats have `active:false`), `tokens[16]`, `current`, `phase` ('roll'|'move'|'over'), `dice`, `rawDice`, `boosted`, `sixStreak`, `legalMoves: Move[]`, `powerCells: {cell, type}[]`, `turn`, `finishOrder`, `winner`, `mode` ('classic'|'nexus'). Move: `{tokenId, seat, from, to, path[], enters, finishes, captures[], blockedBy[], collects, lands}`.
Engine helpers usable for display: `playerProgress(state, seat)`, `canUsePower(state, power)`, `threatCount`, `tokensOf`.

### Animation handshake
1. **Dice**: store sets `dice = {value, nonce, durationMs, rolling:true}` and emits fx `diceThrow`. The 3D die must tumble and come to rest showing `value` within `durationMs`. Then `rolling` → false and the game state updates.
2. **Move**: store sets `moving = {move, hopMs}` and emits `moveStart`. The moving token must hop through `move.path` (progress values) — one hop per `hopMs` — ending exactly at `progressToWorld(seat, move.to, index)`. Store emits `hop` each landing. After the last hop, `moving` → null and `game` commits (token.progress = move.to, so no snap).
3. After commit the store emits engine events (`capture`, `finish`, `collect`, `emp`, `shieldBlock`, `extraTurn`, `turn`, `win`, …) and waits ~0.9s (scaled) for VFX. A captured token's progress jumps to -1 → its component plays digital disintegration at the old cell and re-materialises in its base slot. EMP-hit tokens have progress decreased by 4 → glitch-slide back.

## FX bus (src/core/fx.ts)
`fx.on('capture', e => …)` returns an unsubscribe fn. `fx.onAny(...)`. Events = all engine `GameEvent`s + `diceThrow`, `moveStart`, `hop`, `uiClick`, `uiHover`, `gameStart`, `victoryStart`. UI should emit `uiClick`/`uiHover` for audio feedback.

## Settings (src/store/settings.ts → `useSettings`)
`intensity` ('low'|'medium'|'high', use `intensityScale()` for particle counts / effect budget), `speed`, volumes, `muted`, `showHints`, `autoMoveSingle`, `cameraMode` ('auto'|'free'), `screenShake`, `set(patch)`.

## View store (src/store/view.ts → `useView`)
`cameraResetNonce`/`resetCamera()`, `topView`/`setTopView()`, `quality`/`setQuality()` (scene's perf monitor writes it), `sceneReady`/`setSceneReady()`.

## Mount points
- `src/scene/Experience.tsx` (scene agent) renders the Canvas and mounts `<Tokens/>` (`src/scene/actors/Tokens.tsx`), `<Dice/>` (`src/scene/actors/Dice.tsx`), `<VFXLayer/>` (`src/scene/vfx/VFXLayer.tsx`) — these three are owned by the actors/VFX agent.
- `src/ui/UIRoot.tsx` (UI agent) — DOM overlay, `pointer-events-none` root with interactive children `pointer-events-auto`, so the canvas receives orbit/click input elsewhere.
- `src/audio/AudioManager.tsx` (audio agent).

## Visual identity
Original cyberpunk "NEXUS" identity: deep blue-black void (`#05030d`), dark brushed metal surfaces, holographic glass, neon cyan / electric purple / hot magenta accents, amber as warning/accent. Typography: Orbitron (display), Rajdhani (UI), JetBrains Mono (data). Scanlines, chamfered corners (clip-path), thin 1px neon strokes, data readouts, subtle glitch.
