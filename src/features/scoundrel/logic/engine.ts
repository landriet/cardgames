import * as ScoundrelTypes from "../../../types/scoundrel.ts";

export type ScoundrelActionType = "playCard" | "enterRoom" | "skipRoom";

export interface ScoundrelPossibleAction {
  actionType: ScoundrelActionType;
  card?: ScoundrelTypes.DungeonCard;
  mode?: "barehanded" | "weapon";
}

/**
 * Returns all possible actions for the current state.
 * Each action is typed as 'playCard', 'enterRoom', or 'skipRoom'.
 * Card actions include card and mode; room actions do not.
 */
export function getPossibleActions(state: ScoundrelTypes.ScoundrelGameState): ScoundrelPossibleAction[] {
  if (state.gameOver || !state.currentRoom || !Array.isArray(state.currentRoom.cards)) {
    return [];
  }
  const actions: ScoundrelPossibleAction[] = [];
  // Room-level actions
  if (state.currentRoom && Array.isArray(state.currentRoom.cards) && state.currentRoom.cards.length === 4) {
    actions.push({ actionType: "enterRoom" });
    if (state.canDeferRoom && !state.lastActionWasDefer) {
      actions.push({ actionType: "skipRoom" });
    }
  } else {
    // Card actions
    for (const card of state.currentRoom.cards) {
      if (card.type === "monster") {
        actions.push({ actionType: "playCard", card, mode: "barehanded" });
        if (state.equippedWeapon) {
          if (!state.lastMonsterDefeated || card.rank <= state.lastMonsterDefeated.rank) {
            actions.push({ actionType: "playCard", card, mode: "weapon" });
          }
        }
      } else if (card.type === "potion") {
        actions.push({ actionType: "playCard", card });
      } else if (card.type === "weapon") {
        actions.push({ actionType: "playCard", card });
      }
    }
  }
  return actions;
}

/**
 * Internal helper to resolve a card action and return the resulting state.
 * If isSimulate is true, skips UI-specific logic (pendingMonsterChoice).
 */
function _resolveCardAction(
  state: ScoundrelTypes.ScoundrelGameState,
  card: ScoundrelTypes.DungeonCard,
  mode?: "barehanded" | "weapon",
  isSimulate?: boolean,
): ScoundrelTypes.ScoundrelGameState {
  // --- SANITY CHECKS ---
  // Check state validity
  if (!state || typeof state !== "object" || !("currentRoom" in state) || !("health" in state)) {
    console.error("[_resolveCardAction] Invalid state object.", state);
    throw new Error("Invalid game state object passed to _resolveCardAction.");
  }
  // Check card validity
  if (!card || typeof card !== "object" || !("type" in card) || !("rank" in card)) {
    console.error("[_resolveCardAction] Invalid card object.", card);
    throw new Error("Invalid DungeonCard object passed to _resolveCardAction.");
  }
  // Check mode validity
  if (mode && mode !== "barehanded" && mode !== "weapon") {
    console.error("[_resolveCardAction] Invalid mode:", mode);
    throw new Error(`Invalid mode: ${mode}. Must be 'barehanded' or 'weapon'.`);
  }
  // Prevent any action if game is over
  if (state.gameOver) {
    throw new Error("Cannot perform actions when game is over.");
  }
  // Prevent acting on the last card in the room only during the resolve 3 of 4 phase
  if (
    state.currentRoom &&
    Array.isArray(state.currentRoom.cards) &&
    state.currentRoom.cards.length === 1 &&
    state.currentRoom.cards[0] === card &&
    state.deck.length > 0
  ) {
    console.warn("[_resolveCardAction] Attempted to act on last card in room during resolve phase.");
    return state; // Do nothing, last card in room
  }
  // Check card is present in current room (unless simulating)
  if (!isSimulate && state.currentRoom && Array.isArray(state.currentRoom.cards) && !state.currentRoom.cards.includes(card)) {
    console.error("[_resolveCardAction] Card not present in current room.", card);
    throw new Error("Card not present in current room.");
  }
  let newState: ScoundrelTypes.ScoundrelGameState;
  if (card.type === "monster") {
    if (state.equippedWeapon && !mode) {
      // If called from UI, prompt for choice. If called from test/programmatic, default to weapon.
      if (!isSimulate && typeof window !== "undefined") {
        return {
          ...state,
          pendingMonsterChoice: { monster: card },
        };
      } else {
        newState = fightMonster(state, card, "weapon");
      }
    } else if (state.equippedWeapon && mode === "weapon") {
      newState = fightMonster(state, card, "weapon");
    } else if (state.equippedWeapon && mode === "barehanded") {
      newState = fightMonster(state, card, "barehanded");
    } else {
      newState = fightMonster(state, card, "barehanded");
    }
  } else if (card.type === "weapon") {
    newState = takeWeapon(state, card);
  } else if (card.type === "potion") {
    newState = takePotion(state, card);
  } else {
    console.error("[_resolveCardAction] Unknown card type:", card.type);
    throw new Error(`Unknown card type: ${card.type}`);
  }
  // Handle discarding the card centrally
  newState = {
    ...newState,
    discard: [...newState.discard, card],
  };
  // After resolving a card, check if only one card remains in the room
  if (
    newState.currentRoom &&
    Array.isArray(newState.currentRoom.cards) &&
    newState.currentRoom.cards.length === 1 &&
    newState.deck.length > 0
  ) {
    const finalizedState = finalizeRoom(newState);
    // Deal the next room automatically
    const { room, deck: updatedDeck } = dealRoom(finalizedState.deck);
    return {
      ...finalizedState,
      currentRoom: room,
      deck: updatedDeck,
      // Reset per-turn flags as needed
      potionTakenThisTurn: false,
      canDeferRoom: true,
      lastActionWasDefer: false,
      pendingMonsterChoice: undefined,
    };
  }
  return { ...newState, pendingMonsterChoice: undefined };
}

