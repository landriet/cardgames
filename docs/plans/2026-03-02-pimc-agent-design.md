# PIMC Agent Design

## Overview

Perfect Information Monte Carlo (PIMC) agent for Scoundrel. The agent cannot see the deck but knows which cards remain unseen. At each decision point it:

1. Computes the set of unseen cards (full deck minus visible/discarded cards)
2. Generates N random shuffles of unseen cards as hypothetical deck orderings
3. Runs the oracle solver on each shuffle for each candidate action
4. Picks the action with the highest average score across all samples

## Architecture

Builds on the class-based engine (`engine-lib`) and reuses the existing oracle solver (`solver.ts`).

### Files

| File                          | Type     | Purpose                                               |
| ----------------------------- | -------- | ----------------------------------------------------- |
| `src/engine-lib/src/pimc.ts`  | New      | Core PIMC algorithm + game runner + simulation runner |
| `src/engine-lib/demo-pimc.ts` | New      | CLI entry point for running PIMC simulations          |
| `src/engine-lib/package.json` | Modified | Add `demo-pimc` script                                |

## Core Algorithm: `pimcBestAction`

```typescript
export interface ActionStats {
  action: GameAction;
  avgScore: number;
  wins: number;
  scores: number[];
}

export interface PimcResult {
  bestAction: GameAction;
  stats: ActionStats[];
}

export function pimcBestAction(game: Game, numSamples: number): PimcResult;
```

### Per-decision steps

1. Call `game.getPossibleActions()` to enumerate candidate actions
2. If 0 or 1 actions, return immediately (no choice to make)
3. Compute unseen cards: full 44-card deck minus room cards, discard, equipped weapon, monsters on weapon
4. For each of N samples:
   - Shuffle the unseen cards (Fisher-Yates)
   - For each candidate action:
     - Clone the game (`game.clone()`)
     - Set the clone's deck to the shuffled unseen cards
     - Apply the candidate action via `doAction(clone, action)`
     - Run `solve(clone, originalDeck)` on the resulting state
     - Record the solver's score
5. Average scores per action across all N samples
6. Return the action with the highest average score

### Unseen card computation

Cards are identified by `type-suit-rank` string key (matching `solver.ts` convention). Unseen = all cards from `Game.createDeck()` that don't appear in:

- `game.currentRoom.cards`
- `game.discard`
- `game.player.equippedWeapon` (if any)
- `game.player.monstersOnWeapon`

### Solver integration

The solver expects `solve(game: Game, originalDeck: DungeonCard[])` where `originalDeck` is used to build the card index for transposition table keys. For each PIMC sample, `originalDeck` is the concatenation of visible cards + the shuffled unseen cards (i.e., the full hypothetical deck for that sample).

## Game Runner: `runPimcGame`

```typescript
export interface PimcGameResult {
  victory: boolean;
  score: number;
  health: number;
  moves: Array<{ action: GameAction; stats: ActionStats[] }>;
}

export function runPimcGame(numSamples: number, rules?: RuleConfig): PimcGameResult;
```

Plays a complete game from a random shuffle:

1. Create a `Game` with a random deck
2. Loop until `game.gameOver` or `game.victory`:
   - Call `pimcBestAction(game, numSamples)`
   - Apply the best action to the game
   - Record the move + stats
3. Return final result with move log

## Simulation Runner: `runPimcSimulation`

```typescript
export function runPimcSimulation(numGames: number, numSamples: number, rules?: RuleConfig): SimulationResult; // reuses SimulationResult from simulation.ts
```

Runs `numGames` full PIMC games and aggregates win rate, average score, median score, and score distribution. Same output format as the existing `runSimulation`.

## CLI Entry Point: `demo-pimc.ts`

```typescript
// Usage: npx tsx src/demo-pimc.ts [numGames] [numSamples]
// Defaults: 100 games, 50 samples
```

Prints per-game results and final aggregated stats (win rate, avg/median score).

## Design Decisions

- **Engine choice**: Class-based engine-lib, reusing the oracle solver directly
- **Aggregation**: Average score (not win rate) — more discriminating for non-winning states
- **Re-sample frequency**: Every action — maximizes information utilization since each card play reveals deck composition
- **Clone strategy**: `game.clone()` per sample, then `doAction`/`solve` per action within that clone. The solver internally uses do/undo so it doesn't need additional cloning.
- **No transposition sharing across samples**: Each `solve()` call builds its own transposition table. Sharing would require deck-order-independent keys, which the compact state key already provides, but the solver creates fresh tables per call anyway.

## Performance Considerations

Cost per decision = `N_samples * N_actions * solver_cost`. The solver typically explores 10k-100k nodes for a full game. With 50 samples and ~4 actions per decision, that's 200 solver calls per decision point. A full game has ~20-30 decisions, so ~5000 solver calls per game.

This will be significantly slower than the pure oracle solver. The CLI script should default to modest parameters and print timing info.
