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

export function toEngineCard(card: DungeonCard): EngineDungeonCard {
  if (card.type === "monster") return new MonsterCard(card.suit, card.rank as EngineRank);
  if (card.type === "weapon") return new WeaponCard(card.rank as EngineRank);
  return new PotionCard(card.rank as EngineRank);
}

export function fromEngineCard(card: EngineDungeonCard): DungeonCard {
  return {
    type: card.type,
    suit: card.suit,
    rank: card.rank,
  };
}

export function toEngineGame(state: ScoundrelGameState): Game {
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
  player.potionsTakenThisTurn = state.potionsTakenThisTurn ?? (state.potionTakenThisTurn ? 1 : 0);

  const game = new Game([], player, state.variantRules, state.variantId);
  game.deck = state.deck.map(toEngineCard);
  game.discard = state.discard.map(toEngineCard);
  game.currentRoom = new Room(state.currentRoom.cards.map(toEngineCard));
  game.canDeferRoom = state.canDeferRoom;
  game.lastActionWasDefer = state.lastActionWasDefer;
  game.gameOver = state.gameOver;
  game.victory = state.victory;
  game.roomBeingEntered = true;
  game.cardsResolvedThisTurn = state.cardsResolvedThisTurn ?? 0;
  game.lastAction = null;

  return game;
}

export function collectAllCardsFromEngineGame(game: Game): EngineDungeonCard[] {
  const cards: EngineDungeonCard[] = [...game.deck, ...game.currentRoom.cards, ...game.discard];
  if (game.player.equippedWeapon) cards.push(game.player.equippedWeapon);
  cards.push(...game.player.monstersOnWeapon);
  if (game.player.lastMonsterDefeated) cards.push(game.player.lastMonsterDefeated);
  return cards;
}
