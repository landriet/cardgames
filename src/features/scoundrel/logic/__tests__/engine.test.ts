import { takePotion } from "../engine";
import { beforeEach, describe, expect, it, test } from "vitest";
import { vi } from "vitest";
import { CardType, DungeonCard, Rank, ScoundrelGameState } from "../../../../types/scoundrel";
import {
  avoidRoom,
  createScoundrelDeck,
  dealRoom,
  enterRoom,
  fightMonster,
  fightMonsterBarehanded,
  initGame,
  removeCardFromCurrentRoom,
  shuffle,
  takeWeapon,
} from "../engine";
import { finalizeRoom } from "../engine";

describe("takePotion", () => {
  it("only allows one potion per turn, extras discarded with no effect", () => {
    const potion1: DungeonCard = {
      suit: "hearts",
      rank: 5 as Rank,
      type: "potion",
    };
    const potion2: DungeonCard = {
      suit: "hearts",
      rank: 7 as Rank,
      type: "potion",
    };
    let state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [potion1, potion2] },
      nextRoomBase: null,
      equippedWeapon: null,
      lastMonsterDefeated: null,
      monstersOnWeapon: [],
      health: 10,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      gameOver: false,
      victory: false,
      potionTakenThisTurn: false,
    };
    // Take first potion
    state = takePotion(state, potion1);
    expect(state.health).toBe(15); // 10 + 5
    expect(state.potionTakenThisTurn).toBe(true);
    expect(state.discard).toContain(potion1);
    // Take second potion (should have no effect)
    state = takePotion(state, potion2);
    expect(state.health).toBe(15); // unchanged
    expect(state.discard).toContain(potion2);
    expect(state.potionTakenThisTurn).toBe(true);
  });

  it("does not allow health to exceed maxHealth", () => {
    const potion: DungeonCard = {
      suit: "hearts",
      rank: 8 as Rank,
      type: "potion",
    };
    let state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [potion] },
      nextRoomBase: null,
      equippedWeapon: null,
      lastMonsterDefeated: null,
      monstersOnWeapon: [],
      health: 18,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      gameOver: false,
      victory: false,
      potionTakenThisTurn: false,
    };
    state = takePotion(state, potion);
    expect(state.health).toBe(20); // maxHealth
    expect(state.discard).toContain(potion);
    expect(state.potionTakenThisTurn).toBe(true);
  });
});
describe("Scoundrel Engine Edge Cases", () => {
  it("removeCardFromCurrentRoom: removing by reference not present returns state unchanged", () => {
    const card1: DungeonCard = {
      suit: "spades",
      rank: 2 as Rank,
      type: "monster",
    };
    const card2: DungeonCard = {
      suit: "hearts",
      rank: 5 as Rank,
      type: "potion",
    };
    const notInRoom: DungeonCard = {
      suit: "diamonds",
      rank: 7 as Rank,
      type: "weapon",
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [card1, card2] },
      nextRoomBase: null,
      equippedWeapon: null,
      lastMonsterDefeated: null,
      health: 20,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      monstersOnWeapon: [],
      gameOver: false,
      victory: false,
    };
    const newState = removeCardFromCurrentRoom(state, notInRoom);
    expect(newState).toBe(state); // should be same object
  });

  it("takeWeapon: weapon not in current room still equips and discards correctly", () => {
    const weapon: DungeonCard = {
      suit: "diamonds",
      rank: 8 as Rank,
      type: "weapon",
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [] },
      nextRoomBase: null,
      equippedWeapon: null,
      lastMonsterDefeated: null,
      monstersOnWeapon: [],
      health: 10,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      gameOver: false,
      victory: false,
    };
    const newState = takeWeapon(state, weapon);
    expect(newState.equippedWeapon).toEqual(weapon);
    expect(newState.currentRoom.cards.length).toBe(0);
  });

  it("fightMonster: monster not in current room does not affect state", () => {
    const monster: DungeonCard = {
      suit: "spades",
      rank: 8 as Rank,
      type: "monster",
    };
    const notInRoom: DungeonCard = {
      suit: "clubs",
      rank: 10 as Rank,
      type: "monster",
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [monster] },
      nextRoomBase: null,
      equippedWeapon: null,
      lastMonsterDefeated: null,
      health: 15,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      monstersOnWeapon: [],
      gameOver: false,
      victory: false,
    };
    const newState = fightMonster(state, notInRoom, "barehanded");
    // Should be unchanged except for health and discard (since removal is a no-op)
    expect(newState.currentRoom.cards).toEqual([monster]);
    expect(newState.discard).toContain(notInRoom);
  });

  it("removeCardFromCurrentRoom: logs error and returns state unchanged if no current room", () => {
    const card: DungeonCard = {
      suit: "spades",
      rank: 2 as Rank,
      type: "monster",
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: null as any,
      nextRoomBase: null,
      equippedWeapon: null,
      lastMonsterDefeated: null,
      health: 20,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      monstersOnWeapon: [],
      gameOver: false,
      victory: false,
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const newState = removeCardFromCurrentRoom(state, card);
    expect(newState).toBe(state);
    expect(spy).toHaveBeenCalledWith("[removeCardFromCurrentRoom] No current room or cards to remove from.");
    spy.mockRestore();
  });
});