/**
 * Simulates the effect of playing a dungeon card on the player's health.
 *
 * This function resolves the card action without mutating the original game state,
 * and returns the resulting health value, clamped between 0 and the player's maximum health.
 *
 * @param state - The current game state of the Scoundrel.
 * @param card - The dungeon card to simulate.
 * @param mode - (Optional) The mode of action, either "barehanded" or "weapon".
 * @returns The simulated health value after the card action.
 */
export function simulateCardAction(
  state: ScoundrelTypes.ScoundrelGameState,
  card: ScoundrelTypes.DungeonCard,
  mode?: "barehanded" | "weapon",
): ScoundrelTypes.ScoundrelGameState {
  return _resolveCardAction(state, card, mode, true);
}

export function simulateCardActionHealth(
  state: ScoundrelTypes.ScoundrelGameState,
  card: ScoundrelTypes.DungeonCard,
  mode?: "barehanded" | "weapon",
): number {
  const simulatedState = _resolveCardAction(state, card, mode, true);
  return Math.max(0, Math.min(simulatedState.health, simulatedState.maxHealth));
}

/**
 * Handles the action of playing a dungeon card in the Scoundrel game.
 *
 * This function processes the given card action based on the current game state and the specified mode.
 *
 * @param state - The current state of the Scoundrel game.
 * @param card - The dungeon card to be played.
 * @param mode - Optional. Specifies the mode of action, either "barehanded" or "weapon".
 * @returns The updated game state after resolving the card action.
 */
export function handleCardAction(
  state: ScoundrelTypes.ScoundrelGameState,
  card: ScoundrelTypes.DungeonCard,
  mode?: "barehanded" | "weapon",
): ScoundrelTypes.ScoundrelGameState {
  console.log("[handleCardAction] Action:", { card, mode });
  return _resolveCardAction(state, card, mode, false);
}

/**
 * Centralized per-turn rule enforcement. Call after every player action.
 * - Resets potionTakenThisTurn if needed
 * - Checks for game over/victory
 * - Enforces health boundaries
 * - Add other per-turn rules here
 */
export function applyTurnRules(state: ScoundrelTypes.ScoundrelGameState): ScoundrelTypes.ScoundrelGameState {
  let newState = { ...state };
  // Clamp health between 0 and maxHealth
  newState.health = Math.max(0, Math.min(newState.health, newState.maxHealth));
  // Game over if health <= 0
  if (newState.health <= 0) {
    newState.gameOver = true;
    // Death scoring: sum monster values in dungeon, subtract from current health
    const monstersLeft = newState.deck.filter((card) => card.type === "monster");
    const monstersValue = monstersLeft.reduce((sum, card) => sum + card.rank, 0);
    newState.score = newState.health - monstersValue;
  }
  // Victory if deck is empty and currentRoom/cards are empty
  if (newState.deck.length === 0 && (!newState.currentRoom || newState.currentRoom.cards.length === 0)) {
    newState.victory = true;
  }
  // Reset potionTakenThisTurn if entering a new room (handled in enterRoom)
  // Add other per-turn rules as needed
  return newState;
}

/**
 * Take a health potion: only one per turn, extras discarded with no effect.
 * Adds value to health (max 20), sets potionTakenThisTurn flag, discards potion.
 * If already taken, discards potion with no effect.
 * @throws Error if card is not a potion
 */
