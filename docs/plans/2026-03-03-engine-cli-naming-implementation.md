# Engine CLI Naming Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace confusing `demo-*` / `run-*` solver script names in `src/engine-lib` with a consistent `benchmark-*` convention and update all references.

**Architecture:** This refactor is file-rename and reference-update only. Runtime behavior, CLI flags, and solver logic remain unchanged. We enforce consistency by renaming the three entry-point files, updating command references in docs/instructions, and validating by running each renamed CLI and engine tests.

**Tech Stack:** TypeScript, Node.js CLI (`tsx`), ripgrep, Jest (`src/engine-lib`)

---

### Task 1: Rename CLI entry points

**Files:**

- Modify: `src/engine-lib/demo-ai.ts` (rename target)
- Modify: `src/engine-lib/demo-pimc.ts` (rename target)
- Modify: `src/engine-lib/run-simulation.ts` (rename target)

**Step 1: Write the failing check (old names still present)**

Run: `rg -n "demo-ai\.ts|demo-pimc\.ts|run-simulation\.ts" src/engine-lib`
Expected: matches include the three legacy filenames.

**Step 2: Rename files**

Run:

```bash
mv src/engine-lib/demo-ai.ts src/engine-lib/benchmark-solver.ts
mv src/engine-lib/demo-pimc.ts src/engine-lib/benchmark-pimc.ts
mv src/engine-lib/run-simulation.ts src/engine-lib/benchmark-rules.ts
```

**Step 3: Run check to verify old paths no longer exist on disk**

Run: `ls src/engine-lib | rg -n "benchmark-solver\.ts|benchmark-pimc\.ts|benchmark-rules\.ts"`
Expected: all three new files listed.

**Step 4: Commit**

```bash
git add src/engine-lib/benchmark-solver.ts src/engine-lib/benchmark-pimc.ts src/engine-lib/benchmark-rules.ts
git commit -m "refactor: rename engine benchmark CLI entry points"
```

### Task 2: Update repository references

**Files:**

- Modify: `AGENTS.md` (command examples)
- Modify: any other files matching old names via repository search

**Step 1: Write failing check (stale references exist)**

Run: `rg -n "demo-ai\.ts|demo-pimc\.ts|run-simulation\.ts" .`
Expected: references found in docs/instructions.

**Step 2: Apply minimal replacements**

- `demo-ai.ts` -> `benchmark-solver.ts`
- `demo-pimc.ts` -> `benchmark-pimc.ts`
- `run-simulation.ts` -> `benchmark-rules.ts`

**Step 3: Re-run check to verify cleanup**

Run: `rg -n "demo-ai\.ts|demo-pimc\.ts|run-simulation\.ts" .`
Expected: no matches (or only expected historical mentions if intentionally retained).

**Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update engine cli commands to benchmark naming"
```

### Task 3: Verify behavior and regression safety

**Files:**

- Test: `src/engine-lib/benchmark-solver.ts`
- Test: `src/engine-lib/benchmark-pimc.ts`
- Test: `src/engine-lib/benchmark-rules.ts`

**Step 1: Run renamed solver benchmark script**

Run: `npx tsx src/engine-lib/benchmark-solver.ts`
Expected: prints solver result (victory/score/nodes/time) without import errors.

**Step 2: Run renamed PIMC benchmark script**

Run: `npx tsx src/engine-lib/benchmark-pimc.ts 1 5`
Expected: prints single-game PIMC summary and aggregate stats.

**Step 3: Run renamed rules benchmark script**

Run: `npx tsx src/engine-lib/benchmark-rules.ts --games 5 --node-limit 50000`
Expected: prints rule-set simulation summary and score distribution.

**Step 4: Run engine-lib tests**

Run: `npm --prefix src/engine-lib test`
Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/engine-lib/benchmark-solver.ts src/engine-lib/benchmark-pimc.ts src/engine-lib/benchmark-rules.ts
git commit -m "test: verify renamed benchmark scripts and engine tests"
```
