# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web implementation of **Scoundrel**, a single-player roguelike card game (Zach Gage & Kurt Bieg, 2011). Built with React 19 + TypeScript + Vite. Includes multiple AI implementations (MCTS, bruteforce DFS, Q-learning, Python PPO) that play the game automatically.

Full game rules are documented in `src/engine-lib/README.md`.

## Commands

| Command                            | Purpose                                          |
| ---------------------------------- | ------------------------------------------------ |
| `npm run dev`                      | Vite dev server with HMR                         |
| `npm run build`                    | Type-check (`tsc -b`) then Vite production build |
| `npm run lint`                     | ESLint                                           |
| `npm run test`                     | Vitest (all tests, once)                         |
| `npm run test:coverage`            | Vitest with v8 coverage                          |
| `npm --prefix src/engine-lib test` | Jest tests for the standalone engine library     |
| `npm run storybook`                | Storybook on port 6006                           |

Run a single Vitest test file: `npx vitest run src/features/scoundrel/logic/engine.test.ts`

Run a single engine-lib Jest test: `npx --prefix src/engine-lib jest src/__tests__/clone.test.ts`

## Architecture

### Two Parallel Game Engines

The codebase has two independent implementations of the Scoundrel game engine:

**1. Functional engine** (`src/features/scoundrel/logic/engine.ts`)

- Pure functions operating on immutable `ScoundrelGameState` objects (plain interfaces in `src/types/scoundrel.ts`)
- Key functions: `initGame`, `enterRoom`, `avoidRoom`, `handleCardAction`, `simulateCardAction`, `dealRoom`, `finalizeRoom`
- Used by the React UI and the frontend AI implementations (MCTS, bruteforce)

**2. Class-based engine** (`src/engine-lib/src/index.ts`, package name `scoundrel-engine`)

- OOP with `Game`, `Player`, `Room`, `DungeonCard`, `MonsterCard`, `WeaponCard`, `PotionCard` classes
- Supports undo operations (`undoEnterRoom`, `undoAvoidRoom`, `undoHandleCardAction`)
- Has its own `package.json`, Jest test suite, and TypeScript config (`CommonJS`, emits to `dist/`)
- Used by `src/engine-lib/demo-ai.ts` and engine-lib tests

### AI Implementations

| File                                                | Approach                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/features/scoundrel/logic/MCTS.ts`              | Generic Monte Carlo Tree Search (UCB1)                                    |
| `src/features/scoundrel/logic/ScoundrelMCTSGame.ts` | Adapts functional engine to MCTS `Game<State,Move>` interface             |
| `src/features/scoundrel/logic/bruteforce.ts`        | Recursive DFS full game tree search                                       |
| `src/engine-lib/src/ai.ts`                          | Stack-based DFS with state serialization memoization (class-based engine) |
| `src/trainAI.ts`                                    | Tabular Q-learning agent                                                  |
| `python_ai/`                                        | Python PPO (TensorFlow) + OpenAI Gym environment                          |

### Express API Server

`src/api/server.ts` — REST API (port 3001) with in-memory sessions for external AI clients. Endpoints documented in `src/api/README.md`.

### Frontend Structure

```
src/main.tsx → src/router/index.tsx (BrowserRouter)
  ├── /              → pages/Home.tsx
  ├── /demo-cards    → pages/DemoCards.tsx
  └── /scoundrel     → pages/Scoundrel.tsx
                          └── features/scoundrel/ScoundrelGame.tsx
                               ├── logic/engine.ts (state machine)
                               └── components/ (RoomCards, ActionButtons, EquippedWeapon, etc.)
```

## Conventions

- **Formatting**: Prettier (`printWidth: 140`). Pre-commit hook runs `pretty-quick --staged`.
- **Naming**: `PascalCase` for components, `camelCase` for functions/utilities, `*.test.ts` for tests.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`).
- **Testing**: Vitest for app/game logic. Jest for engine-lib (`src/engine-lib/src/__tests__/`). Cover rule changes with deterministic unit tests.
- **Feature organization**: Domain logic grouped in `src/features/`. Shared UI in `src/components/`.
- **Styling**: Tailwind CSS utility classes.
- **TypeScript**: Strict mode enabled. No unused locals/params.
