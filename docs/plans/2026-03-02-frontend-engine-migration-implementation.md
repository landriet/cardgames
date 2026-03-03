# Frontend Scoundrel Engine Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Migrate the React frontend gameplay logic from `src/features/scoundrel/logic/engine.ts` to `src/engine-lib/src/index.ts` through a frontend adapter while preserving current UX and deterministic static-deck behavior.

**Architecture:** Introduce `engineAdapter.ts` as a compatibility layer that converts between plain `ScoundrelGameState` objects and `engine-lib` `Game` instances. Keep UI components and state shape stable, including `pendingMonsterChoice` modal semantics. Repoint frontend imports/tests to the adapter and leave `engine-lib` core behavior unchanged.

**Tech Stack:** React, TypeScript, Vite, Vitest, ESLint, `src/engine-lib` classes (`Game`, `DungeonCard`, `MonsterCard`, `WeaponCard`, `PotionCard`, `Player`, `Room`)

---

### Task 1: Add Adapter Skeleton and Initial Contract Tests

**Files:**

- Create: `src/features/scoundrel/logic/engineAdapter.ts`
- Create: `src/features/scoundrel/logic/__tests__/engineAdapter.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { initGameWithStaticDeck } from "../engineAdapter";

describe("engineAdapter init", () => {
  it("creates deterministic starting room for frontend", () => {
    const state = initGameWithStaticDeck();
    expect(state.currentRoom.cards).toEqual([
      { type: "potion", suit: "hearts", rank: 5 },
      { type: "weapon", suit: "diamonds", rank: 7 },
      { type: "monster", suit: "clubs", rank: 3 },
      { type: "monster", suit: "spades", rank: 9 },
    ]);
    expect(state.health).toBe(20);
    expect(state.gameOver).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/scoundrel/logic/__tests__/engineAdapter.test.ts`  
Expected: FAIL because `engineAdapter.ts` does not exist yet.

**Step 3: Write minimal implementation**

```ts
// src/features/scoundrel/logic/engineAdapter.ts
import type { ScoundrelGameState } from "../../../types/scoundrel";

export function initGameWithStaticDeck(): ScoundrelGameState {
  // temporary placeholder; full Game mapping added in Task 2
  return {
    deck: [],
    discard: [],
    currentRoom: { cards: [] },
    equippedWeapon: null,
    lastMonsterDefeated: null,
    monstersOnWeapon: [],
    health: 20,
    maxHealth: 20,
    canDeferRoom: true,
    lastActionWasDefer: false,
    gameOver: false,
    victory: false,
  };
}
```

**Step 4: Implement enough deterministic room logic to pass**

- Add static deck constant in adapter matching current frontend starter cards.
- Return room+deck split in the same shape as current UI expects.

**Step 5: Run test to verify it passes**

Run: `npm run test -- src/features/scoundrel/logic/__tests__/engineAdapter.test.ts`  
Expected: PASS.

**Step 6: Commit**

```bash
git add src/features/scoundrel/logic/engineAdapter.ts src/features/scoundrel/logic/__tests__/engineAdapter.test.ts
git commit -m "test: add adapter init contract and skeleton"
```

### Task 2: Implement State Mapping and Core Actions Through `engine-lib`

**Files:**

- Modify: `src/features/scoundrel/logic/engineAdapter.ts`
- Test: `src/features/scoundrel/logic/__tests__/engineAdapter.test.ts`

**Step 1: Write failing tests for action compatibility**

```ts
import { handleCardAction, simulateCardActionHealth } from "../engineAdapter";

it("returns pendingMonsterChoice when weapon exists and monster mode is omitted", () => {
  const state = {
    ...initGameWithStaticDeck(),
    equippedWeapon: { type: "weapon", suit: "diamonds", rank: 7 },
    currentRoom: { cards: [{ type: "monster", suit: "clubs", rank: 4 }] },
  };
  const next = handleCardAction(state, state.currentRoom.cards[0]);
  expect(next.pendingMonsterChoice?.monster).toEqual(state.currentRoom.cards[0]);
});

it("simulates weapon vs barehanded health deltas", () => {
  const monster = { type: "monster", suit: "spades", rank: 9 } as const;
  const state = {
    ...initGameWithStaticDeck(),
    health: 20,
    equippedWeapon: { type: "weapon", suit: "diamonds", rank: 7 },
    currentRoom: { cards: [monster] },
  };
  expect(simulateCardActionHealth(state, monster, "weapon")).toBe(18);
  expect(simulateCardActionHealth(state, monster, "barehanded")).toBe(11);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/scoundrel/logic/__tests__/engineAdapter.test.ts`  
