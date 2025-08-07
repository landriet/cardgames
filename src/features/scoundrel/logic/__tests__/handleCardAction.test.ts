import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { handleCardAction } from '../engine';
import { CardType, DungeonCard, Rank, ScoundrelGameState } from '../../../../types/scoundrel';

function getBaseState(overrides: Partial<ScoundrelGameState> = {}): ScoundrelGameState {
  return {
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
    potionTakenThisTurn: false,
    ...overrides,
  };
}

describe('handleCardAction', () => {
  it('handles monster with weapon', () => {
    const monster: DungeonCard = { suit: 'spades', rank: 5 as Rank, type: 'monster' };
    const weapon: DungeonCard = { suit: 'diamonds', rank: 3 as Rank, type: 'weapon' };
    const state = getBaseState({ equippedWeapon: weapon, currentRoom: { cards: [monster] } });
    const newState = handleCardAction(state, monster);
    expect(newState.health).toBe(8); // 10 - (5-3)
    expect(newState.lastMonsterDefeated).toEqual(monster);
    expect(newState.discard).toContain(monster);
    expect(newState.monstersOnWeapon).toContain(monster);
    expect(newState.currentRoom.cards).not.toContain(monster);
  });

  it('handles monster barehanded', () => {
    const monster: DungeonCard = { suit: 'spades', rank: 4 as Rank, type: 'monster' };
    const state = getBaseState({ currentRoom: { cards: [monster] } });
    const newState = handleCardAction(state, monster);
    expect(newState.health).toBe(6); // 10 - 4
    expect(newState.discard).toContain(monster);
    expect(newState.currentRoom.cards).not.toContain(monster);
  });

  it('handles weapon pickup', () => {
    const weapon: DungeonCard = { suit: 'diamonds', rank: 7 as Rank, type: 'weapon' };
    const state = getBaseState({ currentRoom: { cards: [weapon] } });
    const newState = handleCardAction(state, weapon);
    expect(newState.equippedWeapon).toEqual(weapon);
    expect(newState.currentRoom.cards).not.toContain(weapon);
    expect(newState.discard).not.toContain(weapon);
  });

  it('handles potion pickup (first potion)', () => {
    const potion: DungeonCard = { suit: 'hearts', rank: 5 as Rank, type: 'potion' };
    const state = getBaseState({ currentRoom: { cards: [potion] }, health: 10, potionTakenThisTurn: false });
    const newState = handleCardAction(state, potion);
    expect(newState.health).toBe(15); // 10 + 5
    expect(newState.potionTakenThisTurn).toBe(true);
    expect(newState.discard).toContain(potion);
    expect(newState.currentRoom.cards).not.toContain(potion);
  });

  it('handles potion pickup (already took potion this turn)', () => {
    const potion: DungeonCard = { suit: 'hearts', rank: 5 as Rank, type: 'potion' };
    const state = getBaseState({ currentRoom: { cards: [potion] }, health: 10, potionTakenThisTurn: true });
    const newState = handleCardAction(state, potion);
    expect(newState.health).toBe(10); // unchanged
    expect(newState.potionTakenThisTurn).toBe(true);
    expect(newState.discard).toContain(potion);
    expect(newState.currentRoom.cards).not.toContain(potion);
  });

  it('logs error and returns state unchanged for unknown card type', () => {
    const badCard = { suit: 'spades' as const, rank: 2 as Rank, type: 'unknown' as CardType };
    const state = getBaseState();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const newState = handleCardAction(state, badCard);
    expect(newState).toBe(state);
    expect(spy).toHaveBeenCalledWith('[handleCardAction] Unknown card type.');
    spy.mockRestore();
  });
});
