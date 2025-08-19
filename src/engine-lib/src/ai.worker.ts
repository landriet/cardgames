import workerpool from "workerpool";
import { Game, DungeonCard } from "./index";
import { BruteForceResult, cloneGame } from "./ai";

function bruteforceWorker(gameObj: any, actionHistory: BruteForceResult["actions"] = []): BruteForceResult {
  const game = Game.fromJSON(gameObj);
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
        score: Math.max(0, game.calculateScore()),
        actions: actionHistory,
      };
}

workerpool.worker({ bruteforceWorker });
