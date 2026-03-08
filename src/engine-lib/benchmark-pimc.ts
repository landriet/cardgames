import { runPimcGame, PimcGameResult, ActionStats } from "./src/pimc";
import { GameAction } from "./src/index";

console.debug = () => {};

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

const verbose = process.argv.includes("-v") || process.argv.includes("--verbose");
const args = process.argv.slice(2);
const seed = readIntFlag(args, ["--seed", "-s"]);
const positionalArgs: string[] = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--seed" || arg === "-s") {
    i++;
    continue;
  }
  if (arg.startsWith("--seed=") || arg.startsWith("-s=") || arg === "--verbose" || arg === "-v") {
    continue;
  }
  if (!arg.startsWith("-")) {
    positionalArgs.push(arg);
  }
}
const numGames = parseInt(positionalArgs[0] ?? "10", 10);
const numSamples = parseInt(positionalArgs[1] ?? "50", 10);

function formatAction(action: GameAction): string {
  if (action.actionType === "enterRoom") return "Enter room";
  if (action.actionType === "skipRoom") return "Skip room";
  if (action.actionType === "playCard" && action.card) {
    const card = `${action.card.suit} ${action.card.rank}`;
    if (action.card.type === "monster") return `Fight ${card} (${action.mode})`;
    if (action.card.type === "weapon") return `Equip ${card}`;
    if (action.card.type === "potion") return `Drink ${card}`;
  }
  return action.actionType;
}

function formatStats(stats: ActionStats[]): string {
  return stats.map((s) => `    ${formatAction(s.action).padEnd(30)} avg=${s.avgScore.toFixed(1).padStart(6)} wins=${s.wins}`).join("\n");
}

console.log(`PIMC Simulation: ${numGames} games, ${numSamples} samples per decision`);
if (seed !== undefined) {
  console.log(`Seed: ${seed}`);
}
console.log("---");

const startTotal = performance.now();
const results: PimcGameResult[] = [];

for (let i = 0; i < numGames; i++) {
  const startGame = performance.now();
  const gameSeed = seed !== undefined ? seed + i : undefined;
  const result = runPimcGame(numSamples, undefined, undefined, gameSeed);
  const elapsed = performance.now() - startGame;
  results.push(result);

  console.log(
    `Game ${i + 1}: ${result.victory ? "WIN" : "LOSS"} | ` +
      `Score: ${result.score} | HP: ${result.health} | ` +
      `Moves: ${result.moves.length} | Time: ${(elapsed / 1000).toFixed(1)}s`,
  );

  if (verbose) {
    for (let m = 0; m < result.moves.length; m++) {
      const move = result.moves[m];
      const chosen = formatAction(move.action);
      if (move.stats.length <= 1) {
        console.log(`  ${String(m + 1).padStart(3)}. ${chosen}`);
      } else {
        console.log(`  ${String(m + 1).padStart(3)}. ${chosen}  [${move.stats.length} options]`);
        console.log(formatStats(move.stats));
      }
    }
    console.log();
  }
}

const totalElapsed = performance.now() - startTotal;
const wins = results.filter((r) => r.victory).length;
const scores = results.map((r) => r.score).sort((a, b) => a - b);
const avgScore = scores.reduce((s, v) => s + v, 0) / numGames;
const medianScore = numGames % 2 === 0 ? (scores[numGames / 2 - 1] + scores[numGames / 2]) / 2 : scores[Math.floor(numGames / 2)];

console.log("---");
console.log(`Win Rate: ${((wins / numGames) * 100).toFixed(1)}%`);
console.log(`Avg Score: ${avgScore.toFixed(1)}`);
console.log(`Median Score: ${medianScore.toFixed(1)}`);
console.log(`Total Time: ${(totalElapsed / 1000).toFixed(1)}s`);
