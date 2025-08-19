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
    const possibleActions = currentGame.getPossibleActions();
    if (currentGame.gameOver || currentGame.victory || possibleActions.length === 0) {
      const result: BruteForceResult = {
        victory: currentGame.victory,
        score: currentGame.calculateScore(),
        actions: currentHistory,
      };
      if (!bestResult || result.victory || result.score > bestResult.score) {
        bestResult = result;
        console.log(`New best result: Victory=${result.victory}, Score=${result.score}, Actions=${JSON.stringify(result.actions)}`);
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

      if (bestResult && bestResult.victory) {
        return;
      }
    }
  }

  recurse(game, actionHistory);

  return bestResult
    ? bestResult
    : {
        victory: false,
        score: game.calculateScore(),
        actions: actionHistory,
      };
}
