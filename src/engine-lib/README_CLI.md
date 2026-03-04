# Engine CLI Scripts

This document describes the benchmark/analysis entry points in `src/engine-lib`.

## Prerequisites

From repository root:

```bash
npm install
```

If `tsx` is missing:

```bash
npm install -D tsx
```

## Scripts

### 1) Exact solver benchmark

```bash
npx tsx src/engine-lib/benchmark-solver.ts
```

What it does:

- Runs the exact DP/oracle solver on a fixed deck.
- Prints victory, score, nodes explored, and elapsed time.

Use this when:

- You want a quick sanity check for solver behavior/performance.

### 2) PIMC benchmark

```bash
npx tsx src/engine-lib/benchmark-pimc.ts <numGames> <numSamples> [-v]
```

Example:

```bash
npx tsx src/engine-lib/benchmark-pimc.ts 10 50
```

What it does:

- Runs full games with the PIMC agent.
- For each decision, it samples hidden information and queries the exact solver as an oracle.
- Reports win rate and score stats across games.

Flags:

- `-v`, `--verbose`: Print per-move details and action stats.

### 3) Rule-set benchmark

```bash
npx tsx src/engine-lib/benchmark-rules.ts [options]
```

Common options:

- `--games <n>`: Number of games (default `1000`)
- `--node-limit <n>`: Solver node cap per game (default `5000000`)
- `--trace`: Print step-by-step traces
- `--config <path>`: JSON config file with one or many rule sets
- `--health <n>`, `--max-health <n>`, `--potions-per-room <n>`
- `--no-skip`, `--skip-consecutive`, `--no-weapon-limit`

Example:

```bash
npx tsx src/engine-lib/benchmark-rules.ts --games 500 --node-limit 200000
```

What it does:

- Runs large batches under one or more rule sets.
- Prints win rate, average/median score, score distribution, and average nodes explored.

## Tests

Run engine-lib tests:

```bash
npm --prefix src/engine-lib test
```
