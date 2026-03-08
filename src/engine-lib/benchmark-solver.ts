import { Game, MonsterCard, WeaponCard, PotionCard } from "./src/index";
import { solve } from "./src/solver";

function readIntFlag(argv: string[], names: string[]): number | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    for (const name of names) {
      if (arg === name) {
        const value = argv[i + 1];
        if (value === undefined) return undefined;
        const parsed = parseInt(value, 10);
        return Number.isInteger(parsed) ? parsed : undefined;
      }
      if (arg.startsWith(`${name}=`)) {
        const parsed = parseInt(arg.slice(name.length + 1), 10);
        return Number.isInteger(parsed) ? parsed : undefined;
      }
    }
  }
  return undefined;
}

function buildStaticDeck(): Array<MonsterCard | WeaponCard | PotionCard> {
  // 7 monsters, 7 weapons, 6 potions
  const deck = [
    new MonsterCard("clubs", 10),
    new WeaponCard(8),
    new MonsterCard("clubs", 9),
    new PotionCard(2),
    new MonsterCard("spades", 3),
    new MonsterCard("spades", 5),
    new MonsterCard("spades", 6),
    new PotionCard(5),
    new WeaponCard(2),
    new WeaponCard(3),
    new MonsterCard("spades", 7),
    new WeaponCard(5),
    new MonsterCard("clubs", 4),
    new MonsterCard("spades", 10),
    new MonsterCard("spades", 7),
    new PotionCard(2),
    new WeaponCard(5),
    new MonsterCard("clubs", 3),
  ];
  return deck;
}

function benchmarkAI(minSize = 7, maxSize = 20, seed?: number) {
  const deck = typeof seed === "number" && Number.isInteger(seed) ? Game.createDeck(seed) : Game.createDeck();
  const results: Array<{ size: number; timeMs: number; result: any }> = [];
  for (let size = minSize; size <= maxSize; size++) {
    const slicedDeck = deck.slice(0, size);
    const gameDeck = slicedDeck.map((card) => card.clone());
    const originalDeck = slicedDeck.map((card) => card.clone());
    const game = new Game(gameDeck);
    const start = performance.now();
    const result = solve(game, originalDeck);
    const end = performance.now();
    results.push({ size, timeMs: end - start, result });
    console.log(`Deck size: ${size}, Time: ${(end - start).toFixed(2)}ms, Result:`, result);
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  const seed = readIntFlag(args, ["--seed", "-s"]);
  if (seed !== undefined) {
    console.log(`Seed: ${seed}`);
  }
  benchmarkAI(26, 26, seed);
}

//try with static deck
function mainStaticDeck(seed?: number) {
  const deck = typeof seed === "number" && Number.isInteger(seed) ? Game.createDeck(seed).slice(0, 18) : buildStaticDeck();
  const game = new Game(deck);
  const start = performance.now();
  const result = solve(game, deck);
  const end = performance.now();
  console.log(`Static Deck Size: ${deck.length}, Time: ${(end - start).toFixed(2)}ms`);
  console.log("Victory:", result.victory);
  console.log("Score:", result.score);
  console.log("Nodes explored:", result.nodesExplored);
}
console.debug = () => {};
main();
