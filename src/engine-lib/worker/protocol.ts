import type { DungeonCard, ScoundrelGameState } from "../../types/scoundrel";

export type WorkerAction =
  | { actionType: "enterRoom" }
  | { actionType: "skipRoom" }
  | { actionType: "playCard"; cardIdx: number; mode?: "barehanded" | "weapon" };

export type WorkerPossibleAction = WorkerAction & {
  card?: DungeonCard;
};

export interface WorkerRequest {
  id: string;
  method: "health" | "create_session" | "reset_session" | "get_state" | "get_possible_actions" | "step_action" | "close_session";
  params?: Record<string, unknown>;
}

export interface WorkerError {
  code: string;
  message: string;
}

export type WorkerResult =
  | { status: "ok" }
  | { sessionId: string; state: ScoundrelGameState; possibleActions: WorkerPossibleAction[] }
  | { state: ScoundrelGameState }
  | { possibleActions: WorkerPossibleAction[] }
  | { closed: true };

export type WorkerResponse = { id: string; ok: true; result: WorkerResult } | { id: string; ok: false; error: WorkerError };
