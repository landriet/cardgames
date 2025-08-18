// ScoundrelMCTSGame.ts
// Adapter to use ScoundrelGameState with MCTS
import type { Game } from "./MCTS.ts";
import * as ScoundrelTypes from "../../../types/scoundrel.ts";
import { handleCardAction, initGame } from "./engine.ts";

export type State = ScoundrelTypes.ScoundrelGameState;
export type Move = { card: ScoundrelTypes.DungeonCard; mode?: "barehanded" | "weapon" };

export class ScoundrelMCTSGame implements Game<State, Move> {
  private state: State;

  constructor(state?: State) {
    this.state = state ? { ...state } : initGame();
  }

  getState(): State {
    return { ...this.state };
  }

  setState(state: State): void {
    this.state = { ...state };
  }

  cloneState(state: State): State {
    // Deep clone (shallow for demo, use deep clone for production)
    return JSON.parse(JSON.stringify(state));
  }

  moves(state: State): Move[] {
    // Return only valid actions: simulate each move and include only those that change the state
    if (!state.currentRoom || !state.currentRoom.cards) return [];
    const moves: Move[] = [];
    for (const card of state.currentRoom.cards) {
      if (card.type === "monster") {
        // Barehanded
        const barehandedState = handleCardAction(state, card, "barehanded");
        if (JSON.stringify(barehandedState) !== JSON.stringify(state)) {
          moves.push({ card, mode: "barehanded" });
        }
        // Weapon
        if (
          state.equippedWeapon &&
          state.lastMonsterDefeated &&
          typeof state.lastMonsterDefeated.rank !== "undefined" &&
          state.lastMonsterDefeated.rank > card.rank
        ) {
          const weaponState = handleCardAction(state, card, "weapon");
          if (JSON.stringify(weaponState) !== JSON.stringify(state)) {
            moves.push({ card, mode: "weapon" });
          }
        }
      } else {
        const newState = handleCardAction(state, card);
        if (JSON.stringify(newState) !== JSON.stringify(state)) {
          moves.push({ card });
        }
      }
    }
    return moves;
  }

  playMove(state: State, move: Move): State {
    if (move.card.type === "monster") {
      return handleCardAction(state, move.card, move.mode);
    } else {
      return handleCardAction(state, move.card);
    }
  }

  gameOver(state: State): boolean {
    console.log("Checking game over:", state.gameOver, state.victory);
    return !!state.gameOver || !!state.victory;
  }

  winner(state: State): number | null {
    if (state.victory) return 1;
    if (state.gameOver) return -1;
    return null;
  }
}