describe("takeWeapon", () => {
  it("equips new weapon and discards previous weapon and monsters on it", () => {
    const prevWeapon: DungeonCard = {
      suit: "diamonds",
      rank: 5 as Rank,
      type: "weapon",
    };
    const prevMonsters: DungeonCard[] = [
      { suit: "spades", rank: 7 as Rank, type: "monster" },
      { suit: "clubs", rank: 4 as Rank, type: "monster" },
    ];
    const newWeapon: DungeonCard = {
      suit: "diamonds",
      rank: 9 as Rank,
      type: "weapon",
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [newWeapon] },
      nextRoomBase: null,
      equippedWeapon: prevWeapon,
      lastMonsterDefeated: { suit: "spades", rank: 7 as Rank, type: "monster" },
      monstersOnWeapon: prevMonsters,
      health: 10,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      gameOver: false,
      victory: false,
    };
    const newState = takeWeapon(state, newWeapon);
    expect(newState.equippedWeapon).toEqual(newWeapon);
    expect(newState.monstersOnWeapon).toEqual([]);
    expect(newState.discard).toEqual([prevWeapon, ...prevMonsters]);
    expect(newState.lastMonsterDefeated).toBeNull();
    // Assert weapon is removed from currentRoom.cards
    expect(newState.currentRoom.cards).not.toContain(newWeapon);
    expect(newState.currentRoom.cards.length).toBe(0);
  });

  it("equips weapon when no previous weapon", () => {
    const newWeapon: DungeonCard = {
      suit: "diamonds",
      rank: 8 as Rank,
      type: "weapon",
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [newWeapon] },
      nextRoomBase: null,
      equippedWeapon: null,
      lastMonsterDefeated: null,
      monstersOnWeapon: [],
      health: 10,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      gameOver: false,
      victory: false,
    };
    const newState = takeWeapon(state, newWeapon);
    expect(newState.equippedWeapon).toEqual(newWeapon);
    expect(newState.monstersOnWeapon).toEqual([]);
    expect(newState.discard).toEqual([]);
    expect(newState.lastMonsterDefeated).toBeNull();
    // Assert weapon is removed from currentRoom.cards
    expect(newState.currentRoom.cards).not.toContain(newWeapon);
    expect(newState.currentRoom.cards.length).toBe(0);
  });
});

