import { Game, Player, Room, MonsterCard, WeaponCard, PotionCard, DungeonCard, RuleConfig } from "../index";

const DEFAULT_RULES: Required<RuleConfig> = {
  startingHealth: 20,
  maxHealth: 20,
  potionsPerRoom: 1,
  canSkipRooms: true,
  canSkipConsecutive: false,
  weaponKillLimit: true,
};

/**
 * Helper: create a Game with specific state, bypassing normal constructor.
 * Sets up game with given deck/room/player without triggering applyTurnRules.
 */
function createGameWithState(opts: {
  deck: DungeonCard[];
  room: DungeonCard[];
  player: Player;
  canDeferRoom?: boolean;
  lastActionWasDefer?: boolean;
  roomBeingEntered?: boolean;
  discard?: DungeonCard[];
}): Game {
  const game = Object.create(Game.prototype) as Game;
  game.rules = { ...DEFAULT_RULES };
  game.deck = opts.deck;
  game.currentRoom = new Room(opts.room);
  game.player = opts.player;
  game.canDeferRoom = opts.canDeferRoom ?? true;
  game.lastActionWasDefer = opts.lastActionWasDefer ?? false;
  game.gameOver = false;
  game.victory = false;
  game.roomBeingEntered = opts.roomBeingEntered ?? false;
  game.cardsResolvedThisTurn = 0;
  game.lastResolvedCardType = null;
  game.lastResolvedPotionValue = null;
  game.lastAction = null;
  game.discard = opts.discard ?? [];
  return game;
}

describe("Bug 2a: Player.undoFightMonster damage formula sign", () => {
  it("restores correct health when undoing weapon fight (monster > weapon)", () => {
    const player = new Player(20, 20);
    player.equippedWeapon = new WeaponCard(9);
    const monster = new MonsterCard("clubs", 12);

    // Forward: damage = max(12 - 9, 0) = 3, health -> 17
    player.fightMonster(monster, "weapon");
    expect(player.health).toBe(17);

    // Undo: should restore health back to 20
    player.undoFightMonster(monster, "weapon");
    expect(player.health).toBe(20);
  });

  it("restores correct health when undoing weapon fight (weapon >= monster)", () => {
    const player = new Player(20, 20);
    player.equippedWeapon = new WeaponCard(10);
    const monster = new MonsterCard("spades", 7);

    // Forward: damage = max(7 - 10, 0) = 0, health stays 20
    player.fightMonster(monster, "weapon");
    expect(player.health).toBe(20);

    // Undo: should still be 20
    player.undoFightMonster(monster, "weapon");
    expect(player.health).toBe(20);
  });

  it("restores correct health when undoing barehanded fight", () => {
    const player = new Player(20, 20);
    const monster = new MonsterCard("clubs", 8);

    player.fightMonster(monster, "barehanded");
    expect(player.health).toBe(12);

    player.undoFightMonster(monster, "barehanded");
    expect(player.health).toBe(20);
  });
});

describe("Bug 2b: undoEnterRoom state restoration", () => {
  it("restores canDeferRoom, lastActionWasDefer, potionTakenThisTurn to pre-enter values", () => {
    const game = createGameWithState({
      deck: [new MonsterCard("clubs", 5), new MonsterCard("spades", 6), new MonsterCard("clubs", 7), new MonsterCard("spades", 8)],
      room: [new MonsterCard("clubs", 2), new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 10)],
      player: new Player(15, 20),
      canDeferRoom: false,
      lastActionWasDefer: true,
      roomBeingEntered: false,
    });
    game.player.potionTakenThisTurn = true;

    // enterRoom overwrites these
    game.enterRoom();
    expect(game.canDeferRoom).toBe(true);
    expect(game.lastActionWasDefer).toBe(false);
    expect(game.player.potionTakenThisTurn).toBe(false);
    expect(game.roomBeingEntered).toBe(true);

    // undoEnterRoom should restore original values
    game.undoEnterRoom();
    expect(game.canDeferRoom).toBe(false);
    expect(game.lastActionWasDefer).toBe(true);
    expect(game.player.potionTakenThisTurn).toBe(true);
    expect(game.roomBeingEntered).toBe(false);
  });

  it("restores lastAction to null when there was no previous action", () => {
    const game = createGameWithState({
      deck: [new MonsterCard("clubs", 5), new MonsterCard("spades", 6), new MonsterCard("clubs", 7), new MonsterCard("spades", 8)],
      room: [new MonsterCard("clubs", 2), new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 10)],
      player: new Player(20, 20),
    });

    game.enterRoom();
    expect(game.lastAction?.actionType).toBe("enterRoom");

    game.undoEnterRoom();
    expect(game.lastAction).toBeNull();
  });
});

