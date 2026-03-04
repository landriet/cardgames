# Engine CLI Naming Refactor Design

## Context

`src/engine-lib` currently has three solver-related CLI entry points with inconsistent naming:

- `demo-ai.ts`
- `demo-pimc.ts`
- `run-simulation.ts`

The mixed `demo-*` and `run-*` prefixes make intent unclear and increase cognitive load when choosing the right script.

## Goals

- Make script purpose obvious from filename alone.
- Apply one consistent naming convention across oracle/analysis scripts.
- Keep runtime behavior and CLI flags stable.
- Perform a clean break (no compatibility wrappers).

## Chosen Naming Convention

Use the `benchmark-*` prefix for all three scripts.

### Renames

- `src/engine-lib/demo-ai.ts` -> `src/engine-lib/benchmark-solver.ts`
- `src/engine-lib/demo-pimc.ts` -> `src/engine-lib/benchmark-pimc.ts`
- `src/engine-lib/run-simulation.ts` -> `src/engine-lib/benchmark-rules.ts`

## Scope

- Rename files and update internal console headers/titles for clarity.
- Update repository docs and command examples referencing old filenames.
- Do not change algorithmic behavior, default values, or parsing logic.

## Non-Goals

- No compatibility aliases for old names.
- No broader CLI redesign.
- No packaging/publishing changes.

## Risks and Mitigations

- Risk: stale docs or scripts still referencing old names.
- Mitigation: search-and-replace across repository and verify with ripgrep.

## Validation

- Execute each renamed script with a minimal invocation.
- Run engine-lib tests to verify no regressions in solver/PIMC modules.
