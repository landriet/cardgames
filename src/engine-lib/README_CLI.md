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
npx tsx src/engine-lib/benchmark-solver.ts [--variant <id>] [--seed <n>] [--seed-list <n,n,...>] [--seed-range <start-end>] [--seeds-file <path>] [--exhaustive]
```

Run the same variant on several deterministic decks:

```bash
npx tsx src/engine-lib/benchmark-solver.ts --variant jack_diamonds --seed-list 101,202,303
```

Or use an inclusive seed range:

```bash
npx tsx src/engine-lib/benchmark-solver.ts --variant jack_diamonds --seed-range 101-110
```

What it does:

- Runs the exact DP/oracle solver on a fully known shuffled deck for the selected variant.
- Prints victory, score, nodes explored, and elapsed time.

Flags:

- `-s`, `--seed <n>`: Use a deterministic shuffled deck for reproducible runs.
- `--seed-list <n,n,...>`: Run the same benchmark for each comma-separated seed.
- `--seed-range <start-end>`: Run each seed in the inclusive range.
- `--seeds-file <path>`: Read one seed per line; blank lines and lines starting with `#` are ignored.
- Seed lists, ranges, and files are combined in order, with duplicates removed; `--seed` cannot be combined with them. Up to 10,000 seed entries are accepted per run.
- `--variant <id>`: Select a registered game variant (defaults to `standard`).
- `--exhaustive`: Explore all nodes (disables solver pruning/early-stop heuristics).

Use this when:

- You want a quick sanity check for solver behavior/performance.

### 2) PIMC benchmark

```bash
npx tsx src/engine-lib/benchmark-pimc.ts <numGames> <numSamples> [-v] [--seed <n>] [--variant <id>]
```

Example:

```bash
npx tsx src/engine-lib/benchmark-pimc.ts 10 50 --variant queen_hearts
```

What it does:

- Runs full games with the PIMC agent.
- For each decision, it samples hidden information and queries the exact solver as an oracle.
- Reports win rate and score stats across games.

Flags:

- `-v`, `--verbose`: Print per-move details and action stats.
- `-s`, `--seed <n>`: Make runs reproducible by seeding deck/sampling randomness.
- `--variant <id>`: Select a registered game variant (defaults to `standard`).

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