describe("Bug 2c: undoAvoidRoom", () => {
  it("restores room cards and deck after avoid + deal", () => {
    const originalRoomCards = [new MonsterCard("clubs", 2), new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 10)];
    const deckCards = [
      new MonsterCard("clubs", 5),
      new MonsterCard("spades", 6),
      new MonsterCard("clubs", 7),
      new MonsterCard("spades", 8),
      new MonsterCard("clubs", 9),
      new MonsterCard("spades", 11),
      new MonsterCard("clubs", 12),
      new MonsterCard("spades", 13),
    ];

    const game = createGameWithState({
      deck: deckCards.slice(),
      room: originalRoomCards.map((c) => c.clone()),
      player: new Player(20, 20),
      canDeferRoom: true,
      lastActionWasDefer: false,
    });

    const originalDeckLength = game.deck.length;
    const originalRoomLength = game.currentRoom.cards.length;

    // avoidRoom pushes room cards to deck bottom, clears room, then applyTurnRules deals a new room
    game.avoidRoom();
    expect(game.canDeferRoom).toBe(false);
    expect(game.lastActionWasDefer).toBe(true);
    // After avoid, applyTurnRules should have dealt a new room from the deck
    expect(game.currentRoom.cards.length).toBe(4);

    // undoAvoidRoom should restore original state
    game.undoAvoidRoom();
    expect(game.canDeferRoom).toBe(true);
    expect(game.lastActionWasDefer).toBe(false);
    expect(game.currentRoom.cards.length).toBe(originalRoomLength);
    expect(game.deck.length).toBe(originalDeckLength);

    // Verify room cards match originals
    for (let i = 0; i < originalRoomCards.length; i++) {
      expect(game.currentRoom.cards[i].type).toBe(originalRoomCards[i].type);
      expect(game.currentRoom.cards[i].suit).toBe(originalRoomCards[i].suit);
      expect(game.currentRoom.cards[i].rank).toBe(originalRoomCards[i].rank);
    }
  });

  it("restores lastAction to previous value", () => {
    const game = createGameWithState({
      deck: [
        new MonsterCard("clubs", 5),
        new MonsterCard("spades", 6),
        new MonsterCard("clubs", 7),
        new MonsterCard("spades", 8),
        new MonsterCard("clubs", 9),
        new MonsterCard("spades", 11),
        new MonsterCard("clubs", 12),
        new MonsterCard("spades", 13),
      ],
      room: [new MonsterCard("clubs", 2), new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 10)],
      player: new Player(20, 20),
      canDeferRoom: true,
      lastActionWasDefer: false,
    });

    expect(game.lastAction).toBeNull();
    game.avoidRoom();
    expect(game.lastAction?.actionType).toBe("skipRoom");

    game.undoAvoidRoom();
    expect(game.lastAction).toBeNull();
  });
});

