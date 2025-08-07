# Copilot Instructions for AI Agents

## Project Overview
- **Stack:** React 19 + TypeScript + Vite
- **Purpose:** Modern, modular web app for card games. Uses Vite for fast dev/build, React for UI, and TypeScript for type safety.
- **Structure:**
  - `src/components/`: Reusable UI components
  - `src/features/`: Domain/feature logic
  - `src/pages/`: Route-level components
  - `src/layouts/`: Layout wrappers
  - `src/hooks/`: Custom React hooks
  - `src/services/`: API/external integrations
  - `src/store/`: State management
  - `src/lib/`: Integrations (API clients, analytics, etc.)
  - `src/types/`: Shared TypeScript types
  - `src/utils/`: Utility/helper functions
  - `src/router/`: Route definitions
  - `src/styles/`: Global and app-level CSS

## Key Workflows
- **Start dev server:** `npm run dev` (or VS Code task: "Run Vite dev server")
- **Build:** `npm run build` (runs `tsc -b` then `vite build`)
- **Lint:** `npm run lint` (ESLint + Prettier)
- **Test:** `npm run test` (Vitest)
- **Test with coverage:** `npm run test:coverage`


## Conventions & Patterns
 **TypeScript:** Strict mode, no unused locals/params, enforced via `tsconfig.*.json`.
 **Imports:**
   - Always place all import statements at the very top of each file, before any other code or comments.
   - Use `.ts`/`.tsx` extensions in imports (Vite/TS config allows this).
  - Use [Tailwind CSS](https://tailwindcss.com/) utility classes for styling components and layouts.
  - Global styles: `src/index.css`, `src/styles/`
  - Component styles: co-located or imported as needed
- **State:** Use `src/store/` for global state, local state via React hooks
- **Routing:** Place route-level components in `src/pages/`, define routes in `src/router/`
- **Features:** Encapsulate domain logic in `src/features/` (feature-first organization)
- **Testing:** Use Vitest for unit/integration tests. Place tests alongside code or in a `__tests__` subfolder.
- **Linting:** ESLint config extends recommended React, TypeScript, hooks, and Prettier rules. See `eslint.config.js` and `.eslintrc.json` for details.
- **Formatting:** Prettier enforced via ESLint and `.prettierrc`.

## Integration Points
- **Vite plugins:** See `vite.config.ts` (uses `@vitejs/plugin-react`)
- **External assets:** Place in `public/` (served at root)
- **API/External services:** Integrate via `src/services/` or `src/lib/`

## Examples
- **Entry point:** `src/main.tsx` mounts `<App />` to `#root` in `index.html`
- **Component import:** `import MyComponent from '../components/MyComponent'`
- **Global style import:** `import './index.css'`

## Tips for AI Agents
- Follow the folder conventions above for new code.
- Prefer feature-first organization: group related logic in `features/`.
- Use strict TypeScript and linting rules—fix all errors/warnings before PRs.
- Reference `README.md` for ESLint expansion tips.
- For new integrations, add to `services/` or `lib/` as appropriate.
- Use the provided VS Code tasks for common workflows.

---
If any conventions are unclear or missing, ask the user for clarification or check for updates in `README.md` or this file.
