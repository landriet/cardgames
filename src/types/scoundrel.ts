// Types for Scoundrel card game

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type CardType = 'monster' | 'weapon' | 'potion';

export interface DungeonCard extends Card {
  type: CardType;
}

export interface Room {
  cards: DungeonCard[]; // 4 cards per room
}

export interface ScoundrelGameState {
  deck: DungeonCard[];
  discard: DungeonCard[];
  currentRoom: Room;
  nextRoomBase: DungeonCard | null;
  equippedWeapon: DungeonCard | null;
  lastMonsterDefeated: DungeonCard | null;
  monstersOnWeapon: DungeonCard[]; // monsters stacked on equipped weapon
  health: number;
  maxHealth: number;
  canDeferRoom: boolean;
  lastActionWasDefer: boolean;
  gameOver: boolean;
  victory: boolean;
  potionTakenThisTurn?: boolean;
}
