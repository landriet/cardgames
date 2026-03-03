# Frontend Migration to New Scoundrel Engine (Design)

## Context

The frontend gameplay currently depends on `src/features/scoundrel/logic/engine.ts`.
The newer engine exists in `src/engine-lib/src/index.ts` and is also used by other consumers (for example solver/AI paths).  
Goal: migrate only the frontend gameplay path to the new engine with minimal or no changes to `engine-lib`.

## Scope

- In scope:
  - React frontend gameplay integration (`src/features/scoundrel/*`)
  - Frontend-facing engine API compatibility layer
  - Frontend tests impacted by migration
- Out of scope:
  - API server migration
  - training/AI and MCTS migration
  - core behavior changes to `src/engine-lib` unless blocked by a hard integration issue

## Requirements

1. Keep `engine-lib` changes to an absolute minimum (prefer zero changes).
2. Preserve current frontend UX:
   - monster weapon/barehanded choice modal behavior
   - deterministic static-deck restart behavior
   - existing UI expectations for health simulation and room display
3. Ensure frontend remains on serializable plain state shape for React ergonomics.

## Approaches Considered

1. Thin adapter + plain UI state (recommended)
   - Pros: minimal UI churn, low risk, easy rollback.
   - Cons: conversion layer complexity.
2. Direct `Game` instance in React state
   - Pros: fewer translation steps.
   - Cons: mutable class in React state, harder testing/serialization, larger UI refactor.
3. Command/reducer hybrid architecture
   - Pros: very clean long-term structure.
   - Cons: overkill for this migration.

Decision: approach 1.

## Proposed Architecture

Create `src/features/scoundrel/logic/engineAdapter.ts` as the only frontend module importing from `src/engine-lib/src/index.ts`.

`engineAdapter.ts` exposes frontend-facing functions compatible with existing usage:

- `initGameWithStaticDeck`
- `handleCardAction`
- `avoidRoom`
- `getPossibleActions`
- `simulateCardActionHealth`

The adapter owns:

- conversion between frontend serializable state and `engine-lib` `Game`
- action execution against `Game`
- compatibility behavior expected by current UI

## Data Flow

1. UI calls adapter function with current plain state.
2. Adapter reconstructs `Game` from state.
3. Adapter resolves selected card in current room by value/type identity.
4. Adapter executes engine action(s).
5. Adapter maps resulting `Game` back to plain state and returns it.

## Compatibility Rules

1. Startup and restart
   - `initGameWithStaticDeck` builds deterministic deck and initializes `Game` accordingly.
   - Adapter ensures returned state matches current frontend playable room expectations.
2. Monster with equipped weapon and no mode
   - Preserve modal flow: return state with `pendingMonsterChoice` instead of auto-choosing.
3. Simulate health
   - Use engine simulation path and return clamped health for UI preview.
4. Skip room
   - Respect engine legality rules; no custom bypasses.

## Error Handling

- Throw explicit errors for invalid card/action timing so UI can keep current `try/catch` handling.
- Validate conversion boundaries to prevent silent state desynchronization.

## Testing Strategy

Add/adjust Vitest coverage around adapter API:

1. deterministic static-deck init.
2. modal branch for monster choice with equipped weapon.
3. simulation parity for weapon vs barehanded monster resolution.
4. skip-room legality and transition behavior.
5. weapon replacement and monsters-on-weapon/discard mapping.

Run:

- `npm run test`
- `npm run lint`

## Risks and Mitigations

1. State mismatch between plain objects and class instances.
   - Mitigation: strict bidirectional mapping helpers and focused adapter tests.
2. Hidden assumptions in legacy UI around action timing.
   - Mitigation: preserve existing function signatures and modal compatibility behavior.
3. Deterministic deck drift.
   - Mitigation: explicit static deck builder test asserting first room cards.

## Rollout Plan

1. Introduce adapter module and mapping utilities.
2. Rewire frontend gameplay imports to adapter.
3. Update tests to target adapter behavior.
4. Verify with test and lint passes.