export function takePotion(
  state: ScoundrelTypes.ScoundrelGameState,
  potion: ScoundrelTypes.DungeonCard,
): ScoundrelTypes.ScoundrelGameState {
  if (potion.type !== "potion") {
    console.error("[takePotion] Card is not a potion.");
    return state;
  }
  // Remove potion from current room
  const stateAfterRemoval = removeCardFromCurrentRoom(state, potion);
  let newState;
  if (state.potionTakenThisTurn) {
    // Already took a potion this turn, discard with no effect
    newState = {
      ...stateAfterRemoval,
      potionTakenThisTurn: true,
    };
  } else {
    // Take potion: add value to health, max 20
    const newHealth = Math.min(state.health + potion.rank, state.maxHealth);
    newState = {
      ...stateAfterRemoval,
      health: newHealth,
      potionTakenThisTurn: true,
    };
  }
  return applyTurnRules(newState);
}

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
  state: ScoundrelTypes.ScoundrelGameState,
  cardOrIndex: ScoundrelTypes.DungeonCard,
): ScoundrelTypes.ScoundrelGameState {
  if (!state.currentRoom || !Array.isArray(state.currentRoom.cards)) {
    console.error("[removeCardFromCurrentRoom] No current room or cards to remove from.");
    return state;
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
  state: ScoundrelTypes.ScoundrelGameState,
  weapon: ScoundrelTypes.DungeonCard,
): ScoundrelTypes.ScoundrelGameState {
  if (weapon.type !== "weapon") {
    console.error("[takeWeapon] Card is not a weapon.");
    return state;
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
  const updatedState = {
    ...newState,
    equippedWeapon: weapon,
    monstersOnWeapon: [],
    lastMonsterDefeated: null, // reset kill limit
  };
  return applyTurnRules(updatedState);
}
/**
 * Fight a monster, either barehanded or with weapon.
 * Weapon mode enforces kill limit: can only be used on monsters <= last monster it killed (if any).
 * @throws Error if card is not a monster, or if weapon mode is selected but no weapon is equipped, or if kill limit is exceeded.
 */
export function fightMonster(
  state: ScoundrelTypes.ScoundrelGameState,
  monster: ScoundrelTypes.DungeonCard,
  mode: "barehanded" | "weapon",
): ScoundrelTypes.ScoundrelGameState {
  if (monster.type !== "monster") {
    console.error("[fightMonster] Card is not a monster.");
    return state;
  }
  if (state.gameOver) {
    return state;
  }
  if (mode === "barehanded") {
    // Use barehanded logic
    return fightMonsterBarehanded(state, monster);
  } else if (!state.equippedWeapon) {
    console.error("[fightMonster] No weapon equipped for weapon mode.");
    return state;
  } else {
    // With weapon
    const weapon = state.equippedWeapon;
    // Enforce weapon kill limit: can only be used on monsters <= last monster it killed (if any)
    if (state.lastMonsterDefeated && monster.rank > state.lastMonsterDefeated.rank) {
      console.error("[fightMonster] Weapon cannot be used on monster stronger than last defeated.");
      return state;
    }
    // Calculate damage
    const damage = Math.max(monster.rank - weapon.rank, 0);

    // Remove monster from current room using utility
    const stateAfterRemoval = removeCardFromCurrentRoom(state, monster);
    // Place monster on weapon (track in monstersOnWeapon)
    const updatedState = {
      ...stateAfterRemoval,
      health: state.health - damage,
      lastMonsterDefeated: monster,
      monstersOnWeapon: [...(state.monstersOnWeapon || []), monster],
    };
    return applyTurnRules(updatedState);
  }
}
/**
 * Fight a monster barehanded: take full monster damage, discard monster.
 * @throws Error if card is not a monster
 */
export function fightMonsterBarehanded(
  state: ScoundrelTypes.ScoundrelGameState,
  monster: ScoundrelTypes.DungeonCard,
): ScoundrelTypes.ScoundrelGameState {
  if (monster.type !== "monster") {
    console.error("[fightMonsterBarehanded] Card is not a monster.");
    return state;
  }
  if (state.gameOver) {
    return state;
  }
  const newHealth = state.health - monster.rank;
  // Remove monster from current room using utility
  const stateAfterRemoval = removeCardFromCurrentRoom(state, monster);
  const updatedState = {
    ...stateAfterRemoval,
    health: newHealth,
  };
  return applyTurnRules(updatedState);
}

// Utility: Create a deck for Scoundrel
export function createScoundrelDeck(): ScoundrelTypes.DungeonCard[] {
  const suits: ScoundrelTypes.Suit[] = ["hearts", "diamonds", "clubs", "spades"];
  const deck: ScoundrelTypes.DungeonCard[] = [];
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      // Remove Jokers, red face cards, and red aces
      if ((suit === "hearts" || suit === "diamonds") && (rank === 11 || rank === 12 || rank === 13 || rank === 14)) {
        continue;
      }
      if ((suit === "hearts" || suit === "diamonds") && rank === 14) continue; // Red aces
      let type: ScoundrelTypes.CardType;
      if (suit === "hearts") type = "potion";
      else if (suit === "diamonds") type = "weapon";
      else type = "monster";
      deck.push({ suit, rank: rank as ScoundrelTypes.Rank, type });
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

export function dealRoom(deck: ScoundrelTypes.DungeonCard[]): { room: ScoundrelTypes.Room; deck: ScoundrelTypes.DungeonCard[] } {
  const cards: ScoundrelTypes.DungeonCard[] = [];
  let workingDeck = [...deck];
  while (cards.length < 4 && workingDeck.length > 0) {
    cards.push(workingDeck.shift()!);
  }
  return { room: { cards }, deck: workingDeck };
}

export function initGameWithStaticDeck(): ScoundrelTypes.ScoundrelGameState {
  const deck: ScoundrelTypes.DungeonCard[] = [
    { type: "potion", suit: "hearts", rank: 5 },
    { type: "weapon", suit: "diamonds", rank: 7 },
    { type: "monster", suit: "clubs", rank: 3 },
    { type: "monster", suit: "spades", rank: 9 },
    // { type: "potion", suit: "hearts", rank: 9 },
    // { type: "monster", suit: "clubs", rank: 9 },
    // { type: "weapon", suit: "diamonds", rank: 2 },
    // { type: "monster", suit: "clubs", rank: 6 },
    // { type: "monster", suit: "spades", rank: 8 },
    // { type: "weapon", suit: "diamonds", rank: 3 },
    // { type: "monster", suit: "clubs", rank: 4 },
    // { type: "monster", suit: "spades", rank: 12 },
    // { type: "potion", suit: "hearts", rank: 4 },
    // { type: "weapon", suit: "diamonds", rank: 4 },
    // { type: "monster", suit: "clubs", rank: 14 },
    // { type: "monster", suit: "spades", rank: 11 },
    // { type: "potion", suit: "hearts", rank: 6 },
    // { type: "weapon", suit: "diamonds", rank: 5 },
    // { type: "monster", suit: "clubs", rank: 10 },
  ];
  const { room, deck: newDeck } = dealRoom(deck);
  return {
    deck: newDeck,
    discard: [],
    currentRoom: room,
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

export function initGame(): ScoundrelTypes.ScoundrelGameState {
  const deck = createScoundrelDeck();
  const { room, deck: newDeck } = dealRoom(deck);
  return {
    deck: newDeck,
    discard: [],
    currentRoom: room,
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
export function avoidRoom(state: ScoundrelTypes.ScoundrelGameState): ScoundrelTypes.ScoundrelGameState {
  if (!state.canDeferRoom || state.lastActionWasDefer) {
    console.error("Cannot avoid two rooms in a row.");
    return state;
  }
  // Move all 4 cards to bottom of deck
  const avoidedCards = [...state.currentRoom.cards];
  const newDeck = [...state.deck, ...avoidedCards];
  return {
    ...state,
    deck: newDeck,
    currentRoom: { cards: [] },
    canDeferRoom: false,
    lastActionWasDefer: true,
  };
}

// Enter the current room: player must face 3 of 4 cards, leave 4th for next room
export function enterRoom(state: ScoundrelTypes.ScoundrelGameState): ScoundrelTypes.ScoundrelGameState {
  return {
    ...state,
    canDeferRoom: true,
    lastActionWasDefer: false,
    potionTakenThisTurn: false,
  };
}

/**
 * Finalize the room after 3 cards have been resolved
 * Should be called after the player has resolved 3 cards in the room
 */
export function finalizeRoom(state: ScoundrelTypes.ScoundrelGameState): ScoundrelTypes.ScoundrelGameState {
  if (!state.currentRoom || !Array.isArray(state.currentRoom.cards)) {
    console.error("[finalizeRoom] No current room or cards.");
    return state;
  }
  if (state.currentRoom.cards.length !== 1) {
    console.error("[finalizeRoom] Room must have exactly 1 card left to finalize.");
    return state;
  }
  return {
    ...state,
    currentRoom: { cards: [] },
  };
}
