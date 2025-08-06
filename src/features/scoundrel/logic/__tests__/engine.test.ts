describe('takeWeapon', () => {
  it('equips new weapon and discards previous weapon and monsters on it', () => {
    const prevWeapon: DungeonCard = { suit: 'diamonds', rank: 5 as Rank, type: 'weapon' };
    const prevMonsters: DungeonCard[] = [
      { suit: 'spades', rank: 7 as Rank, type: 'monster' },
      { suit: 'clubs', rank: 4 as Rank, type: 'monster' },
    ];
    const newWeapon: DungeonCard = { suit: 'diamonds', rank: 9 as Rank, type: 'weapon' };
    const state: ScoundrelGameState = {
      deck: [],
      discard: [],
      currentRoom: { cards: [newWeapon] },
      nextRoomBase: null,
      equippedWeapon: prevWeapon,
      lastMonsterDefeated: { suit: 'spades', rank: 7 as Rank, type: 'monster' },
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
  });

  it('equips weapon when no previous weapon', () => {
    const newWeapon: DungeonCard = { suit: 'diamonds', rank: 8 as Rank, type: 'weapon' };
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
  });
});
/// <reference types="vitest" />
import { initGame, avoidRoom, enterRoom, createScoundrelDeck, shuffle, dealRoom, fightMonsterBarehanded, fightMonster, takeWeapon } from '../engine';
import { ScoundrelGameState, CardType, Rank, Suit, DungeonCard } from '../../../../types/scoundrel';
import { describe, beforeEach, test, expect, it } from 'vitest';

describe('Scoundrel Engine - Room Entry/Avoid Logic', () => {
  let initialState: ScoundrelGameState;

  beforeEach(() => {
    initialState = initGame();
  });

  test('avoidRoom moves all 4 cards to bottom of deck and deals new room', () => {
    const prevDeck = [...initialState.deck];
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

  test('avoidRoom throws if trying to avoid two rooms in a row', () => {
    const stateAfterAvoid = avoidRoom(initialState);
    expect(() => avoidRoom(stateAfterAvoid)).toThrow('Cannot avoid two rooms in a row.');
  });

  test('enterRoom resets avoid flag and does not throw', () => {
    const stateAfterAvoid = avoidRoom(initialState);
    const stateAfterEnter = enterRoom(stateAfterAvoid);
    expect(stateAfterEnter.canDeferRoom).toBe(true);
    expect(stateAfterEnter.lastActionWasDefer).toBe(false);
  });

  test('enterRoom does not change room or deck', () => {
    const stateAfterEnter = enterRoom(initialState);
    expect(stateAfterEnter.currentRoom).toEqual(initialState.currentRoom);
    expect(stateAfterEnter.deck).toEqual(initialState.deck);
  });

  // Example usage
  test('example: avoid then enter', () => {
    let state = initGame();
    state = avoidRoom(state);
    expect(state.canDeferRoom).toBe(false);
    state = enterRoom(state);
    expect(state.canDeferRoom).toBe(true);
  });
});

describe('Scoundrel Engine', () => {
  it('fightMonsterBarehanded: takes full monster damage and discards monster', () => {
    const monster: DungeonCard = { suit: 'spades', rank: 11 as Rank, type: 'monster' as CardType };
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
  });

  it('fightMonster: barehanded mode matches fightMonsterBarehanded', () => {
    const monster: DungeonCard = { suit: 'spades', rank: 8 as Rank, type: 'monster' as CardType };
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
    const newState = fightMonster(state, monster, 'barehanded');
    expect(newState.health).toBe(7); // 15 - 8
    expect(newState.discard).toContain(monster);
  });

  it('fightMonster: with weapon, takes reduced damage and updates lastMonsterDefeated', () => {
    const monster: DungeonCard = { suit: 'spades', rank: 12 as Rank, type: 'monster' as CardType };
    const weapon: DungeonCard = { suit: 'diamonds', rank: 9 as Rank, type: 'weapon' as CardType };
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
    const newState = fightMonster(state, monster, 'weapon');
    expect(newState.health).toBe(17); // 20 - (12-9)
    expect(newState.lastMonsterDefeated).toEqual(monster);
  });

  it('fightMonster: weapon kill limit enforced', () => {
    const monster: DungeonCard = { suit: 'spades', rank: 13 as Rank, type: 'monster' as CardType };
    const weapon: DungeonCard = { suit: 'diamonds', rank: 7 as Rank, type: 'weapon' as CardType };
    const lastKilled: DungeonCard = { suit: 'spades', rank: 10 as Rank, type: 'monster' as CardType };
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
    expect(() => fightMonster(state, monster, 'weapon')).toThrow('Weapon cannot be used on monster stronger than last defeated');
  });
  it('creates a deck with only valid cards', () => {
    const deck = createScoundrelDeck();
    expect(deck.length).toBeGreaterThan(0);
    deck.forEach(card => {
      // No jokers, no red face cards, no red aces
      if ((card.suit === 'hearts' || card.suit === 'diamonds') && (card.rank >= 11)) {
        expect(false).toBe(true);
      }
    });
  });

  it('shuffles the deck', () => {
    const deck = createScoundrelDeck();
    const shuffled = shuffle(deck);
    // Not a perfect test, but should not be in the same order
    const cardToString = (card: { suit: string; rank: number }) => `${card.suit}-${card.rank}`;
    const deckStr = deck.map(cardToString).join(',');
    const shuffledStr = shuffled.map(cardToString).join(',');
    expect(shuffledStr).not.toEqual(deckStr);
  });

  it('deals a room of 4 cards', () => {
    const deck = createScoundrelDeck();
    const { room, deck: newDeck } = dealRoom(deck, null);
    expect(room.cards.length).toBe(4);
    expect(newDeck.length).toBe(deck.length - 4);
  });

  it('initializes game state correctly', () => {
    const game = initGame();
    expect(game.health).toBe(20);
    expect(game.maxHealth).toBe(20);
    expect(game.currentRoom.cards.length).toBe(4);
    expect(game.deck.length).toBeGreaterThan(0);
  });
});
