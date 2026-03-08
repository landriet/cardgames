import { solve } from "../../../engine-lib/src/solver.ts";
import type { ScoundrelGameState } from "../../../types/scoundrel.ts";
import { collectAllCardsFromEngineGame, toEngineGame } from "./engineConversion.ts";

export type WinnabilityStatus = "computing" | "winnable" | "not_winnable" | "victory" | "defeat";

export interface SolverRequest {
  requestId: number;
  gameState: ScoundrelGameState;
}

export interface SolverResponse {
  requestId: number;
  status: WinnabilityStatus;
  nodesExplored: number;
  durationMs: number;
}

export interface WinnabilityEvaluation {
  status: WinnabilityStatus;
  nodesExplored: number;
  durationMs: number;
}

export function getTerminalStatus(state: ScoundrelGameState): WinnabilityStatus | null {
  if (state.victory) return "victory";
  if (state.gameOver) return "defeat";
  return null;
}

export function evaluateWinnability(state: ScoundrelGameState): WinnabilityEvaluation {
  const terminalStatus = getTerminalStatus(state);
  if (terminalStatus) {
    return {
      status: terminalStatus,
      nodesExplored: 0,
      durationMs: 0,
    };
  }

  const game = toEngineGame(state);
  const originalDeck = collectAllCardsFromEngineGame(game);

  const startedAt = performance.now();
  const result = solve(game, originalDeck);
  const durationMs = Math.round(performance.now() - startedAt);

  return {
    status: result.victory ? "winnable" : "not_winnable",
    nodesExplored: result.nodesExplored,
    durationMs,
  };
}
