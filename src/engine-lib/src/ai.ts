// ...existing code...
import { DungeonCard, Game, Room } from "./index";

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
  const visited = new Set<string>();
  console.debug(`game.deck.length at start of bruteforce: ${game.deck.length}`);

  // Helper to serialize game state for memoization
  function serializeGameState(g: Game): string {
    // Only serialize relevant properties for uniqueness
    return JSON.stringify({
      player: g.player,
      currentRoom: g.currentRoom,
      deck: g.deck,
      gameOver: g.gameOver,
      victory: g.victory,
      roomBeingEntered: g.roomBeingEntered,
    });
  }

  while (stack.length > 0) {
    console.debug(`Stack size: ${stack.length}, Visited states: ${visited.size}`);
    const { game: currentGame, history } = stack.pop()!;
    console.debug(
      `Current room: ${currentGame.currentRoom.cards.map((c) => `${c.type}-${c.rank}`).join(", ")}, Player health: ${currentGame.player.health}, Deck size: ${currentGame.deck.length}`,
    );
    if (currentGame.gameOver || currentGame.victory) {
      console.debug("Game over or victory reached. Saving result.");
      results.push({
        victory: currentGame.victory,
        score: currentGame.calculateScore(),
        actions: history,
      });
      continue;
    }
    console.debug(`Current history: ${history.map((a) => a.actionType + (a.card ? `-${a.card.type}-${a.card.rank}` : "")).join(",")}`);

    const possibleActions = currentGame.getPossibleActions();
    console.debug(
      `Possible actions: ${possibleActions.map((a) => a.actionType + (a.card ? `-${a.card.type}-${a.card.rank}` : "")).join(", ")}`,
    );

    const stateKey = serializeGameState(currentGame);
    if (visited.has(stateKey)) {
      console.debug("Skipping already visited state");
      continue;
    }
    visited.add(stateKey);
    // Always skip room if total monster power in current room exceeds player's health plus potential potions
    // const monsterPower = currentGame.currentRoom.cards.filter((card) => card.type === "monster").reduce((sum, card) => sum + card.rank, 0);
    // const potentialPotionHealth = currentGame.currentRoom.cards
    //   .filter((card) => card.type === "potion")
    //   .reduce((sum, card) => sum + card.rank, 0);
    // const potentialHealth = currentGame.player.health + potentialPotionHealth;

    // let filteredActions = possibleActions;
    // if (monsterPower > potentialHealth) {
    //   console.debug('Monster power exceeds potential health. Only skipping room. MonsterPower:', monsterPower, 'PotentialHealth:', potentialHealth);
    //   filteredActions = possibleActions.filter((action) => action.actionType === "skipRoom");
    // } else if (currentGame.player.equippedWeapon) {
    //   console.debug('Player has equipped weapon. Filtering out barehanded actions.');
    //   filteredActions = possibleActions.filter((action) => action.mode !== "barehanded");
    // }

    for (const action of possibleActions) {
      const nextGame = cloneGame(currentGame);
      const nextHistory = [...history, action];
      console.debug(`Processing action: ${action.actionType}${action.card ? `-${action.card.type}-${action.card.rank}` : ""}`);
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
    if (result.victory && !bestResult.victory) {
      bestResult = result;
    } else if (result.victory === bestResult.victory && result.score > bestResult.score) {
      bestResult = result;
    }
  }
  return bestResult;
}
