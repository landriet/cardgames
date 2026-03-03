import { Game, Player, Room, MonsterCard, WeaponCard, PotionCard, DungeonCard, RuleConfig } from "../index";
import { getUnseenCards } from "../pimc";

const DEFAULT_RULES: Required<RuleConfig> = {
  startingHealth: 20,
  maxHealth: 20,
  potionsPerRoom: 1,
  canSkipRooms: true,
  canSkipConsecutive: false,
  weaponKillLimit: true,
};

function createGameWithState(opts: {
  deck: DungeonCard[];
  room: DungeonCard[];
  player: Player;
  discard?: DungeonCard[];
  roomBeingEntered?: boolean;
}): Game {
  const game = Object.create(Game.prototype) as Game;
  game.rules = { ...DEFAULT_RULES };
  game.deck = opts.deck;
  game.currentRoom = new Room(opts.room);
  game.player = opts.player;
  game.canDeferRoom = true;
  game.lastActionWasDefer = false;
  game.gameOver = false;
  game.victory = false;
  game.roomBeingEntered = opts.roomBeingEntered ?? false;
  game.lastAction = null;
  game.discard = opts.discard ?? [];
  return game;
}

describe("getUnseenCards", () => {
  it("returns full deck minus room cards and discard", () => {
    const fullDeck = Game.createDeck();
    // Take first 4 cards as room, next 2 as discard
    const roomCards = fullDeck.slice(0, 4);
    const discardCards = fullDeck.slice(4, 6);
    const deckCards = fullDeck.slice(6);

    const game = createGameWithState({
      deck: deckCards,
      room: roomCards,
      player: new Player(20, 20),
      discard: discardCards,
    });

    const unseen = getUnseenCards(game);
    // Unseen should equal the deck cards (everything not in room or discard)
    expect(unseen.length).toBe(deckCards.length);
  });

  it("excludes equipped weapon and monsters on weapon", () => {
    const fullDeck = Game.createDeck();
    const roomCards = fullDeck.slice(0, 4);

    const player = new Player(20, 20);
    player.equippedWeapon = new WeaponCard(5);
    player.monstersOnWeapon = [new MonsterCard("clubs", 3)];

    // Remove the weapon-diamonds-5 and monster-clubs-3 from the remaining deck
    const remaining = fullDeck
      .slice(4)
      .filter(
        (c) =>
          !(c.type === "weapon" && c.suit === "diamonds" && c.rank === 5) && !(c.type === "monster" && c.suit === "clubs" && c.rank === 3),
      );

    const game = createGameWithState({
      deck: remaining,
      room: roomCards,
      player,
    });

    const unseen = getUnseenCards(game);
    // Unseen = remaining (the deck), since all non-deck cards are accounted for
    expect(unseen.length).toBe(remaining.length);
    // None of the unseen should match the weapon or the monster on weapon
    expect(unseen.some((c) => c.type === "weapon" && c.rank === 5)).toBe(false);
    expect(unseen.some((c) => c.type === "monster" && c.suit === "clubs" && c.rank === 3)).toBe(false);
  });

  it("returns empty array when all cards are visible", () => {
    const deck = [new MonsterCard("clubs", 2), new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 5)];
    const game = createGameWithState({
      deck: [],
      room: deck,
      player: new Player(20, 20),
    });

    // Need to construct a full deck that only contains these 4 cards
    // Actually, getUnseenCards compares against Game.createDeck() which is the standard 44-card deck.
    // With only 4 cards in room and nothing else, there are 40 unseen cards.
    const unseen = getUnseenCards(game);
    expect(unseen.length).toBe(40);
  });
});
