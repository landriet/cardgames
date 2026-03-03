# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web implementation of **Scoundrel**, a single-player roguelike card game (Zach Gage & Kurt Bieg, 2011). Built with React 19 + TypeScript + Vite. The frontend now runs through an adapter over the class-based `engine-lib` engine, with additional solver/simulation tooling for analysis.

Full game rules are documented in `src/engine-lib/README.md`.
AI-digestible canonical rules are in `src/engine-lib/RULES_AI.yaml`.

## Rules Sources

- Use `src/engine-lib/README.md` for human-readable narrative rules and examples.
- Use `src/engine-lib/RULES_AI.yaml` for parseable rule constraints, state transitions, and scoring formulas.
- When implementing or modifying gameplay logic, keep engine behavior consistent with both documents; if they diverge, treat `RULES_AI.yaml` as the machine-readable source of truth and update README wording to match.

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
| `npm run build-storybook`          | Static Storybook build                           |

Run a single Vitest test file: `npx vitest run src/features/scoundrel/logic/__tests__/engineAdapter.test.ts`

Run a single engine-lib Jest test: `npx --prefix src/engine-lib jest src/__tests__/clone.test.ts`

## Architecture

### Engine Layers

The codebase contains two engine layers:

**1. Frontend adapter layer** (`src/features/scoundrel/logic/engineAdapter.ts`)

- Converts between UI state (`src/types/scoundrel.ts`) and class-based `engine-lib` objects.
- Key functions: `initGame`, `avoidRoom`, `handleCardAction`, `simulateCardActionHealth`, `getPossibleActions`.
- Used directly by the React UI (`src/features/scoundrel/ScoundrelGame.tsx`).

**2. Core class-based engine** (`src/engine-lib/src/index.ts`, package name `scoundrel-engine`)

- OOP with `Game`, `Player`, `Room`, `DungeonCard`, `MonsterCard`, `WeaponCard`, `PotionCard` classes
- Supports undo operations (`undoEnterRoom`, `undoAvoidRoom`, `undoHandleCardAction`)
- Has its own `package.json`, Jest test suite, and TypeScript config (`CommonJS`, emits to `dist/`)
- Also includes solver/simulation/PIMC modules (`src/engine-lib/src/solver.ts`, `src/engine-lib/src/simulation.ts`, `src/engine-lib/src/pimc.ts`)

**Legacy functional engine** (`src/features/scoundrel/logic/engine.ts`)

- Retained for historical/reference tests and direct state-machine experiments.
- Frontend gameplay no longer depends on this file.

### AI Implementations

| File                                                | Approach                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/features/scoundrel/logic/MCTS.ts`              | Generic Monte Carlo Tree Search (UCB1) infrastructure                                         |
| `src/features/scoundrel/logic/ScoundrelMCTSGame.ts` | Scoundrel adapter for the MCTS `Game<State, Move>` interface                                  |
| `src/engine-lib/src/solver.ts`                      | Exact search/DP solver with transposition-table memoization                                   |
| `src/engine-lib/src/simulation.ts`                  | Monte Carlo simulation utilities built on the class-based engine                              |
| `src/engine-lib/src/pimc.ts`                        | Perfect Information Monte Carlo — samples deck orderings, uses oracle solver per action       |
| `src/engine-lib/demo-ai.ts`                         | CLI/demo entry point using solver output                                                      |
| `src/engine-lib/demo-pimc.ts`                       | CLI entry point for PIMC benchmarks (`npx tsx src/engine-lib/demo-pimc.ts <games> <samples>`) |
| `src/trainAI.ts`                                    | Tabular Q-learning experimentation against frontend state                                     |
| `python_ai/`                                        | Python PPO (TensorFlow) + OpenAI Gym environment                                              |

### Express API Server

`src/api/server.ts` — REST API (port 3001) with in-memory sessions for external AI clients. Endpoints documented in `src/api/README.md`.

### Frontend Structure

```
src/main.tsx → src/router/index.tsx (BrowserRouter)
  ├── /              → pages/Home.tsx
  ├── /demo-cards    → pages/DemoCards.tsx
  └── /scoundrel     → pages/Scoundrel.tsx
                          └── features/scoundrel/ScoundrelGame.tsx
                               ├── logic/engineAdapter.ts (UI ↔ engine-lib bridge)
                               └── components/ (RoomCards, ActionButtons, EquippedWeapon, etc.)
```

## Conventions

- **Formatting**: Prettier (`printWidth: 140`). Pre-commit hook runs `pretty-quick --staged`.
- **Naming**: `PascalCase` for components, `camelCase` for functions/utilities, `*.test.ts` for tests.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`).
- **Testing**: Vitest for frontend/game integration logic. Jest for engine-lib (`src/engine-lib/src/__tests__/`). Cover rule changes with deterministic unit tests.
- **Feature organization**: Domain logic grouped in `src/features/`. Shared UI in `src/components/`.
- **Styling**: Tailwind CSS utility classes.
- **TypeScript**: Strict mode enabled. No unused locals/params.
