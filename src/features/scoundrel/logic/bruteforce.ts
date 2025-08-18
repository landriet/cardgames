import * as ScoundrelTypes from "../../../types/scoundrel.ts";
import { handleCardAction, avoidRoom, enterRoom, finalizeRoom, dealRoom } from "./engine.ts";

/**
 * Recursively explores all possible move sequences from the given state.
 * Returns the number of unique paths that lead to victory.
 *
 * This is a brute-force search, not optimized for performance.
 */
// Remove duplicate definition above. Use the memoized version below.
export function countWinningPaths(state: ScoundrelTypes.ScoundrelGameState, memo = new Set<string>()): number {
  // Terminal states
  if (state.victory) return 1;
  if (state.gameOver) return 0;

  // Memoization: hash the state
  const stateHash = hashGameState(state);
  if (memo.has(stateHash)) return 0;
  memo.add(stateHash);

  let totalWins = 0;

  //   // Decision: avoid room (if allowed)
  //   if (state.canDeferRoom && !state.lastActionWasDefer) {
  //     const avoided = avoidRoom(state);
  //     totalWins += countWinningPaths(avoided, memo);
  //   }

  // Decision: enter room
  const entered = enterRoom(state);
  // If no cards, can't proceed
  if (!entered.currentRoom || entered.currentRoom.cards.length === 0) {
    // Should only happen at end of deck
    if (entered.victory) return totalWins + 1;
    return totalWins;
  }

  // Generate all possible orders of resolving 3 of 4 cards
  const cards = entered.currentRoom.cards;
  if (cards.length < 4) {
    // Not a full room, just resolve all
    totalWins += resolveRoomRecursive(entered, cards, memo);
  } else {
    // For each combination of 3 cards out of 4, try all orders
    for (const combo of combinations(cards, 3)) {
      for (const order of permutations(combo)) {
        totalWins += resolveRoomRecursive(entered, order, memo);
      }
    }
  }

  return totalWins;
}

/**
 * Recursively resolve a sequence of cards in the room, then continue search.
 */
// Remove duplicate definition above. Use the memoized version below.
function resolveRoomRecursive(
  state: ScoundrelTypes.ScoundrelGameState,
  cardsToResolve: ScoundrelTypes.DungeonCard[],
  memo: Set<string>,
): number {
  // Prevent further actions if game is over or victory
  if (state.gameOver) return 0;
  if (state.victory) return 1;
  if (cardsToResolve.length === 0) {
    const finalized = finalizeRoom(state);
    if (finalized.gameOver) return 0;
    if (finalized.victory) return 1;
    // Deal next room if deck remains
    if (finalized.deck.length > 0 && finalized.nextRoomBase) {
      const { room, deck } = dealRoom(finalized.deck, finalized.nextRoomBase);
      const nextState: ScoundrelTypes.ScoundrelGameState = {
        ...finalized,
        currentRoom: room,
        deck,
        nextRoomBase: null,
        potionTakenThisTurn: false,
        canDeferRoom: true,
        lastActionWasDefer: false,
        pendingMonsterChoice: undefined,
      };
      return countWinningPaths(nextState, memo);
    } else {
      // No more cards, check for victory
      if (finalized.victory) return 1;
      if (finalized.gameOver) return 0;
      return countWinningPaths(finalized, memo);
    }
  }

  // For the first card, try all possible actions
  const [card, ...rest] = cardsToResolve;
  let total = 0;
  if (card.type === "monster") {
    // If weapon equipped, can choose barehanded or weapon (if allowed)
    total += resolveRoomRecursive(handleCardAction(state, card, "barehanded"), rest, memo);
    if (state.equippedWeapon) {
      total += resolveRoomRecursive(handleCardAction(state, card, "weapon"), rest, memo);
    }
  } else {
    // Weapon or potion: only one way to resolve
    total += resolveRoomRecursive(handleCardAction(state, card), rest, memo);
  }
  return total;
}

/**
 * Hash the game state for memoization (simple JSON stringify, can be improved)
 */
function hashGameState(state: ScoundrelTypes.ScoundrelGameState): string {
  // Only include fields that affect game logic
  return JSON.stringify({
    deck: state.deck.map((card) => ({ s: card.suit, r: card.rank, t: card.type })),
    discard: state.discard.length,
    currentRoom: state.currentRoom?.cards.map((card) => ({ s: card.suit, r: card.rank, t: card.type })),
    nextRoomBase: state.nextRoomBase ? { s: state.nextRoomBase.suit, r: state.nextRoomBase.rank, t: state.nextRoomBase.type } : null,
    equippedWeapon: state.equippedWeapon
      ? { s: state.equippedWeapon.suit, r: state.equippedWeapon.rank, t: state.equippedWeapon.type }
      : null,
    lastMonsterDefeated: state.lastMonsterDefeated
      ? { s: state.lastMonsterDefeated.suit, r: state.lastMonsterDefeated.rank, t: state.lastMonsterDefeated.type }
      : null,
    monstersOnWeapon: state.monstersOnWeapon.map((card) => ({ s: card.suit, r: card.rank, t: card.type })),
    health: state.health,
    canDeferRoom: state.canDeferRoom,
    lastActionWasDefer: state.lastActionWasDefer,
    gameOver: state.gameOver,
    victory: state.victory,
    potionTakenThisTurn: state.potionTakenThisTurn,
  });
}

// Helper functions for combinations and permutations
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  if (arr.length === k) return [arr.slice()];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((combo) => [first, ...combo]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const perm of permutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}
