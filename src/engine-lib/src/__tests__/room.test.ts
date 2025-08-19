import { Room, MonsterCard, WeaponCard } from "../index";

describe("Room", () => {
  it("initializes with cards", () => {
    const card1 = new MonsterCard("clubs", 5);
    const card2 = new WeaponCard("diamonds", 7);
    const room = new Room([card1, card2]);
    expect(room.cards).toEqual([card1, card2]);
    expect(room.isEmpty()).toBe(false);
  });

  it("removes a card from the room", () => {
    const card2 = new WeaponCard("diamonds", 7);
    const room = new Room([new MonsterCard("clubs", 5), card2]);
    room.removeCard(new MonsterCard("clubs", 5));
    expect(room.cards).toEqual([card2]);
  });

  it("throws error if card not found", () => {
    const card1 = new MonsterCard("clubs", 5);
    const card2 = new WeaponCard("diamonds", 7);
    const room = new Room([card1]);
    expect(() => room.removeCard(card2)).toThrow("Card not found in room");
  });

  it("isEmpty returns true when no cards", () => {
    const room = new Room([]);
    expect(room.isEmpty()).toBe(true);
  });
});
