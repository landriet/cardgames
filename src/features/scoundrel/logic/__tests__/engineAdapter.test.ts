import { describe, expect, it } from "vitest";
import { avoidRoom, handleCardAction, initGameWithStaticDeck, simulateCardActionHealth } from "../engineAdapter";
import type { DungeonCard, ScoundrelGameState } from "../../../../types/scoundrel";

function withOverrides(overrides: Partial<ScoundrelGameState>): ScoundrelGameState {
  return {
    ...initGameWithStaticDeck(),
    ...overrides,
  };
}

describe("engineAdapter", () => {
  it("creates deterministic starting room for frontend", () => {
    const state = initGameWithStaticDeck();
    expect(state.currentRoom.cards).toEqual([
      { type: "potion", suit: "hearts", rank: 5 },
      { type: "weapon", suit: "diamonds", rank: 7 },
      { type: "monster", suit: "clubs", rank: 3 },
      { type: "monster", suit: "spades", rank: 9 },
    ]);
    expect(state.deck.length).toBeGreaterThan(0);
    expect(state.health).toBe(20);
    expect(state.gameOver).toBe(false);
  });

  it("returns pendingMonsterChoice when weapon exists and monster mode is omitted", () => {
    const monster: DungeonCard = { type: "monster", suit: "clubs", rank: 4 };
    const state = withOverrides({
      equippedWeapon: { type: "weapon", suit: "diamonds", rank: 7 },
      currentRoom: { cards: [monster] },
    });

    const next = handleCardAction(state, monster);
    expect(next.pendingMonsterChoice?.monster).toEqual(monster);
    expect(next.health).toBe(state.health);
  });

  it("simulates weapon vs barehanded health deltas", () => {
    const monster: DungeonCard = { type: "monster", suit: "spades", rank: 9 };
    const state = withOverrides({
      health: 20,
      maxHealth: 20,
      equippedWeapon: { type: "weapon", suit: "diamonds", rank: 7 },
      currentRoom: { cards: [monster] },
    });

    expect(simulateCardActionHealth(state, monster, "weapon")).toBe(18);
    expect(simulateCardActionHealth(state, monster, "barehanded")).toBe(11);
  });

  it("deals and enters the next room after skip so frontend stays playable", () => {
    const state = initGameWithStaticDeck();
    const next = avoidRoom(state);
    expect(next.currentRoom.cards.length).toBe(4);
    expect(next.canDeferRoom).toBe(false);
    expect(next.lastActionWasDefer).toBe(true);
  });

  it("does not throw if simulateCardActionHealth receives a stale hovered card", () => {
    const state = initGameWithStaticDeck();
    const staleCard: DungeonCard = { type: "potion", suit: "hearts", rank: 2 };
    expect(() => simulateCardActionHealth(state, staleCard)).not.toThrow();
    expect(simulateCardActionHealth(state, staleCard)).toBe(state.health);
  });
});
