// ...existing code...
import { DungeonCard, Game } from "./index";
console.log("[AI] ai.ts module loaded");

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
export function bruteforce(game: Game): BruteForceResult {
  // Iterative DFS using explicit stack
  type State = { game: Game; history: BruteForceResult["actions"] };
  const stack: State[] = [{ game: game, history: [] }];
  const results: BruteForceResult[] = [];

  while (stack.length > 0) {
    const { game: currentGame, history } = stack.pop()!;
    const possibleActions = currentGame.getPossibleActions();

    if (currentGame.gameOver || currentGame.victory || possibleActions.length === 0) {
      results.push({
        victory: currentGame.victory,
        score: currentGame.calculateScore(),
        actions: history,
      });
      continue;
    }

    // Always skip room if total monster power in current room exceeds player's health plus potential potions
    // const monsterPower = currentGame.currentRoom.cards.filter((card) => card.type === "monster").reduce((sum, card) => sum + card.rank, 0);
    // const potentialPotionHealth = currentGame.currentRoom.cards
    //   .filter((card) => card.type === "potion")
    //   .reduce((sum, card) => sum + card.rank, 0);
    // const potentialHealth = currentGame.player.health + potentialPotionHealth;

    // let filteredActions = possibleActions;
    // if (monsterPower > potentialHealth) {
    //   console.log('[AI] Monster power exceeds potential health. Only skipping room. MonsterPower:', monsterPower, 'PotentialHealth:', potentialHealth);
    //   filteredActions = possibleActions.filter((action) => action.actionType === "skipRoom");
    // } else if (currentGame.player.equippedWeapon) {
    //   console.log('[AI] Player has equipped weapon. Filtering out barehanded actions.');
    //   filteredActions = possibleActions.filter((action) => action.mode !== "barehanded");
    // }

    for (const action of possibleActions) {
      const nextGame = cloneGame(currentGame);
      let nextHistory = [...history, action];
      try {
        if (action.actionType === "enterRoom") {
          nextGame.enterRoom();
        } else if (action.actionType === "skipRoom") {
          nextGame.avoidRoom();
        } else if (action.actionType === "playCard" && action.card) {
          nextGame.handleCardAction(action.card, action.mode);
        }
      } catch (error) {
        throw error;
      }
      stack.push({ game: nextGame, history: nextHistory });
    }
  }

  // Pick best result: prioritize victory, then highest score
  let bestResult = results[0];
  for (const result of results) {
    console.log("[AI] Evaluating result. Victory:", result.victory, "Score:", result.score);
    if (result.victory && !bestResult.victory) {
      bestResult = result;
    } else if (result.victory === bestResult.victory && result.score > bestResult.score) {
      bestResult = result;
    }
  }
  console.log("[AI] Best result selected:", bestResult);
  return bestResult;
}
