# SOLARENA

A browser-based, arcade-style 1v1 fighting game set in a meme-native Solana
universe. Eight Legends, one arena (The Trenches), best-of-three rounds, Tekken-era
energy. The game comes first; crypto is a later, optional layer on top.

*A Memecoin Tek game.*

## What's in it

- **8 playable Legends**, each with light/heavy/crouching/jumping attacks, a throw, a signature special and a super:
  DAUMEN · CHAIRMAN · CATE · DOGE · PEPE · ORANGIE · BUDDHA · DECU
- **Real fighting-game systems:** hitstop, cancels, juggles, armor, counters, throws and throw techs, high/low blocking, a super meter
- **Per-fighter personality:** idle styles, skippable intros, victory animations, win/intro/rival quotes
- **Modes:** Arcade (3 fights → rival → semi-final → final boss), VS CPU, local Versus, Training
- **CPU levels:** Paper Hands, Trencher, Chad, Market Maker. Harder levels only change behavior, never health or damage
- **Training Mode:** dummy behaviors and block modes, hit/hurt boxes, frame data with measured advantage
- **Deterministic replays:** a match is stored as seed + inputs, so VIEW REPLAY and WATCH KO regenerate it exactly
- **Results and sharing:** a full stat table, contextual awards, and a downloadable share card sized for X / Telegram / Discord
- **Beta tools:** anonymous telemetry, a feedback form, a local profile and match history

## Tech

- Vite + TypeScript with a custom Canvas 2D engine (no game framework)
- Fixed-timestep 60 Hz deterministic simulation, kept separate from rendering
- Fighters are drawn in code on a skeletal rig, then given a pixel-art outline pass; hitboxes come from the same poses
- All audio is synthesized at runtime with WebAudio
- `shared/` holds the types the game and the upcoming backend both use

## Running it

Requires Node.js 22 or newer.

```
cd app
npm install
npm run dev        # http://localhost:5190
```

Other commands, run from `app/`:

```
npm run typecheck  # TypeScript check
npm run simtest    # headless CPU-vs-CPU soak test over all 64 matchups, with replay verification
npm run build      # production build into app/dist
```

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| Move | W A S D | Arrows |
| Jump | W / Space | Up |
| Light | J | Numpad 1 / , |
| Heavy | K | Numpad 2 / . |
| Block | L | Numpad 3 / / |
| Special | U | Numpad 5 / ; |
| Dash | Left Shift | Numpad 0 / Right Shift |

- **Super:** Special + Heavy with a full meter
- **Throw:** Block + Light up close (beats blocking)
- **Low attacks:** down + attack (crouch-block them)
- **Jump attacks:** hit high (stand-block them)
- **Gamepads** work too (X/Y/B attack, A jump, RB block, LB dash)

Training hotkeys: F1 hitboxes, F2 hurtboxes, F3 frame data, F4 reset positions, F5 dummy action, F6 dummy block mode.

## Project layout

```
app/       the game (Vite + TypeScript)
  src/sim/     deterministic combat simulation, moves, roster
  src/render/  rig painter, sprite cache, arena, HUD, effects
  src/scenes/  title, select, VS, fight, results, profile
shared/    types shared with the backend (fighters, matches, replays, players, API protocol)
assets/    source roster art (app/scripts/export-art.py crops it into app/public/art)
```

## Roadmap

1. **Now:** closed beta, plus a server backend for player profiles, match history, telemetry and replay verification
2. **Next:** accounts, matchmaking and real-time online PvP on an authoritative server
3. **Later:** wallet linking and a Solana devnet prototype
4. **Only after** a security audit and legal review: anything involving real value
