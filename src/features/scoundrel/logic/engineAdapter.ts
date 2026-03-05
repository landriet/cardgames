import {
  DungeonCard as EngineDungeonCard,
  Game,
  MonsterCard,
  Player,
  PotionCard,
  type Rank as EngineRank,
  Room,
  WeaponCard,
} from "../../../engine-lib/src/index.ts";
import type { DungeonCard, ScoundrelGameState } from "../../../types/scoundrel.ts";

export type ScoundrelActionType = "playCard" | "enterRoom" | "skipRoom";

export interface ScoundrelPossibleAction {
  actionType: ScoundrelActionType;
  card?: DungeonCard;
  mode?: "barehanded" | "weapon";
}

const STATIC_DECK: DungeonCard[] = [
  { type: "potion", suit: "hearts", rank: 5 },
  { type: "weapon", suit: "diamonds", rank: 7 },
  { type: "monster", suit: "clubs", rank: 3 },
  { type: "monster", suit: "spades", rank: 9 },
  { type: "potion", suit: "hearts", rank: 9 },
  { type: "monster", suit: "clubs", rank: 9 },
  { type: "weapon", suit: "diamonds", rank: 2 },
  { type: "monster", suit: "clubs", rank: 6 },
  { type: "monster", suit: "spades", rank: 8 },
  { type: "weapon", suit: "diamonds", rank: 3 },
  { type: "monster", suit: "clubs", rank: 4 },
  { type: "monster", suit: "spades", rank: 12 },
  { type: "potion", suit: "hearts", rank: 4 },
  { type: "weapon", suit: "diamonds", rank: 4 },
  { type: "monster", suit: "clubs", rank: 14 },
  { type: "monster", suit: "spades", rank: 11 },
  { type: "potion", suit: "hearts", rank: 6 },
  { type: "weapon", suit: "diamonds", rank: 5 },
  { type: "monster", suit: "clubs", rank: 10 },
];

function toEngineCard(card: DungeonCard): EngineDungeonCard {
  if (card.type === "monster") return new MonsterCard(card.suit, card.rank as EngineRank);
  if (card.type === "weapon") return new WeaponCard(card.rank as EngineRank);
  return new PotionCard(card.rank as EngineRank);
}

function fromEngineCard(card: EngineDungeonCard): DungeonCard {
  return {
    type: card.type,
    suit: card.suit,
    rank: card.rank,
  };
}

function toEngineGame(state: ScoundrelGameState): Game {
  const player = new Player(state.health, state.maxHealth);
  player.equippedWeapon =
    state.equippedWeapon && state.equippedWeapon.type === "weapon" ? new WeaponCard(state.equippedWeapon.rank as EngineRank) : null;
  player.lastMonsterDefeated =
    state.lastMonsterDefeated && state.lastMonsterDefeated.type === "monster"
      ? new MonsterCard(state.lastMonsterDefeated.suit, state.lastMonsterDefeated.rank as EngineRank)
      : null;
  player.monstersOnWeapon = state.monstersOnWeapon
    .filter((card) => card.type === "monster")
    .map((card) => new MonsterCard(card.suit, card.rank as EngineRank));
  player.potionTakenThisTurn = !!state.potionTakenThisTurn;
  player.potionsTakenThisTurn = state.potionTakenThisTurn ? 1 : 0;

  const game = new Game([], player);
  game.deck = state.deck.map(toEngineCard);
  game.discard = state.discard.map(toEngineCard);
  game.currentRoom = new Room(state.currentRoom.cards.map(toEngineCard));
  game.canDeferRoom = state.canDeferRoom;
  game.lastActionWasDefer = state.lastActionWasDefer;
  game.gameOver = state.gameOver;
  game.victory = state.victory;
  game.roomBeingEntered = true;
  game.lastAction = null;

  return game;
}

