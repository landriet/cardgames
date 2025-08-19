import { Game, DungeonCard, Room, Player } from "./index";
import cloneDeep from "lodash/cloneDeep";

export interface BruteForceResult {
  victory: boolean;
  score: number;
  actions: Array<{ actionType: string; card?: DungeonCard; mode?: "barehanded" | "weapon" }>; // sequence of actions
}

/**
 * Deep clone a Game instance (naive, for brute-force only)
 */
export function cloneGame(game: Game): Game {
  // Deep clone using lodash (does not preserve class prototypes)
  return cloneDeep(game);
}

/**
 * Recursively brute-force all possible action sequences from a given game state.
 * Returns the best result found (victory prioritized, then lowest score).
 */
export function bruteforce(game: Game, actionHistory: BruteForceResult["actions"] = []): BruteForceResult {
  if (game.gameOver || game.victory) {
    console.log("End state reached:", {
      victory: game.victory,
      score: game.score,
      actions: actionHistory,
    });
    return {
      victory: game.victory,
      score: game.score,
      actions: actionHistory,
    };
  }

  const possibleActions = game.getPossibleActions();
  console.log("Possible actions:", possibleActions, "History:", actionHistory);
  // Pause for debugging
  if (typeof process !== "undefined" && process.stdin && process.stdin.isTTY) {
    const prompt = require("readline-sync");
    prompt.question("Press Enter to continue...");
  }
  if (possibleActions.length === 0) {
    // No actions, just return current state
    console.log("No possible actions, returning current state.");
    return {
      victory: game.victory,
      score: game.score,
      actions: actionHistory,
    };
  }

  let bestResult: BruteForceResult | null = null;

  for (const action of possibleActions) {
    console.log("Trying action:", action);
    const nextGame = cloneGame(game);
    // Apply action
    if (action.actionType === "enterRoom") {
      nextGame.enterRoom();
    } else if (action.actionType === "skipRoom") {
      nextGame.avoidRoom();
    } else if (action.actionType === "playCard" && action.card) {
      console.log(nextGame.currentRoom.cards);
      nextGame.handleCardAction(action.card, action.mode);
      console.log(nextGame.currentRoom.cards);
    }
    // Recurse
    const result = bruteforce(nextGame, [...actionHistory, action]);
    console.log("Result for action", action, ":", result);
    // Choose best: prioritize victory, then lowest score
    if (
      !bestResult ||
      (result.victory && !bestResult.victory) ||
      (result.victory === bestResult.victory && result.score < bestResult.score)
    ) {
      bestResult = result;
      console.log("New best result:", bestResult);
    }
  }

  console.log("Returning best result:", bestResult);
  return bestResult!;
}

// Example usage:
// const game = new Game();
// const result = bruteforce(game);
// console.log(result);
