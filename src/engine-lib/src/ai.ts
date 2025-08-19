import cloneDeep from "lodash/cloneDeep";
import { DungeonCard, Game } from "./index";

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
  // Use closure to persist best result
  let bestResult: BruteForceResult | null = null;

  function recurse(currentGame: Game, currentHistory: BruteForceResult["actions"] = []) {
    // const cardHistory = currentHistory
    //   .filter((a) => a.actionType === "playCard" && a.card)
    //   .map((a) => a.card?.rank)
    //   .join(" > ");
    // console.log("Current card history:", cardHistory);

    const possibleActions = currentGame.getPossibleActions();
    if (currentGame.gameOver || currentGame.victory || possibleActions.length === 0) {
      const result: BruteForceResult = {
        victory: currentGame.victory,
        score: Math.max(0, currentGame.score),
        actions: currentHistory,
      };
      if (
        !bestResult ||
        (result.victory && !bestResult.victory) ||
        (result.victory === bestResult.victory && result.score < bestResult.score)
      ) {
        bestResult = result;
      }
      return result;
    }

    for (const action of possibleActions) {
      const nextGame = cloneGame(currentGame);
      if (action.actionType === "enterRoom") {
        nextGame.enterRoom();
      } else if (action.actionType === "skipRoom") {
        nextGame.avoidRoom();
      } else if (action.actionType === "playCard" && action.card) {
        nextGame.handleCardAction(action.card, action.mode);
      }
      recurse(nextGame, [...currentHistory, action]);
    }
    return bestResult!;
  }

  return recurse(game, actionHistory);
}