function fromEngineGame(game: Game): ScoundrelGameState {
  const state: ScoundrelGameState = {
    deck: game.deck.map(fromEngineCard),
    discard: game.discard.map(fromEngineCard),
    currentRoom: { cards: game.currentRoom.cards.map(fromEngineCard) },
    equippedWeapon: game.player.equippedWeapon ? fromEngineCard(game.player.equippedWeapon) : null,
    lastMonsterDefeated: game.player.lastMonsterDefeated ? fromEngineCard(game.player.lastMonsterDefeated) : null,
    monstersOnWeapon: game.player.monstersOnWeapon.map(fromEngineCard),
    health: game.player.health,
    maxHealth: game.player.maxHealth,
    canDeferRoom: game.canDeferRoom,
    lastActionWasDefer: game.lastActionWasDefer,
    gameOver: game.gameOver,
    victory: game.victory,
    potionTakenThisTurn: game.player.potionTakenThisTurn,
  };

  if (game.gameOver || game.victory) {
    state.score = game.calculateScore();
  }

  return state;
}

function resolveCardFromRoom(game: Game, card: DungeonCard): EngineDungeonCard {
  const resolved = game.currentRoom.cards.find((roomCard) => {
    return roomCard.type === card.type && roomCard.suit === card.suit && roomCard.rank === card.rank;
  });

  if (!resolved) {
    throw new Error("Card not present in current room.");
  }

  return resolved;
}

function buildStaticGame(): Game {
  const game = new Game(STATIC_DECK.map(toEngineCard), new Player(20, 20));
  game.enterRoom();
  return game;
}

export function initGameWithStaticDeck(): ScoundrelGameState {
  return fromEngineGame(buildStaticGame());
}

export function initGame(): ScoundrelGameState {
  const game = new Game();
  game.enterRoom();
  return fromEngineGame(game);
}

export function handleCardAction(state: ScoundrelGameState, card: DungeonCard, mode?: "barehanded" | "weapon"): ScoundrelGameState {
  if (state.gameOver) {
    throw new Error("Cannot perform actions when game is over.");
  }

  if (card.type === "monster" && state.equippedWeapon && !mode) {
    return {
      ...state,
      pendingMonsterChoice: { monster: card },
    };
  }

  if (card.type === "monster" && mode === "weapon" && state.lastMonsterDefeated && card.rank >= state.lastMonsterDefeated.rank) {
    return {
      ...state,
      pendingMonsterChoice: { monster: card },
    };
  }

  const game = toEngineGame(state);
  const resolvedCard = resolveCardFromRoom(game, card);
  game.handleCardAction(resolvedCard, mode);

  if (!game.gameOver && !game.victory && !game.roomBeingEntered && game.currentRoom.cards.length > 0) {
    game.enterRoom();
  }

  return {
    ...fromEngineGame(game),
    pendingMonsterChoice: undefined,
  };
}

export function avoidRoom(state: ScoundrelGameState): ScoundrelGameState {
  const game = toEngineGame(state);
  game.avoidRoom();

  return {
    ...fromEngineGame(game),
    pendingMonsterChoice: undefined,
  };
}

export function enterRoom(state: ScoundrelGameState): ScoundrelGameState {
  const game = toEngineGame(state);
  game.enterRoom();

  return {
    ...fromEngineGame(game),
    pendingMonsterChoice: undefined,
  };
}

export function simulateCardActionHealth(state: ScoundrelGameState, card: DungeonCard, mode?: "barehanded" | "weapon"): number {
  const isCardInCurrentRoom = state.currentRoom.cards.some(
    (roomCard) => roomCard.type === card.type && roomCard.suit === card.suit && roomCard.rank === card.rank,
  );
  if (!isCardInCurrentRoom) {
    // Hovered cards can become stale after room transitions; keep render-safe behavior.
    return state.health;
  }

  const game = toEngineGame(state);
  const resolvedCard = resolveCardFromRoom(game, card);
  const resolvedMode = mode ?? (card.type === "monster" && state.equippedWeapon ? "weapon" : "barehanded");

  const simulatedHealth =
    resolvedCard.type === "monster" ? game.simulateCardAction(resolvedCard, resolvedMode) : game.simulateCardAction(resolvedCard);

  return Math.max(0, Math.min(simulatedHealth, state.maxHealth));
}

export function getPossibleActions(state: ScoundrelGameState): ScoundrelPossibleAction[] {
  const game = toEngineGame(state);
  return game.getPossibleActions().map((action) => ({
    actionType: action.actionType as ScoundrelActionType,
    card: action.card ? fromEngineCard(action.card) : undefined,
    mode: action.mode,
  }));
}
