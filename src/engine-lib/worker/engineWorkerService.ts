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
import type { WorkerAction, WorkerPossibleAction, WorkerRequest, WorkerResponse, WorkerResult, WorkerRlSnapshot } from "./protocol";

const MAX_RANK = 14;

const canonicalDeck: Array<readonly [cardType: DungeonCard["type"], suit: DungeonCard["suit"], rank: number]> = [];
for (const suit of ["hearts", "diamonds", "clubs", "spades"] as const) {
  for (let rank = 2; rank <= 14; rank += 1) {
    if ((suit === "hearts" || suit === "diamonds") && rank >= 11) {
      continue;
    }
    const cardType: DungeonCard["type"] = suit === "hearts" ? "potion" : suit === "diamonds" ? "weapon" : "monster";
    canonicalDeck.push([cardType, suit, rank]);
  }
}
const cardIndex = new Map(canonicalDeck.map((card, idx) => [`${card[0]}:${card[1]}:${card[2]}`, idx] as const));

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

function actionToDiscrete(action: WorkerPossibleAction): number | undefined {
  if (action.actionType === "enterRoom") return 0;
  if (action.actionType === "skipRoom") return 1;
  if (action.actionType !== "playCard") return undefined;
  if (action.cardIdx < 0 || action.cardIdx > 3) return undefined;
  const base = 2 + action.cardIdx * 2;
  return action.mode === "weapon" ? base + 1 : base;
}

function buildActionMask(state: ScoundrelGameState): boolean[] {
  const mask = Array.from({ length: 10 }, () => false);
  for (const action of listPossibleActions(state)) {
    const idx = actionToDiscrete(action);
    if (idx !== undefined) {
      mask[idx] = true;
    }
  }
  return mask;
}

function cardRank(card: DungeonCard | null | undefined): number {
  return card ? card.rank / MAX_RANK : 0;
}

function encodeObservation(state: ScoundrelGameState): number[] {
  const obs = Array.from({ length: 74 }, () => 0);
  const roomCards = state.currentRoom.cards;
  const monstersOnWeapon = state.monstersOnWeapon ?? [];
  const maxHealth = Math.max(state.maxHealth || 1, 1);

  obs[0] = state.health / maxHealth;
  obs[1] = state.maxHealth / 20;
  obs[2] = cardRank(state.equippedWeapon);
  obs[3] = cardRank(state.lastMonsterDefeated);
  obs[4] = Math.min(monstersOnWeapon.length, 4) / 4;
  obs[5] = state.potionTakenThisTurn ? 1 : 0;
  obs[6] = state.canDeferRoom ? 1 : 0;
  obs[7] = state.lastActionWasDefer ? 1 : 0;
  obs[8] = Math.min(state.deck.length, 44) / 44;
  obs[9] = Math.min(roomCards.length, 4) / 4;

  for (let i = 0; i < 4; i += 1) {
    const card = roomCards[i];
    if (!card) continue;
    const base = 10 + i * 4;
    obs[base] = card.type === "monster" ? 1 : 0;
    obs[base + 1] = card.type === "weapon" ? 1 : 0;
    obs[base + 2] = card.type === "potion" ? 1 : 0;
    obs[base + 3] = card.rank / MAX_RANK;
  }

  for (let i = 0; i < 4; i += 1) {
    if (!monstersOnWeapon[i]) continue;
    obs[26 + i] = monstersOnWeapon[i].rank / MAX_RANK;
  }

  const markSeen = (card?: DungeonCard | null): void => {
    if (!card) return;
    const idx = cardIndex.get(`${card.type}:${card.suit}:${card.rank}`);
    if (idx !== undefined) {
      obs[30 + idx] = 1;
    }
  };
  for (const card of state.discard) markSeen(card);
  for (const card of roomCards) markSeen(card);
  markSeen(state.equippedWeapon);
  for (const card of monstersOnWeapon) markSeen(card);

  return obs;
}

function toRlSnapshot(sessionId: string, state: ScoundrelGameState): WorkerRlSnapshot {
  return {
    sessionId,
    observation: encodeObservation(state),
    actionMask: buildActionMask(state),
    health: state.health,
    maxHealth: state.maxHealth,
    score: state.score ?? 0,
    victory: Boolean(state.victory),
    gameOver: Boolean(state.gameOver),
    discardCount: state.discard.length,
    roomCount: state.currentRoom.cards.length,
    lastActionWasDefer: Boolean(state.lastActionWasDefer),
  };
}

function actionKey(action: WorkerAction, state: ScoundrelGameState): string {
  if (action.actionType === "enterRoom") return "enterRoom";
  if (action.actionType === "skipRoom") return "skipRoom";
  const card = state.currentRoom.cards[action.cardIdx];
  const mode = action.mode === "weapon" ? "weapon" : "barehanded";
  return `playCard:${action.cardIdx}:${mode}:${cardToIdentity(card)}`;
}

function applyAction(state: ScoundrelGameState, action: WorkerAction): ScoundrelGameState {
  if (action.actionType === "enterRoom") return enterRoom(state);
  if (action.actionType === "skipRoom") return avoidRoom(state);
  const card = state.currentRoom.cards[action.cardIdx];
  if (!card) throw new Error("Invalid card index.");
  return handleCardAction(state, card, action.mode);
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
        const state = initGame({ deckSeed: this.readDeckSeed(request.params) });
        this.sessions.set(sessionId, state);
        return { sessionId, state, possibleActions: listPossibleActions(state) };
      }
      case "create_session_rl": {
        const sessionId = randomUUID();
        const state = initGame({ deckSeed: this.readDeckSeed(request.params) });
        this.sessions.set(sessionId, state);
        return toRlSnapshot(sessionId, state);
      }
      case "reset_session": {
        const sessionId = this.readSessionId(request.params);
        const state = initGame({ deckSeed: this.readDeckSeed(request.params) });
        this.sessions.set(sessionId, state);
        return { sessionId, state, possibleActions: listPossibleActions(state) };
      }
      case "reset_session_rl": {
        const sessionId = this.readSessionId(request.params);
        const state = initGame({ deckSeed: this.readDeckSeed(request.params) });
        this.sessions.set(sessionId, state);
        return toRlSnapshot(sessionId, state);
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
        const nextState = applyAction(state, action);
        this.sessions.set(sessionId, nextState);
        return { sessionId, state: nextState, possibleActions: listPossibleActions(nextState) };
      }
      case "step_action_rl": {
        const sessionId = this.readSessionId(request.params);
        const action = this.readAction(request.params);
        const state = this.getSessionState(sessionId);
        validateAction(state, action);
        const nextState = applyAction(state, action);
        this.sessions.set(sessionId, nextState);
        return toRlSnapshot(sessionId, nextState);
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

  private readDeckSeed(params?: Record<string, unknown>): number | undefined {
    const value = params?.deckSeed;
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error("deckSeed must be an integer.");
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
