import { Game, DungeonCard } from "./index";

export interface BruteForceResult {
  victory: boolean;
  score: number;
  actions: Array<{ actionType: string; card?: DungeonCard; mode?: "barehanded" | "weapon" }>; // sequence of actions
}

/**
 * Deep clone a Game instance (naive, for brute-force only)
 */
function cloneGame(game: Game): Game {
  // Serialize and deserialize for deep copy
  const cloned = Object.assign(Object.create(Object.getPrototypeOf(game)), JSON.parse(JSON.stringify(game)));
  // Fix player prototype
  if (cloned.player) {
    cloned.player = Object.assign(Object.create(Object.getPrototypeOf(game.player)), cloned.player);
  }
  // Fix currentRoom prototype
  if (cloned.currentRoom) {
    cloned.currentRoom = Object.assign(Object.create(Object.getPrototypeOf(game.currentRoom)), cloned.currentRoom);
  }
  return cloned;
}

/**
 * Recursively brute-force all possible action sequences from a given game state.
 * Returns the best result found (victory prioritized, then lowest score).
 */
export function bruteforce(game: Game, actionHistory: BruteForceResult["actions"] = []): BruteForceResult {
  if (game.gameOver || game.victory) {
    return {
      victory: game.victory,
      score: game.score,
      actions: actionHistory,
    };
  }

  const possibleActions = game.getPossibleActions();
  if (possibleActions.length === 0) {
    // No actions, just return current state
    return {
      victory: game.victory,
      score: game.score,
      actions: actionHistory,
    };
  }

  let bestResult: BruteForceResult | null = null;

  for (const action of possibleActions) {
    const nextGame = cloneGame(game);
    // Apply action
    if (action.actionType === "enterRoom") {
      nextGame.enterRoom();
    } else if (action.actionType === "skipRoom") {
      nextGame.avoidRoom();
    } else if (action.actionType === "playCard" && action.card) {
      nextGame.handleCardAction(action.card, action.mode);
    }
    // Recurse
    const result = bruteforce(nextGame, [...actionHistory, action]);
    // Choose best: prioritize victory, then lowest score
    if (
      !bestResult ||
      (result.victory && !bestResult.victory) ||
      (result.victory === bestResult.victory && result.score < bestResult.score)
    ) {
      bestResult = result;
    }
  }

  return bestResult!;
}

// Example usage:
// const game = new Game();
// const result = bruteforce(game);
// console.log(result);
