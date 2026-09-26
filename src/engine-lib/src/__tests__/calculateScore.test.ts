import { Game, MonsterCard, Player, PotionCard } from "../index";

describe("Game.calculateScore", () => {
  it("calculates a loss score without filtering the deck", () => {
    const game = new Game([]);
    game.player = new Player(12, 20);
    game.deck = [new MonsterCard("clubs", 8), new PotionCard(5), new MonsterCard("spades", 3)];
    game.victory = false;
    const filter = jest.spyOn(game.deck, "filter");

    expect(game.calculateScore()).toBe(1);
    expect(filter).not.toHaveBeenCalled();
  });
});