describe("Scoundrel Engine - Room Entry/Avoid Logic", () => {
  test("finalizeRoom leaves 4th card as nextRoomBase and empties room", () => {
    // Setup: room with 1 card left after resolving 3
    const lastCard: DungeonCard = {
      suit: "spades",
      rank: 7 as Rank,
      type: "monster",
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [lastCard] },
      nextRoomBase: null,
      equippedWeapon: null,
      lastMonsterDefeated: null,
      monstersOnWeapon: [],
      health: 10,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      gameOver: false,
      victory: false,
      potionTakenThisTurn: false,
    };
    const newState = finalizeRoom(state);
    expect(newState.nextRoomBase).toEqual(lastCard);
    expect(newState.currentRoom.cards.length).toBe(0);
  });
  let initialState: ScoundrelGameState;

  beforeEach(() => {
    initialState = initGame();
  });

  test("avoidRoom moves all 4 cards to bottom of deck and deals new room", () => {
    // const prevDeck = [...initialState.deck]; // removed unused variable
    const prevRoom = [...initialState.currentRoom.cards];
    const stateAfterAvoid = avoidRoom(initialState);
    // The avoided cards should now be at the end of the deck
    expect(stateAfterAvoid.deck.slice(-4)).toEqual(prevRoom);
    // The new room should not be the same as the previous room
    expect(stateAfterAvoid.currentRoom.cards).not.toEqual(prevRoom);
    // Avoid flag should be set
    expect(stateAfterAvoid.canDeferRoom).toBe(false);
    expect(stateAfterAvoid.lastActionWasDefer).toBe(true);
  });

  test("avoidRoom logs error and returns state unchanged if trying to avoid two rooms in a row", () => {
    const stateAfterAvoid = avoidRoom(initialState);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const newState = avoidRoom(stateAfterAvoid);
    expect(newState).toBe(stateAfterAvoid);
    expect(spy).toHaveBeenCalledWith("Cannot avoid two rooms in a row.");
    spy.mockRestore();
  });

  test("enterRoom resets avoid flag and does not throw", () => {
    const stateAfterAvoid = avoidRoom(initialState);
    const stateAfterEnter = enterRoom(stateAfterAvoid);
    expect(stateAfterEnter.canDeferRoom).toBe(true);
    expect(stateAfterEnter.lastActionWasDefer).toBe(false);
  });

  test("enterRoom does not change room or deck", () => {
    const stateAfterEnter = enterRoom(initialState);
    expect(stateAfterEnter.currentRoom).toEqual(initialState.currentRoom);
    expect(stateAfterEnter.deck).toEqual(initialState.deck);
  });

  // Example usage
  test("example: avoid then enter", () => {
    let state = initGame();
    state = avoidRoom(state);
    expect(state.canDeferRoom).toBe(false);
    state = enterRoom(state);
    expect(state.canDeferRoom).toBe(true);
  });

  test("room carry-forward mechanic: resolve 3 cards, finalize, next room includes carried card", () => {
    let state = initGame();
    // Simulate resolving 3 cards (remove 3 from currentRoom)
    const initialRoomCards = [...state.currentRoom.cards];
    // Remove first 3 cards
    for (let i = 0; i < 3; i++) {
      state = removeCardFromCurrentRoom(state, initialRoomCards[i]);
    }
    // Only 1 card left in room
    expect(state.currentRoom.cards.length).toBe(1);
    const carriedCard = state.currentRoom.cards[0];
    // Finalize room
    state = finalizeRoom(state);
    expect(state.nextRoomBase).toEqual(carriedCard);
    expect(state.currentRoom.cards.length).toBe(0);
    // Deal next room
    const { room, deck: newDeck } = dealRoom(state.deck, state.nextRoomBase);
    // Room should contain carried card and 3 new cards
    expect(room.cards.length).toBe(4);
    expect(room.cards[0]).toEqual(carriedCard);
    // The other 3 should be from the deck
    expect(newDeck.length).toBe(state.deck.length - 3);
  });
});

