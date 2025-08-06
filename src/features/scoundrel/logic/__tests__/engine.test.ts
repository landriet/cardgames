/// <reference types="vitest" />
import { initGame, avoidRoom, enterRoom, createScoundrelDeck, shuffle, dealRoom } from '../engine';
import { ScoundrelGameState } from '../../../../types/scoundrel';
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
