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
    // Return all possible actions: all cards in current room, with both modes for monsters
    if (!state.currentRoom || !state.currentRoom.cards) return [];
    const moves: Move[] = [];
    for (const card of state.currentRoom.cards) {
      if (card.type === "monster") {
        moves.push({ card, mode: "barehanded" });
        if (state.equippedWeapon) moves.push({ card, mode: "weapon" });
      } else {
        moves.push({ card });
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
    return !!state.gameOver || !!state.victory;
  }

  winner(state: State): number | null {
    if (state.victory) return 1;
    if (state.gameOver) return -1;
    return null;
  }
}
