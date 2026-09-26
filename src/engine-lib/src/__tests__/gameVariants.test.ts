import { Game, getGameVariant, mergeGameRules, MonsterCard, Player, WeaponCard } from "../index";

describe("shared game variants", () => {
  it("loads standard and additional-card variants from the shared registry", () => {
    expect(getGameVariant("standard").cards).toHaveLength(44);
    expect(getGameVariant("queen_hearts").cards).toHaveLength(45);
    expect(getGameVariant("jack_diamonds").cards).toHaveLength(45);
    expect(getGameVariant("strict_weapon_kill_limit").rules.weaponKillLimitStrict).toBe(true);
    expect(Game.createDeck(7, "queen_hearts")).toHaveLength(45);
    expect(Game.createDeck(7, "jack_diamonds")).toHaveLength(45);
  });

  it("strict weapon limit permits only monsters below the last weapon kill", () => {
    const player = new Player(20, 20);
    player.equippedWeapon = new WeaponCard(8);
    player.lastMonsterDefeated = new MonsterCard("clubs", 6);
    const game = new Game(undefined, player, undefined, "strict_weapon_kill_limit");
    const equalMonster = new MonsterCard("spades", 6);
    const lowerMonster = new MonsterCard("clubs", 5);
    const higherMonster = new MonsterCard("spades", 7);
    game.currentRoom.cards = [equalMonster, lowerMonster, higherMonster];
    game.roomBeingEntered = true;

    const weaponActions = game.getPossibleActions().filter((action) => action.mode === "weapon");

    expect(weaponActions.map((action) => action.card?.rank)).toEqual([5]);
    expect(() => game.handleCardAction(equalMonster, "weapon")).toThrow(/weapon lock/i);
  });

  it("rejects an unknown variant id", () => {
    expect(() => getGameVariant("not_a_variant")).toThrow(/unknown game variant/i);
  });

  it("merges health and rule overrides over standard defaults", () => {
    const game = new Game(undefined, undefined, { startingHealth: 26, maxHealth: 30, potionsPerRoom: 2 });

    expect(game.player.health).toBe(26);
    expect(game.player.maxHealth).toBe(30);
    expect(game.rules.potionsPerRoom).toBe(2);
  });

  it("does not let direct room avoidance bypass a disabled skip rule", () => {
    const game = new Game(Game.createDeck(7), new Player(20, 20), { canSkipRooms: false });
    const originalRoom = game.currentRoom.cards.slice();
    const originalDeck = game.deck.slice();

    game.avoidRoom();

    expect(game.currentRoom.cards).toEqual(originalRoom);
    expect(game.deck).toEqual(originalDeck);
  });

  it("allows consecutive room skips when the variant enables them", () => {
    const game = new Game(Game.createDeck(7), new Player(20, 20), { canSkipConsecutive: true });
    const originalRoom = game.currentRoom.cards.slice();
    game.lastActionWasDefer = true;

    game.avoidRoom();

    expect(game.currentRoom.cards).not.toEqual(originalRoom);
  });

  it("allows another skip after a skip when consecutive skips are enabled", () => {
    const game = new Game(Game.createDeck(7), new Player(20, 20), { canSkipConsecutive: true });
    game.avoidRoom();

    expect(game.getPossibleActions().some((action) => action.actionType === "skipRoom")).toBe(true);
  });

  it("rejects unsupported rule keys instead of silently ignoring them", () => {
    const defaults = getGameVariant("standard").rules;

    expect(() => mergeGameRules(defaults, { extraPotionRule: true } as never)).toThrow(/unsupported.*rule/i);
    expect(() => mergeGameRules({ ...defaults, extraPotionRule: true } as never)).toThrow(/unsupported.*rule/i);
  });
});