Expected: FAIL because action methods are incomplete.

**Step 3: Write minimal implementation**

- Implement private mapper functions in adapter:
  - `toEngineGame(state: ScoundrelGameState): Game`
  - `fromEngineGame(game: Game): ScoundrelGameState`
  - `resolveRoomCard(game: Game, card: DungeonCard): EngineDungeonCard`
- Implement exported adapter API:
  - `handleCardAction`
  - `simulateCardActionHealth`
  - `avoidRoom`
  - `getPossibleActions`
- Preserve modal behavior:
  - if clicked card is monster and `state.equippedWeapon` exists and no mode provided, return `{...state, pendingMonsterChoice:{monster: card}}`.

**Step 4: Run focused tests**

Run: `npm run test -- src/features/scoundrel/logic/__tests__/engineAdapter.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/scoundrel/logic/engineAdapter.ts src/features/scoundrel/logic/__tests__/engineAdapter.test.ts
git commit -m "feat: route frontend scoundrel actions through engine-lib adapter"
```

### Task 3: Rewire Frontend Gameplay to Adapter

**Files:**

- Modify: `src/features/scoundrel/ScoundrelGame.tsx`
- Modify: `src/features/scoundrel/logic/__tests__/handleCardAction.test.ts`
- Modify: `src/features/scoundrel/logic/__tests__/engine.test.ts`

**Step 1: Write failing import-level tests**

- In existing frontend logic tests, switch imports from `../engine` to `../engineAdapter`.
- Keep the same assertions initially; run to surface compatibility gaps.

**Step 2: Run tests to verify failures**

Run: `npm run test -- src/features/scoundrel/logic/__tests__/handleCardAction.test.ts src/features/scoundrel/logic/__tests__/engine.test.ts`  
Expected: FAIL due to behavioral gaps in adapter or outdated assertions.

**Step 3: Update UI integration**

- In `ScoundrelGame.tsx`, change:
  - `from "./logic/engine"` -> `from "./logic/engineAdapter"`
- Do not change component contract or modal behavior.

**Step 4: Adjust tests to stable adapter contracts**

- Keep UX-facing assertions only (health, discard, modal pending choice, room transitions).
- Remove assertions that depend on old engine implementation details not required by UI.

**Step 5: Re-run focused tests**

Run: `npm run test -- src/features/scoundrel/logic/__tests__/handleCardAction.test.ts src/features/scoundrel/logic/__tests__/engine.test.ts src/features/scoundrel/logic/__tests__/engineAdapter.test.ts`  
Expected: PASS.

**Step 6: Commit**

```bash
git add src/features/scoundrel/ScoundrelGame.tsx src/features/scoundrel/logic/__tests__/handleCardAction.test.ts src/features/scoundrel/logic/__tests__/engine.test.ts src/features/scoundrel/logic/__tests__/engineAdapter.test.ts
git commit -m "refactor: migrate frontend scoundrel game to engine adapter"
```

### Task 4: Verify End-to-End Frontend Quality Gates

**Files:**

- Modify as needed: `src/features/scoundrel/logic/engineAdapter.ts`
- Modify as needed: frontend tests touched above

**Step 1: Run complete test suite**

Run: `npm run test`  
Expected: PASS with no regressions.

**Step 2: Run lint**

Run: `npm run lint`  
Expected: PASS with no new ESLint violations.

**Step 3: Final cleanup**

- Remove obsolete direct frontend usage of legacy `logic/engine.ts` if fully unused in frontend path.
- Keep non-frontend consumers unchanged.

**Step 4: Commit final fixes (if any)**

```bash
git add src/features/scoundrel/logic/engineAdapter.ts src/features/scoundrel/ScoundrelGame.tsx src/features/scoundrel/logic/__tests__/engineAdapter.test.ts src/features/scoundrel/logic/__tests__/engine.test.ts src/features/scoundrel/logic/__tests__/handleCardAction.test.ts
git commit -m "test: finalize frontend engine migration verification"
```
