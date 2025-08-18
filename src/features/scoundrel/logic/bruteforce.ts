import { getPossibleActions, handleCardAction, enterRoom, avoidRoom } from "./engine.ts";
import * as ScoundrelTypes from "../../../types/scoundrel.ts";

/**
 * Bruteforce all possible action paths in the Scoundrel game.
 * Recursively explores every possible sequence of actions from a given state.
 * Returns all terminal game states (game over or victory) and/or all action paths.
 *
 * @param state - The starting game state
 * @param path - The sequence of actions taken to reach this state
 * @param results - Accumulator for results (terminal states or paths)
 */
export function bruteforceAllPaths(
  state: ScoundrelTypes.ScoundrelGameState,
  path: any[] = [],
  results: any[] = [],
  visited: Set<string> = new Set(),
): any[] {
  // Serialize state for cycle detection (deck, currentRoom, health, equippedWeapon, etc.)
  const stateKey = JSON.stringify({
    deck: state.deck,
    currentRoom: state.currentRoom,
    health: state.health,
    equippedWeapon: state.equippedWeapon,
    monstersOnWeapon: state.monstersOnWeapon,
    canDeferRoom: state.canDeferRoom,
    lastActionWasDefer: state.lastActionWasDefer,
    gameOver: state.gameOver,
    victory: state.victory,
  });
  if (visited.has(stateKey)) {
    console.log("Cycle detected, skipping state:", stateKey);
    return results;
  }
  visited.add(stateKey);

  // Terminal state: game over or victory
  if (state.gameOver || state.victory) {
    results.push({ path, state });
    console.log("Terminal state reached:", { path, state });
    return results;
  }

  const actions = getPossibleActions(state);
  if (actions.length === 0) {
    // No actions left, treat as terminal
    results.push({ path, state });
    console.log("No actions left, terminal state:", { path, state });
    return results;
  }

  for (const action of actions) {
    let nextState: ScoundrelTypes.ScoundrelGameState | null = null;
    let actionDesc: any = null;
    if (action.actionType === "playCard" && action.card) {
      nextState = handleCardAction(state, action.card, action.mode);
      actionDesc = { type: "playCard", card: action.card, mode: action.mode };
    } else if (action.actionType === "enterRoom") {
      console.log("Entering room...");
      nextState = enterRoom(state);
      actionDesc = { type: "enterRoom" };
    } else if (action.actionType === "skipRoom") {
      console.log("Skipping room...");
      nextState = avoidRoom(state);
      actionDesc = { type: "skipRoom" };
    }
    if (nextState) {
      bruteforceAllPaths(nextState, [...path, actionDesc], results, visited);
    }
  }
  return results;
}