describe("Scoundrel Engine", () => {
  it("fightMonsterBarehanded: takes full monster damage and discards monster", () => {
    const monster: DungeonCard = {
      suit: "spades",
      rank: 11 as Rank,
      type: "monster" as CardType,
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [monster] },
      nextRoomBase: null,
      equippedWeapon: null,
      lastMonsterDefeated: null,
      health: 20,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      monstersOnWeapon: [],
      gameOver: false,
      victory: false,
    };
    const newState = fightMonsterBarehanded(state, monster);
    expect(newState.health).toBe(9); // 20 - 11
    expect(newState.discard).toContain(monster);
    // Monster should be removed from currentRoom.cards
    expect(newState.currentRoom.cards).not.toContain(monster);
  });

  it("fightMonster: barehanded mode matches fightMonsterBarehanded", () => {
    const monster: DungeonCard = {
      suit: "spades",
      rank: 8 as Rank,
      type: "monster" as CardType,
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [monster] },
      nextRoomBase: null,
      equippedWeapon: null,
      lastMonsterDefeated: null,
      health: 15,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      monstersOnWeapon: [],
      gameOver: false,
      victory: false,
    };
    const newState = fightMonster(state, monster, "barehanded");
    expect(newState.health).toBe(7); // 15 - 8
    expect(newState.discard).toContain(monster);
    // Monster should be removed from currentRoom.cards
    expect(newState.currentRoom.cards).not.toContain(monster);
  });

  it("fightMonster: with weapon, takes reduced damage and updates lastMonsterDefeated", () => {
    const monster: DungeonCard = {
      suit: "spades",
      rank: 12 as Rank,
      type: "monster" as CardType,
    };
    const weapon: DungeonCard = {
      suit: "diamonds",
      rank: 9 as Rank,
      type: "weapon" as CardType,
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [monster] },
      nextRoomBase: null,
      equippedWeapon: weapon,
      lastMonsterDefeated: null,
      health: 20,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      monstersOnWeapon: [],
      gameOver: false,
      victory: false,
    };
    const newState = fightMonster(state, monster, "weapon");
    expect(newState.health).toBe(17); // 20 - (12-9)
    expect(newState.lastMonsterDefeated).toEqual(monster);
    // Monster should be removed from currentRoom.cards
    expect(newState.currentRoom.cards).not.toContain(monster);
    // Monster should be in discard
    expect(newState.discard).toContain(monster);
  });

  it("fightMonster: weapon kill limit logs error and returns state unchanged", () => {
    const monster: DungeonCard = {
      suit: "spades",
      rank: 13 as Rank,
      type: "monster" as CardType,
    };
    const weapon: DungeonCard = {
      suit: "diamonds",
      rank: 7 as Rank,
      type: "weapon" as CardType,
    };
    const lastKilled: DungeonCard = {
      suit: "spades",
      rank: 10 as Rank,
      type: "monster" as CardType,
    };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [monster] },
      nextRoomBase: null,
      equippedWeapon: weapon,
      lastMonsterDefeated: lastKilled,
      health: 20,
      maxHealth: 20,
      canDeferRoom: true,
      lastActionWasDefer: false,
      monstersOnWeapon: [],
      gameOver: false,
      victory: false,
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const newState = fightMonster(state, monster, "weapon");
    expect(newState).toBe(state);
    expect(spy).toHaveBeenCalledWith("[fightMonster] Weapon cannot be used on monster stronger than last defeated.");
    spy.mockRestore();
  });
  it("creates a deck with only valid cards", () => {
    const deck = createScoundrelDeck();
    expect(deck.length).toBeGreaterThan(0);
    deck.forEach((card) => {
      // No jokers, no red face cards, no red aces
      if ((card.suit === "hearts" || card.suit === "diamonds") && card.rank >= 11) {
        expect(false).toBe(true);
      }
    });
  });

  it("shuffles the deck", () => {
    const deck = createScoundrelDeck();
    const shuffled = shuffle(deck);
    // Not a perfect test, but should not be in the same order
    const cardToString = (card: { suit: string; rank: number }) => `${card.suit}-${card.rank}`;
    const deckStr = deck.map(cardToString).join(",");
    const shuffledStr = shuffled.map(cardToString).join(",");
    expect(shuffledStr).not.toEqual(deckStr);
  });

  it("deals a room of 4 cards", () => {
    const deck = createScoundrelDeck();
    const { room, deck: newDeck } = dealRoom(deck, null);
    expect(room.cards.length).toBe(4);
    expect(newDeck.length).toBe(deck.length - 4);
  });

  it("initializes game state correctly", () => {
    const game = initGame();
    expect(game.health).toBe(20);
    expect(game.maxHealth).toBe(20);
    expect(game.currentRoom.cards.length).toBe(4);
    expect(game.deck.length).toBeGreaterThan(0);
  });
});