describe("Bug 2d: undoHandleCardAction weapon discard cleanup", () => {
  it("removes previous weapon and monsters from discard on weapon undo", () => {
    const oldWeapon = new WeaponCard(5);
    const oldMonster1 = new MonsterCard("clubs", 4);
    const oldMonster2 = new MonsterCard("spades", 3);
    const newWeapon = new WeaponCard(8);

    const player = new Player(20, 20);
    player.equippedWeapon = oldWeapon;
    player.monstersOnWeapon = [oldMonster1, oldMonster2];
    player.lastMonsterDefeated = oldMonster2;

    const game = createGameWithState({
      deck: [new MonsterCard("clubs", 9), new MonsterCard("spades", 10), new MonsterCard("clubs", 11), new MonsterCard("spades", 12)],
      room: [newWeapon, new MonsterCard("clubs", 2), new PotionCard(3), new MonsterCard("spades", 6)],
      player,
      roomBeingEntered: true,
    });

    // Playing the weapon discards old weapon + old monsters
    game.handleCardAction(newWeapon);
    expect(game.discard.length).toBeGreaterThanOrEqual(3); // old weapon + 2 old monsters
    expect(game.player.equippedWeapon!.rank).toBe(8);

    // Undo should remove them from discard
    game.undoHandleCardAction();
    expect(game.player.equippedWeapon!.rank).toBe(5);
    expect(game.player.monstersOnWeapon.length).toBe(2);
    // Discard should not contain old weapon or old monsters
    const discardHasOldWeapon = game.discard.some((c) => c.type === "weapon" && c.rank === 5);
    expect(discardHasOldWeapon).toBe(false);
    const discardHasOldMonster1 = game.discard.some((c) => c.type === "monster" && c.suit === "clubs" && c.rank === 4);
    expect(discardHasOldMonster1).toBe(false);
  });
});

describe("Bug 2e: undoHandleCardAction reverses applyTurnRules/dealRoom", () => {
  it("reverses deal that happens when 3rd card is played from room", () => {
    // Set up a room with 4 cards; play 3 to trigger deal
    const roomCards = [new MonsterCard("clubs", 2), new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 5)];
    const deckCards = [new MonsterCard("clubs", 9), new MonsterCard("spades", 10), new MonsterCard("clubs", 11)];

    const player = new Player(20, 20);

    const game = createGameWithState({
      deck: deckCards.slice(),
      room: roomCards.map((c) => c.clone()),
      player,
      roomBeingEntered: true,
    });

    const origDeckLen = game.deck.length;

    // Play 3 cards: potion, weapon, then a monster barehanded
    // After 3rd card, room has 1 card left + applyTurnRules deals new cards
    game.handleCardAction(new PotionCard(3));
    game.handleCardAction(new WeaponCard(4));
    // After this, room has 2 cards: MonsterCard clubs-2 and MonsterCard spades-5
    // Play 3rd card - this leaves 1 card, triggering deal
    game.handleCardAction(new MonsterCard("clubs", 2), "weapon");

    // After deal: room should have 4 cards (1 remaining + 3 from deck)
    expect(game.currentRoom.cards.length).toBe(4);
    expect(game.deck.length).toBe(0);

    // Undo the 3rd card play - should reverse the deal
    game.undoHandleCardAction();

    // Room should be back to 2 cards (the monster-clubs-2 returned + monster-spades-5)
    expect(game.currentRoom.cards.length).toBe(2);
    expect(game.deck.length).toBe(origDeckLen);
  });
});

