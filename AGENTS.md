# Repository Guidelines

## Project Structure & Module Organization

This repository is a Vite + React + TypeScript app with supporting AI code.

- `src/`: main frontend and game logic.
- `src/features/scoundrel/`: Scoundrel gameplay UI and engine integration.
- `src/features/scoundrel/logic/`: core game logic and Vitest suites.
- `src/engine-lib/`: standalone TypeScript engine package with its own Jest tests and `package.json`.
- `src/stories/`: Storybook stories for UI components.
- `python_ai/`: experimental Python RL training and API client scripts.
- `public/`: static assets served by Vite.

## Build, Test, and Development Commands

Use npm at repo root unless noted.

- `npm run dev`: start Vite dev server.
- `npm run build`: type-check (`tsc -b`) and produce production bundle.
- `npm run preview`: serve the built app locally.
- `npm run lint`: run ESLint across the repo.
- `npm run test`: run Vitest tests once.
- `npm run test:coverage`: run Vitest with coverage output.
- `npm run storybook`: run Storybook on port 6006.
- `npm run build-storybook`: build static Storybook site.
- `npm --prefix src/engine-lib test`: run Jest tests for the standalone engine library.

## Coding Style & Naming Conventions

- Language: TypeScript for app code, React function components.
- Formatting: Prettier is authoritative (`.prettierrc`, `printWidth: 140`).
- Linting: ESLint 9 flat config in `eslint.config.js`; fix lint issues before opening a PR.
- Indentation: follow Prettier defaults (2 spaces, no manual alignment hacks).
- Naming: `PascalCase` for components (`RoomCards.tsx`), `camelCase` for functions/utilities (`scoundrelGameStateToString.ts`), `*.test.ts` for tests.

## Testing Guidelines

- Primary framework: Vitest for app/game logic tests.
- Engine package: Jest tests under `src/engine-lib/src/__tests__/`.
- Keep tests close to code (`__tests__/` folders or adjacent `*.test.ts` files).
- Cover rule changes in game logic with deterministic unit tests, then run `npm run test` and engine-lib tests.

## Commit & Pull Request Guidelines

- Follow Conventional Commit style seen in history: `feat:`, `fix:`, `refactor:`, `test:`.
- Keep commit scope focused; avoid mixing refactors with behavior changes.
- Before PR: run `npm run lint`, `npm run test`, and relevant engine-lib tests.
- PRs should include: concise summary, affected paths, test evidence, and screenshots/GIFs for UI changes.

## Contributor Workflow Notes

- A pre-commit hook runs `pretty-quick --staged`; stage only files you want auto-formatted.
- Do not commit generated artifacts unless explicitly required.
