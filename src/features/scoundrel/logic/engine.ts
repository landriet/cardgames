
import {
  CardType,
  DungeonCard,
  Rank,
  Room,
  ScoundrelGameState,
  Suit,
} from '../../../types/scoundrel';

/**
 * Remove a card from the current room, by reference (object identity) or by index.
 * Note: Card removal by reference relies on strict object identity (===).
 * If cards are deserialized or cloned, this may not work as expected.
 *
 * @param state The game state
 * @param cardOrIndex The card object (reference) or index to remove
 * @returns Updated game state with card removed from current room
 * @throws Error if current room/cards are missing or index is invalid
 */
export function removeCardFromCurrentRoom(
  state: ScoundrelGameState,
  cardOrIndex: DungeonCard
): ScoundrelGameState {
  if (!state.currentRoom || !Array.isArray(state.currentRoom.cards)) {
    throw new Error(
      '[removeCardFromCurrentRoom] No current room or cards to remove from.'
    );
  }
  let cardIndex: number;
  cardIndex = state.currentRoom.cards.findIndex((c) => c === cardOrIndex);
  if (cardIndex === -1) {
    // Card not found, return state unchanged
    // This is not an error: it may be called with a card not present in the room
    return state;
  }
  const newCards = state.currentRoom.cards.slice();
  newCards.splice(cardIndex, 1);
  return {
    ...state,
    currentRoom: {
      ...state.currentRoom,
      cards: newCards,
    },
  };
}


/**
 * Take a weapon: must equip immediately, discard previous weapon and monsters on it.
 * Removes the weapon from the current room if present.
 * @throws Error if card is not a weapon
 */
export function takeWeapon(
  state: ScoundrelGameState,
  weapon: DungeonCard
): ScoundrelGameState {
  if (weapon.type !== 'weapon') {
    throw new Error('[takeWeapon] Card is not a weapon.');
  }
  let newDiscard = [...state.discard];
  if (state.equippedWeapon) {
    newDiscard.push(state.equippedWeapon);
    if (state.monstersOnWeapon && state.monstersOnWeapon.length > 0) {
      newDiscard = newDiscard.concat(state.monstersOnWeapon);
    }
  }
  // Remove the weapon from the current room's cards, if present
  const newState = removeCardFromCurrentRoom(state, weapon);
  return {
    ...newState,
    equippedWeapon: weapon,
    monstersOnWeapon: [],
    discard: newDiscard,
    lastMonsterDefeated: null, // reset kill limit
  };
}
/**
 * Fight a monster, either barehanded or with weapon.
 * Weapon mode enforces kill limit: can only be used on monsters <= last monster it killed (if any).
 * @throws Error if card is not a monster, or if weapon mode is selected but no weapon is equipped, or if kill limit is exceeded.
 */
export function fightMonster(
  state: ScoundrelGameState,
  monster: DungeonCard,
  mode: 'barehanded' | 'weapon'
): ScoundrelGameState {
  if (monster.type !== 'monster') {
    throw new Error('[fightMonster] Card is not a monster.');
  }
  if (mode === 'barehanded') {
    // Use barehanded logic
    return fightMonsterBarehanded(state, monster);
  } else if (!state.equippedWeapon) {
    throw new Error('[fightMonster] No weapon equipped for weapon mode.');
  } else {
    // With weapon
    const weapon = state.equippedWeapon;
    // Enforce weapon kill limit: can only be used on monsters <= last monster it killed (if any)
    if (
      state.lastMonsterDefeated &&
      monster.rank > state.lastMonsterDefeated.rank
    ) {
      throw new Error(
        '[fightMonster] Weapon cannot be used on monster stronger than last defeated.'
      );
    }
    // Calculate damage
    const damage = Math.max(monster.rank - weapon.rank, 0);

    // Remove monster from current room using utility
    const stateAfterRemoval = removeCardFromCurrentRoom(state, monster);
    // Add monster to discard
    const newDiscard = [...stateAfterRemoval.discard, monster];
    // Place monster on weapon (track in monstersOnWeapon)
    return {
      ...stateAfterRemoval,
      health: state.health - damage,
      lastMonsterDefeated: monster,
      monstersOnWeapon: [...(state.monstersOnWeapon || []), monster],
      discard: newDiscard,
    };
  }
}
/**
 * Fight a monster barehanded: take full monster damage, discard monster.
 * @throws Error if card is not a monster
 */
