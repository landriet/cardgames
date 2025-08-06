// Take a weapon: must equip immediately, discard previous weapon and monsters on it
export function takeWeapon(state: ScoundrelGameState, weapon: DungeonCard): ScoundrelGameState {
  if (weapon.type !== 'weapon') {
    throw new Error('Card is not a weapon');
  }
  let newDiscard = [...state.discard];
  if (state.equippedWeapon) {
    newDiscard.push(state.equippedWeapon);
    if (state.monstersOnWeapon && state.monstersOnWeapon.length > 0) {
      newDiscard = newDiscard.concat(state.monstersOnWeapon);
    }
  }
  return {
    ...state,
    equippedWeapon: weapon,
    monstersOnWeapon: [],
    discard: newDiscard,
    lastMonsterDefeated: null, // reset kill limit
  };
}
// Fight a monster, either barehanded or with weapon
export function fightMonster(
  state: ScoundrelGameState,
  monster: DungeonCard,
  mode: 'barehanded' | 'weapon'
): ScoundrelGameState {
  if (monster.type !== 'monster') {
    throw new Error('Card is not a monster');
  }
  if (mode === 'barehanded') {
    // Use barehanded logic
    return fightMonsterBarehanded(state, monster);
  } else if (!state.equippedWeapon) {
    throw new Error('No weapon equipped for weapon mode');
  } else {
    // With weapon
    const weapon = state.equippedWeapon;
    // Enforce weapon kill limit: can only be used on monsters <= last monster it killed (if any)
    if (
      state.lastMonsterDefeated &&
      monster.rank > state.lastMonsterDefeated.rank
    ) {
      throw new Error('Weapon cannot be used on monster stronger than last defeated');
    }
    // Calculate damage
    const damage = Math.max(monster.rank - weapon.rank, 0);
    // Place monster on weapon (track in monstersOnWeapon)
    return {
      ...state,
      health: state.health - damage,
      lastMonsterDefeated: monster,
      monstersOnWeapon: [...(state.monstersOnWeapon || []), monster],
    };
  }
}
// Fight a monster barehanded: take full monster damage, discard monster
export function fightMonsterBarehanded(state: ScoundrelGameState, monster: DungeonCard): ScoundrelGameState {
  if (monster.type !== 'monster') {
    throw new Error('Card is not a monster');
  }
  const newHealth = state.health - monster.rank;
  return {
    ...state,
    health: newHealth,
    discard: [...state.discard, monster],
  };
}
import { CardType, DungeonCard, Room, ScoundrelGameState, Suit, Rank } from '../../../types/scoundrel';

// Utility: Create a deck for Scoundrel
export function createScoundrelDeck(): DungeonCard[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const deck: DungeonCard[] = [];
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      // Remove Jokers, red face cards, and red aces
      if (
        (suit === 'hearts' || suit === 'diamonds') && (rank === 11 || rank === 12 || rank === 13 || rank === 14)
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

export function dealRoom(deck: DungeonCard[], nextRoomBase: DungeonCard | null): { room: Room; deck: DungeonCard[] } {
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
