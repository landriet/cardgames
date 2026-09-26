import { readFileSync } from "node:fs";
import { DEFAULT_GAME_VARIANT, Game, getGameVariant, MonsterCard, WeaponCard, PotionCard } from "./src/index";
import { solve, type SolveResult } from "./src/solver";

const MAX_SEED_ENTRIES = 10_000;

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

function readStringFlag(argv: string[], name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === name) {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${name} requires a value.`);
      return value;
    }
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return undefined;
}

function parseSeedList(seedList?: string, seedsFile?: string, seedRange?: string): number[] {
  const seeds: number[] = [];

  const addSeed = (value: string, source: string) => {
    const token = value.trim();
    if (!token) return;
    if (!/^-?\d+$/.test(token)) {
      throw new Error(`Invalid seed ${JSON.stringify(token)} in ${source}; seeds must be integers.`);
    }
    const seed = Number(token);
    if (!Number.isSafeInteger(seed)) throw new Error(`Seed ${JSON.stringify(token)} in ${source} is outside the safe integer range.`);
    if (seeds.length >= MAX_SEED_ENTRIES) {
      throw new Error(`At most ${MAX_SEED_ENTRIES} seed entries can be run at once.`);
    }
    seeds.push(seed);
  };

  if (seedList !== undefined) {
    for (const token of seedList.split(",")) addSeed(token, "--seed-list");
  }

  if (seedRange !== undefined) {
    const match = /^\s*(-?\d+)\s*-\s*(-?\d+)\s*$/.exec(seedRange);
    if (!match) throw new Error(`Invalid --seed-range ${JSON.stringify(seedRange)}; use START-END, for example 101-110.`);
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      throw new Error(`Invalid --seed-range ${JSON.stringify(seedRange)}; bounds must be safe integers.`);
    }
    if (start > end) throw new Error(`Invalid --seed-range ${JSON.stringify(seedRange)}; start must be <= end.`);
    const rangeSize = end - start + 1;
    if (!Number.isSafeInteger(rangeSize) || seeds.length + rangeSize > MAX_SEED_ENTRIES) {
      throw new Error(`A benchmark run can include at most ${MAX_SEED_ENTRIES} seed entries.`);
    }
    for (let seed = start; ; seed++) {
      seeds.push(seed);
      if (seed === end) break;
    }
  }

  if (seedsFile !== undefined) {
    for (const line of readFileSync(seedsFile, "utf8").split(/\r?\n/)) {
      const token = line.trim();
      if (!token || token.startsWith("#")) continue;
      addSeed(token, `--seeds-file ${seedsFile}`);
    }
  }

  return [...new Set(seeds)];
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

interface BenchmarkRun {
  seed?: number;
  size: number;
  timeMs: number;
  result: SolveResult;
}

function benchmarkAI(seed?: number, exhaustive = false, variantId: string = DEFAULT_GAME_VARIANT): BenchmarkRun {
  const deck = Game.createDeck(seed, variantId);
  const size = deck.length;
  const gameDeck = deck.map((card) => card.clone());
  const originalDeck = deck.map((card) => card.clone());
  const game = new Game(gameDeck, undefined, undefined, variantId);
  const start = performance.now();
  const result = solve(game, originalDeck, { exhaustive });
  const end = performance.now();
  const run = { seed, size, timeMs: end - start, result };
  const seedLabel = seed === undefined ? "random deck" : `seed ${seed}`;
  console.log(`[${seedLabel}] Deck size: ${size}, Time: ${run.timeMs.toFixed(2)}ms, Result:`, result);
  return run;
}

function main() {
  const args = process.argv.slice(2);
  const seed = readIntFlag(args, ["--seed", "-s"]);
  const seedList = readStringFlag(args, "--seed-list");
  const seedRange = readStringFlag(args, "--seed-range");
  const seedsFile = readStringFlag(args, "--seeds-file");
  if (seed !== undefined && (seedList !== undefined || seedRange !== undefined || seedsFile !== undefined)) {
    throw new Error("Use either --seed or --seed-list/--seed-range/--seeds-file, not both.");
  }
  const requestedSeeds = parseSeedList(seedList, seedsFile, seedRange);
  if ((seedList !== undefined || seedRange !== undefined || seedsFile !== undefined) && requestedSeeds.length === 0) {
    throw new Error("The seed list is empty; provide at least one integer seed.");
  }
  const seeds: Array<number | undefined> = requestedSeeds.length > 0 ? requestedSeeds : [seed];
  const variantId = readStringFlag(args, "--variant") ?? DEFAULT_GAME_VARIANT;
  const variant = getGameVariant(variantId);
  const exhaustive = args.includes("--exhaustive");
  console.log(`Variant: ${variant.name} (${variantId})`);
  if (requestedSeeds.length > 0) {
    console.log(`Seeds: ${requestedSeeds.join(", ")}`);
  } else if (seed !== undefined) {
    console.log(`Seed: ${seed}`);
  }
  if (exhaustive) {
    console.log("Mode: exhaustive");
  }

  const results = seeds.map((runSeed) => benchmarkAI(runSeed, exhaustive, variantId));
  if (results.length > 1) {
    console.log("\nSeed summary:");
    console.log("  Seed       Result  Score  Nodes       Time (ms)");
    for (const run of results) {
      console.log(
        `  ${String(run.seed).padEnd(10)} ${run.result.victory ? "WIN   " : "LOSS  "}  ${String(run.result.score).padEnd(5)}  ${String(run.result.nodesExplored).padEnd(10)} ${run.timeMs.toFixed(2)}`,
      );
    }
  }

  const failedSeeds = results.filter((run) => run.seed !== undefined && !run.result.victory).map((run) => run.seed);
  if (failedSeeds.length > 0) {
    console.error(`Solver lost on seed${failedSeeds.length === 1 ? "" : "s"}: ${failedSeeds.join(", ")}`);
    process.exitCode = 1;
  }
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
