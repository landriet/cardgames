import workerpool from "workerpool";
import type { Pool } from "workerpool";
import { DungeonCard, Game } from "./index";
import os from "os";

export interface BruteForceResult {
  victory: boolean;
  score: number;
  actions: Array<{ actionType: string; card?: DungeonCard; mode?: "barehanded" | "weapon" }>; // sequence of actions
}

/**
 * Deep clone a Game instance (naive, for brute-force only)
 */
export function cloneGame(game: Game): Game {
  // Use custom clone method for fast, prototype-preserving deep clone
  return game.clone();
}

/**
 * Recursively brute-force all possible action sequences from a given game state.
 * Returns the best result found (victory prioritized, then lowest score).
 */
export async function bruteforce(game: Game, actionHistory: BruteForceResult["actions"] = [], pool?: Pool): Promise<BruteForceResult> {
  const possibleActions = game.getPossibleActions();
  if (game.gameOver || game.victory || possibleActions.length === 0) {
    return {
      victory: game.victory,
      score: game.calculateScore(),
      actions: actionHistory,
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
    let nextHistory = [...actionHistory, action];
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
