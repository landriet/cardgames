# React + TypeScript + Vite

## Python RL Agent

The repository includes a Python PPO agent integration under `python_ai/`.

### Watch one full RL game

```bash
python_ai/.venv/bin/python python_ai/watch_agent_game.py \
  --model python_ai/models/scoundrel_maskable_ppo.zip \
  --seed 42 \
  --sleep 0.2
```

Use `--stochastic` to sample actions instead of deterministic policy inference.

For training/evaluation commands, see `python_ai/README.md`.

## Scoundrel AI: Monte Carlo Tree Search (MCTS)

This project includes a reusable Monte Carlo Tree Search (MCTS) implementation for building AI agents in the Scoundrel card game.

### How to Use MCTS for Scoundrel

1. **Game Adapter**: The file `src/features/scoundrel/logic/ScoundrelMCTSGame.ts` adapts your game logic to the MCTS interface.
2. **MCTS Implementation**: The core algorithm is in `src/features/scoundrel/logic/MCTS.ts`.
3. **Integration Example**:

```typescript
import { MCTS } from "./src/features/scoundrel/logic/MCTS";
import { ScoundrelMCTSGame } from "./src/features/scoundrel/logic/ScoundrelMCTSGame";
import { initGame } from "./src/features/scoundrel/logic/engine";

const initialState = initGame();
const gameAdapter = new ScoundrelMCTSGame(initialState);
const mcts = new MCTS(gameAdapter, 1000); // 1000 iterations

// To get the AI's move:
const aiMove = mcts.selectMove();
// Apply the move to your game state as needed
```

### Customization

- You can adjust the number of iterations for stronger/weaker AI.
- The adapter can be extended for more advanced strategies or game rules.

### References

- [monte-carlo-tree-search-js (GitHub)](https://github.com/SethPipho/monte-carlo-tree-search-js)
- [Implementing Monte Carlo Tree Search in Node.js (Medium)](https://medium.com/@quasimik/implementing-monte-carlo-tree-search-in-node-js-5f07595104df)

---

## Storybook

This project uses [Storybook](https://storybook.js.org/) for developing and testing UI components in isolation.

### Running Storybook

- **From the command line:**

  ```sh
  npm run storybook
  ```

  This will start Storybook at [http://localhost:6006](http://localhost:6006).

- **From VS Code:**
  - Open the Command Palette (⇧⌘P) and run `Tasks: Run Task`, then select `Run Storybook`.

### Adding Stories

- Add new stories in `src/stories/` following the examples provided.
- Stories for components should import the component and export story objects.

### Tailwind CSS Support

Storybook is configured to use the project's Tailwind CSS setup. All components will render with the same styles as in the main app.

### Building Storybook

- To build a static version of Storybook:
  ```sh
  npm run build-storybook
  ```
  The output will be in the `storybook-static` directory.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
