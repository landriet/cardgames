import { randomUUID } from "node:crypto";
import type { DungeonCard, ScoundrelGameState } from "../../types/scoundrel";
import {
  avoidRoom,
  enterRoom,
  getPossibleActions,
  handleCardAction,
  initGame,
  type ScoundrelPossibleAction,
} from "../../features/scoundrel/logic/engineAdapter";
import type { WorkerAction, WorkerPossibleAction, WorkerRequest, WorkerResponse, WorkerResult } from "./protocol";

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function cardToIdentity(card?: DungeonCard): string {
  if (!card) return "";
  return `${card.type}:${card.suit}:${card.rank}`;
}

function toWorkerAction(state: ScoundrelGameState, action: ScoundrelPossibleAction): WorkerPossibleAction {
  if (action.actionType === "enterRoom") return { actionType: "enterRoom" };
  if (action.actionType === "skipRoom") return { actionType: "skipRoom" };

  if (!action.card) {
    throw new Error("playCard action missing card payload.");
  }

  const cardIdx = state.currentRoom.cards.findIndex(
    (card) => card.type === action.card!.type && card.suit === action.card!.suit && card.rank === action.card!.rank,
  );
  if (cardIdx === -1) {
    throw new Error("playCard action card not present in room.");
  }

  return {
    actionType: "playCard",
    cardIdx,
    mode: action.mode,
    card: action.card,
  };
}

function listPossibleActions(state: ScoundrelGameState): WorkerPossibleAction[] {
  return getPossibleActions(state).map((action) => toWorkerAction(state, action));
}

function actionKey(action: WorkerAction, state: ScoundrelGameState): string {
  if (action.actionType === "enterRoom") return "enterRoom";
  if (action.actionType === "skipRoom") return "skipRoom";
  const card = state.currentRoom.cards[action.cardIdx];
  return `playCard:${action.cardIdx}:${action.mode ?? ""}:${cardToIdentity(card)}`;
}

function validateAction(state: ScoundrelGameState, action: WorkerAction): void {
  const legalActions = listPossibleActions(state);
  const legalKeys = new Set(legalActions.map((legalAction) => actionKey(legalAction, state)));

  if (!legalKeys.has(actionKey(action, state))) {
    throw new Error("Illegal action for current state.");
  }
}

export class EngineWorkerService {
  private readonly sessions = new Map<string, ScoundrelGameState>();

  handleRequest(request: WorkerRequest): WorkerResponse {
    try {
      const result = this.dispatch(request);
      return { id: request.id, ok: true, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        id: request.id,
        ok: false,
        error: {
          code: "WORKER_ERROR",
          message,
        },
      };
    }
  }

  private dispatch(request: WorkerRequest): WorkerResult {
    switch (request.method) {
      case "health":
        return { status: "ok" };
      case "create_session": {
        const sessionId = randomUUID();
        const state = initGame();
        this.sessions.set(sessionId, state);
        return { sessionId, state, possibleActions: listPossibleActions(state) };
      }
      case "reset_session": {
        const sessionId = this.readSessionId(request.params);
        const state = initGame();
        this.sessions.set(sessionId, state);
        return { sessionId, state, possibleActions: listPossibleActions(state) };
      }
      case "get_state": {
        const state = this.getSessionState(this.readSessionId(request.params));
        return { state };
      }
      case "get_possible_actions": {
        const state = this.getSessionState(this.readSessionId(request.params));
        return { possibleActions: listPossibleActions(state) };
      }
      case "step_action": {
        const sessionId = this.readSessionId(request.params);
        const action = this.readAction(request.params);
        const state = this.getSessionState(sessionId);
        validateAction(state, action);

        let nextState: ScoundrelGameState;
        if (action.actionType === "enterRoom") {
          nextState = enterRoom(state);
        } else if (action.actionType === "skipRoom") {
          nextState = avoidRoom(state);
        } else {
          const card = state.currentRoom.cards[action.cardIdx];
          if (!card) {
            throw new Error("Invalid card index.");
          }
          nextState = handleCardAction(state, card, action.mode);
        }

        this.sessions.set(sessionId, nextState);
        return { sessionId, state: nextState, possibleActions: listPossibleActions(nextState) };
      }
      case "close_session": {
        const sessionId = this.readSessionId(request.params);
        if (!this.sessions.has(sessionId)) {
          throw new Error("Session not found.");
        }
        this.sessions.delete(sessionId);
        return { closed: true };
      }
      default:
        throw new Error("Unknown method.");
    }
  }

  private readSessionId(params?: Record<string, unknown>): string {
    const value = params?.sessionId;
    if (!isString(value)) {
      throw new Error("sessionId is required.");
    }
    return value;
  }

  private readAction(params?: Record<string, unknown>): WorkerAction {
    const value = params?.action;
    if (!value || typeof value !== "object") {
      throw new Error("action is required.");
    }

    const action = value as Partial<WorkerAction>;
    if (action.actionType === "enterRoom") return { actionType: "enterRoom" };
    if (action.actionType === "skipRoom") return { actionType: "skipRoom" };

    if (action.actionType === "playCard") {
      if (typeof action.cardIdx !== "number" || Number.isNaN(action.cardIdx) || action.cardIdx < 0) {
        throw new Error("playCard.cardIdx must be a non-negative number.");
      }
      if (action.mode && action.mode !== "barehanded" && action.mode !== "weapon") {
        throw new Error("playCard.mode must be barehanded or weapon.");
      }
      return {
        actionType: "playCard",
        cardIdx: action.cardIdx,
        mode: action.mode,
      };
    }

    throw new Error("Invalid actionType.");
  }

  private getSessionState(sessionId: string): ScoundrelGameState {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error("Session not found.");
    }
    return state;
  }
}
