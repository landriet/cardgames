# Optimal Solver for Scoundrel Difficulty Analysis

## Goal

Build an AI that plays Scoundrel optimally for a given deck order, then run it over thousands of random shuffles to measure win rates and score distributions. Use this to compare game difficulty across rule changes.

## Approach: Oracle DFS Solver + Monte Carlo Sampling

**Oracle solver**: For a known deck order (perfect information), find the optimal sequence of actions using depth-first search with undo/redo on a single mutable `Game` instance.

**Monte Carlo outer loop**: Generate N random deck shuffles, solve each one, aggregate statistics (win rate, average score, median score, distribution).

This eliminates AI quality as a variable — difficulty differences between rule sets are measured by what's theoretically achievable, not by how well a heuristic player adapts.

## Foundation: Engine B (`engine-lib/`) Cleanup

Engine B is the class-based engine with `Game`, `Player`, `Room`, and card classes. It already has undo methods and `clone()`, but the undo system has 6 critical bugs that must be fixed first.

### Cleanup

- Remove dead `import e from "express"` in `index.ts`
- Remove unused dependencies (`lodash`, `readline-sync`, `workerpool`)
- Fix `Game.clone()`: use `Object.create(Game.prototype)` to skip constructor side-effects
- Deep-clone `lastAction.card`, `.previousWeapon`, `.previousMonsters` in `clone()`

### Undo Bug Fixes

Root cause: `applyTurnRules()` calls `dealRoom()` as a side-effect. Methods that call `applyTurnRules()` at the end (`handleCardAction`, `avoidRoom`) have undo counterparts that don't reverse the deal.

**Fix**: Separate `applyTurnRules` from `dealRoom`. The solver controls when rooms are dealt explicitly.

Specific fixes (each TDD — test first, then fix):

| Bug                     | Location                              | Fix                                                                                     |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| Guard inverted          | `undoEnterRoom`                       | Flip `!this.roomBeingEntered` to `this.roomBeingEntered`                                |
| Completely broken       | `undoAvoidRoom`                       | Store original room cards before avoid; restore on undo; handle dealRoom reversal       |
| Damage sign reversed    | `Player.undoFightMonster` weapon mode | Change `Math.max(weapon.rank - card.rank, 0)` to `Math.max(card.rank - weapon.rank, 0)` |
| Discard not cleaned     | `undoHandleCardAction` weapon branch  | Remove old weapon + old monsters from discard on undo                                   |
| Never fires             | `undoApplyTurnRules`                  | Fix condition and slice direction; or remove in favor of explicit dealRoom control      |
| Missing call            | `undoHandleCardAction`                | Call `undoApplyTurnRules` or handle deal reversal explicitly                            |
| lastAction not restored | `undoEnterRoom`, `undoAvoidRoom`      | Track `previousLastAction`, restore on undo                                             |

## DFS Solver Design

### Algorithm

```
function solve(game: Game): BestResult
    if terminal → return score
    stateKey = compactHash(game)
    if transpositionTable.has(stateKey) → return cached

    bestResult = null
    for action in getPossibleActions() (ordered):
        if isDominated(action) → skip
        game.doAction(action)
        result = solve(game)
        game.undoAction(action)
        if result > bestResult → bestResult = result
        if bestResult.victory → break  // can't do better than winning

    transpositionTable.set(stateKey, bestResult)
    return bestResult
```

### Key decisions

- **Recursive DFS** (not iterative stack) — undo requires strict LIFO; max depth ~44, no overflow risk
- **Transposition table** — `Map<string, Result>`, collision-free string keys
- **Victory cutoff** — stop exploring once a winning path is found from a state
- **Action ordering** — weapons first, weapon-kills, potions, barehanded last
- **Dominated strategy pruning**:
  - Weapon kill at 0 damage available → skip barehanded
  - Health drops to <=0 → prune
  - Second potion in room → no-op

### doAction / undoAction

Thin dispatcher calling the right method pair:

- `enterRoom` / `undoEnterRoom`
- `avoidRoom` / `undoAvoidRoom`
- `handleCardAction(card, mode)` / `undoHandleCardAction()`

The solver explicitly controls `dealRoom` after resolving 3 cards and undoes the deal before undoing the 3rd card. `applyTurnRules` is not called during search.

## Compact State Hashing

Instead of `JSON.stringify` (~500+ chars), concatenate minimum discriminating values:

```
key = `${deckIndex}|${roomCardIds}|${health}|${weaponRank}|${lastMonsterRank}|${monstersOnWeaponIds}|${flags}`
```

Card "ids" are their index in the original 44-card deck. Flags pack into a single digit. Produces ~30-50 char keys.

Collision-free string keys over Zobrist hashing — correctness over marginal speed for a measurement tool. Can switch to Zobrist later if profiling shows this is the bottleneck.

## Rule Parameterization

```typescript
interface RuleConfig {
  startingHealth: number; // default 20
  maxHealth: number; // default 20
  potionsPerRoom: number; // default 1
  canSkipRooms: boolean; // default true
  canSkipConsecutive: boolean; // default false
  weaponKillLimit: boolean; // default true
  deckComposition: "standard" | "custom";
  customDeck?: DungeonCard[];
}
```

`Game` constructor takes optional `RuleConfig`. All game methods respect these parameters.

## Monte Carlo Runner

```typescript
interface SimulationResult {
  winRate: number;
  avgScore: number;
  medianScore: number;
  scoreDistribution: number[];
  totalGames: number;
  avgNodesExplored: number;
}

function runSimulation(rules: RuleConfig, numGames: number): SimulationResult;
```

### CLI entry point

```
npx ts-node src/engine-lib/run-simulation.ts --games 10000 --health 15
npx ts-node src/engine-lib/run-simulation.ts --config rules-no-skip.json
```

## What to delete

- `src/features/scoundrel/logic/engine.class.ts` — dead third engine, no importers
- `src/features/scoundrel/logic/bruteforce.ts` — functional engine bruteforce, replaced by solver
- `src/features/scoundrel/logic/bruteforce.test.ts` — demo runner, not real tests
- `src/features/scoundrel/logic/MCTS.test.ts` — demo runner, not real tests
- `scoundrel_env.py` at repo root — stale duplicate
- `src/types/scoundrel.js` — compiled JS artifact
- `postcss.config.js` — empty duplicate of `.cjs`

## Performance target

Individual deck solve: milliseconds. 10,000 games: under a minute. If insufficient, parallelize across workers later (not part of initial build).
