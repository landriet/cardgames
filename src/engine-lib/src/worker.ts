// worker.ts - The worker thread script
import { parentPort } from "worker_threads";
import { BruteForceResult } from "./ai";
import { Game } from ".";

function cloneGame(game: Game): Game {
  // Use custom clone method for fast, prototype-preserving deep clone
  return game.clone();
}

// This function will run in the worker thread
function heavyTask(game: Game) {
  const possibleActions = game.getPossibleActions();
  if (game.gameOver || game.victory || possibleActions.length === 0) {
    return {
      victory: game.victory,
      score: game.calculateScore(),
    };
  }

  // Always skip room if total monster power in current room exceeds player's health plus potential potions
  const monsterPower = game.currentRoom.cards.filter((card) => card.type === "monster").reduce((sum, card) => sum + card.rank, 0);
  const potentialPotionHealth = game.currentRoom.cards.filter((card) => card.type === "potion").reduce((sum, card) => sum + card.rank, 0);
  const potentialHealth = game.player.health + potentialPotionHealth;

  let filteredActions = possibleActions;
  if (monsterPower > potentialHealth) {
    filteredActions = possibleActions.filter((action) => action.actionType === "skipRoom");
  } else if (game.player.equippedWeapon) {
    filteredActions = possibleActions.filter((action) => action.mode !== "barehanded");
  }

  const tasks = filteredActions.map(async (action) => {
    const nextGame = cloneGame(game);
    if (action.actionType === "enterRoom") {
      nextGame.enterRoom();
    } else if (action.actionType === "skipRoom") {
      nextGame.avoidRoom();
    } else if (action.actionType === "playCard" && action.card) {
      nextGame.handleCardAction(action.card, action.mode);
    }
    // Call worker for this branch
    return pool!.exec("bruteforceWorker", [nextGame, nextHistory]);
  });

  const results: BruteForceResult[] = await Promise.all(tasks);

  // Pick best result: prioritize victory, then highest score
  let bestResult = results[0];
  for (const result of results) {
    if (result.victory && !bestResult.victory) {
      bestResult = result;
    } else if (result.victory === bestResult.victory && result.score > bestResult.score) {
      bestResult = result;
    }
  }
  return bestResult;
}

// Listen for messages from the main thread
parentPort?.on("message", (data) => {
  try {
    const result = heavyTask(data);
    parentPort?.postMessage({ success: true, result });
  } catch (error) {
    parentPort?.postMessage({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
