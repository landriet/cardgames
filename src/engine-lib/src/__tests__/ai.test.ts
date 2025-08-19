import { cloneGame, bruteforce, BruteForceResult } from "../ai";
import { Game, DungeonCard, Room, Player, MonsterCard, WeaponCard, PotionCard } from "../index";

describe("cloneGame", () => {
  it("deep clones a Game instance and preserves prototypes", () => {
    const player = new Player(10, 10);
    const room = new Room([new MonsterCard("spades", 5)]);
    const game = new Game([new MonsterCard("spades", 5)], player);
    game.currentRoom = room;

    const clone = cloneGame(game);
    expect(clone).not.toBe(game);
    expect(clone.player).not.toBe(game.player);
    expect(clone.currentRoom).not.toBe(game.currentRoom);
    expect(clone instanceof Game).toBe(true);
    expect(clone.player instanceof Player).toBe(true);
    expect(clone.currentRoom instanceof Room).toBe(true);
    expect(clone.player.health).toBe(10);
    expect(clone.currentRoom.cards[0].type).toBe("monster");
    expect(clone.currentRoom.cards[0].suit).toBe("spades");
    expect(clone.currentRoom.cards[0].rank).toBe(5);
    expect(clone.currentRoom.cards.length).toBe(game.currentRoom.cards.length);
    expect(clone.deck.length).toBe(game.deck.length);
    expect(clone.discard.length).toBe(game.discard.length);
  });
});

describe("bruteforce", () => {
  it("finds a victory path and returns correct result", () => {
    // Setup: Room with no monsters, empty deck, player alive
    const player = new Player(10, 10);
    const room = new Room([]);
    const game = new Game([], player);
    game.currentRoom = room;
    // This should trigger victory according to engine logic
    const result: BruteForceResult = bruteforce(game);
    expect(result.victory).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.actions)).toBe(true);
  });

  it("handles no possible actions gracefully", () => {
    // Setup: Room with monsters, player dead
    const player = new Player(0, 10); // health = 0 triggers gameOver
    const room = new Room([new MonsterCard("spades", 5)]);
    const game = new Game([new MonsterCard("spades", 5)], player);
    game.currentRoom = room;
    game.applyTurnRules(); // triggers gameOver
    const result: BruteForceResult = bruteforce(game);
    console.log("DEBUG bruteforce result (no possible actions):", result);
    expect(result.victory).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(-5);
  });
});