describe("Bug 2f: lastAction restoration chain", () => {
  it("restores lastAction through enterRoom → playCard → undo playCard → undo enterRoom", () => {
    const game = createGameWithState({
      deck: [new MonsterCard("clubs", 9), new MonsterCard("spades", 10), new MonsterCard("clubs", 11), new MonsterCard("spades", 12)],
      room: [new MonsterCard("clubs", 2), new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 5)],
      player: new Player(20, 20),
    });

    expect(game.lastAction).toBeNull();

    game.enterRoom();
    expect(game.lastAction?.actionType).toBe("enterRoom");

    game.handleCardAction(new PotionCard(3));
    expect(game.lastAction?.actionType).toBe("playCard");

    game.undoHandleCardAction();
    expect(game.lastAction?.actionType).toBe("enterRoom");

    game.undoEnterRoom();
    expect(game.lastAction).toBeNull();
  });

  it("restores lastAction through avoidRoom → undo", () => {
    const game = createGameWithState({
      deck: [
        new MonsterCard("clubs", 5),
        new MonsterCard("spades", 6),
        new MonsterCard("clubs", 7),
        new MonsterCard("spades", 8),
        new MonsterCard("clubs", 9),
        new MonsterCard("spades", 10),
        new MonsterCard("clubs", 11),
        new MonsterCard("spades", 12),
      ],
      room: [new MonsterCard("clubs", 2), new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 14)],
      player: new Player(20, 20),
      canDeferRoom: true,
      lastActionWasDefer: false,
    });

    expect(game.lastAction).toBeNull();

    game.avoidRoom();
    expect(game.lastAction?.actionType).toBe("skipRoom");

    game.undoAvoidRoom();
    expect(game.lastAction).toBeNull();
  });

  it("restores gameOver and victory flags on undo", () => {
    // Player will die from fighting monster barehanded
    const player = new Player(3, 20);
    const monster = new MonsterCard("clubs", 5);

    const game = createGameWithState({
      deck: [new MonsterCard("spades", 9), new MonsterCard("clubs", 10), new MonsterCard("spades", 11)],
      room: [monster, new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 2)],
      player,
      roomBeingEntered: true,
    });

    expect(game.gameOver).toBe(false);

    // Fighting barehanded: 3 - 5 = -2, triggers gameOver
    game.handleCardAction(monster, "barehanded");
    expect(game.gameOver).toBe(true);

    // Undo should clear gameOver
    game.undoHandleCardAction();
    expect(game.gameOver).toBe(false);
    expect(game.player.health).toBe(3);
  });
});

describe("undoHandleCardAction keeps weapon-fought monster out of discard", () => {
  it("does not add fought monster to discard, and undo preserves that", () => {
    const player = new Player(20, 20);
    player.equippedWeapon = new WeaponCard(10);
    const monster = new MonsterCard("clubs", 5);

    const game = createGameWithState({
      deck: [new MonsterCard("spades", 9), new MonsterCard("clubs", 10), new MonsterCard("spades", 11), new MonsterCard("clubs", 12)],
      room: [monster, new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 2)],
      player,
      roomBeingEntered: true,
    });

    game.handleCardAction(monster, "weapon");
    expect(game.discard.some((c) => c.type === "monster" && c.suit === "clubs" && c.rank === 5)).toBe(false);

    game.undoHandleCardAction();
    expect(game.discard.some((c) => c.type === "monster" && c.suit === "clubs" && c.rank === 5)).toBe(false);
  });
});

describe("Bug 2g: illegal weapon action must not resolve monster", () => {
  it("throws and preserves room/discard when weapon lock is violated", () => {
    const player = new Player(20, 20);
    player.equippedWeapon = new WeaponCard(10);
    player.lastMonsterDefeated = new MonsterCard("clubs", 6);

    const blockedMonster = new MonsterCard("spades", 7);
    const game = createGameWithState({
      deck: [new MonsterCard("clubs", 9), new MonsterCard("spades", 10), new MonsterCard("clubs", 11), new MonsterCard("spades", 12)],
      room: [blockedMonster, new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 2)],
      player,
      roomBeingEntered: true,
    });

    const roomSizeBefore = game.currentRoom.cards.length;
    const discardSizeBefore = game.discard.length;

    expect(() => game.handleCardAction(blockedMonster, "weapon")).toThrow("Illegal weapon action: monster exceeds weapon lock");
    expect(game.currentRoom.cards.length).toBe(roomSizeBefore);
    expect(game.currentRoom.cards.some((c) => c.type === "monster" && c.suit === "spades" && c.rank === 7)).toBe(true);
    expect(game.discard.length).toBe(discardSizeBefore);
  });
});