export function fightMonsterBarehanded(
  state: ScoundrelGameState,
  monster: DungeonCard
): ScoundrelGameState {
  if (monster.type !== 'monster') {
    throw new Error('[fightMonsterBarehanded] Card is not a monster.');
  }
  const newHealth = state.health - monster.rank;
  // Remove monster from current room using utility
  const stateAfterRemoval = removeCardFromCurrentRoom(state, monster);
  return {
    ...stateAfterRemoval,
    health: newHealth,
    discard: [...stateAfterRemoval.discard, monster],
  };
}

// Utility: Create a deck for Scoundrel
export function createScoundrelDeck(): DungeonCard[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const deck: DungeonCard[] = [];
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      // Remove Jokers, red face cards, and red aces
      if (
        (suit === 'hearts' || suit === 'diamonds') &&
        (rank === 11 || rank === 12 || rank === 13 || rank === 14)
      ) {
        continue;
      }
      if ((suit === 'hearts' || suit === 'diamonds') && rank === 14) continue; // Red aces
      let type: CardType;
      if (suit === 'hearts') type = 'potion';
      else if (suit === 'diamonds') type = 'weapon';
      else type = 'monster';
      deck.push({ suit, rank: rank as Rank, type });
    }
  }
  return shuffle(deck);
}

// Fisher-Yates shuffle
export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function dealRoom(
  deck: DungeonCard[],
  nextRoomBase: DungeonCard | null
): { room: Room; deck: DungeonCard[] } {
  const cards: DungeonCard[] = [];
  let workingDeck = [...deck];
  if (nextRoomBase) {
    cards.push(nextRoomBase);
  }
  while (cards.length < 4 && workingDeck.length > 0) {
    cards.push(workingDeck.shift()!);
  }
  return { room: { cards }, deck: workingDeck };
}

export function initGame(): ScoundrelGameState {
  const deck = createScoundrelDeck();
  const { room, deck: newDeck } = dealRoom(deck, null);
  return {
    deck: newDeck,
    discard: [],
    currentRoom: room,
    nextRoomBase: null,
    equippedWeapon: null,
    lastMonsterDefeated: null,
    monstersOnWeapon: [],
    health: 20,
    maxHealth: 20,
    canDeferRoom: true,
    lastActionWasDefer: false,
    gameOver: false,
    victory: false,
  };
}

// --- Room Entry/Avoid Logic ---

// Avoid the current room: move all 4 cards to bottom of deck, enforce avoid rules
export function avoidRoom(state: ScoundrelGameState): ScoundrelGameState {
  if (!state.canDeferRoom || state.lastActionWasDefer) {
    throw new Error('Cannot avoid two rooms in a row.');
  }
  // Move all 4 cards to bottom of deck
  const avoidedCards = [...state.currentRoom.cards];
  const newDeck = [...state.deck, ...avoidedCards];
  // Deal new room (no nextRoomBase)
  const { room, deck: updatedDeck } = dealRoom(newDeck, null);
  return {
    ...state,
    deck: updatedDeck,
    currentRoom: room,
    nextRoomBase: null,
    canDeferRoom: false, // cannot avoid two in a row
    lastActionWasDefer: true,
  };
}

// Enter the current room: player must face 3 of 4 cards, leave 4th for next room
export function enterRoom(state: ScoundrelGameState): ScoundrelGameState {
  // After entering, player must resolve 3 of 4 cards, leave 4th as nextRoomBase
  // (actual card resolution handled elsewhere)
  return {
    ...state,
    canDeferRoom: true, // can avoid next room if desired
    lastActionWasDefer: false,
  };
}
