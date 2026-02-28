import * as fs from "fs";
import { RuleConfig } from "./src/index";
import { runSimulation, SimulationResult } from "./src/simulation";

function parseArgs(argv: string[]): { configs: Array<{ name: string; rules: RuleConfig }>; games: number } {
  const args = argv.slice(2);
  let games = 1000;
  let configPath: string | undefined;
  const rules: RuleConfig = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--games":
        games = parseInt(args[++i], 10);
        break;
      case "--health":
        rules.startingHealth = parseInt(args[++i], 10);
        break;
      case "--max-health":
        rules.maxHealth = parseInt(args[++i], 10);
        break;
      case "--potions-per-room":
        rules.potionsPerRoom = parseInt(args[++i], 10);
        break;
      case "--no-skip":
        rules.canSkipRooms = false;
        break;
      case "--skip-consecutive":
        rules.canSkipConsecutive = true;
        break;
      case "--no-weapon-limit":
        rules.weaponKillLimit = false;
        break;
      case "--config":
        configPath = args[++i];
        break;
    }
  }

  if (configPath) {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        games,
        configs: parsed.map((entry: { name?: string } & RuleConfig) => ({
          name: entry.name || "Custom",
          rules: entry,
        })),
      };
    }
    return { games, configs: [{ name: configPath, rules: parsed }] };
  }

  const hasCustomRules = Object.keys(rules).length > 0;
  const configs = [{ name: hasCustomRules ? "Custom" : "Default", rules }];

  return { games, configs };
}

function formatResult(name: string, result: SimulationResult): string {
  const lines: string[] = [];
  lines.push(`\n${"=".repeat(50)}`);
  lines.push(`  ${name}`);
  lines.push(`${"=".repeat(50)}`);
  lines.push(`  Games played:      ${result.totalGames}`);
  lines.push(`  Win rate:          ${result.winRate.toFixed(1)}%`);
  lines.push(`  Avg score:         ${result.avgScore.toFixed(2)}`);
  lines.push(`  Median score:      ${result.medianScore}`);
  lines.push(`  Score range:       ${Math.min(...result.scoreDistribution)} to ${Math.max(...result.scoreDistribution)}`);
  lines.push(`  Avg nodes/game:    ${result.avgNodesExplored.toFixed(0)}`);

  // Score histogram
  const buckets = new Map<number, number>();
  for (const score of result.scoreDistribution) {
    const bucket = Math.floor(score / 5) * 5;
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }
  const sortedBuckets = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  const maxCount = Math.max(...sortedBuckets.map(([, c]) => c));

  lines.push(`\n  Score distribution:`);
  for (const [bucket, count] of sortedBuckets) {
    const bar = "█".repeat(Math.round((count / maxCount) * 30));
    const label = `${bucket >= 0 ? " " : ""}${bucket}..${bucket + 4}`;
    lines.push(`  ${label.padStart(8)} | ${bar} ${count}`);
  }

  return lines.join("\n");
}

function main(): void {
  const { configs, games } = parseArgs(process.argv);

  console.log(`Scoundrel Optimal Solver — Difficulty Analysis`);
  console.log(`Running ${games} games per rule set...`);

  const results: Array<{ name: string; result: SimulationResult }> = [];

  for (const { name, rules } of configs) {
    const start = Date.now();
    const result = runSimulation(rules, games);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(formatResult(name, result));
    console.log(`  Time:              ${elapsed}s`);
    results.push({ name, result });
  }

  if (results.length > 1) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`  Comparison`);
    console.log(`${"=".repeat(50)}`);
    console.log(`  ${"Rule Set".padEnd(20)} ${"Win%".padStart(8)} ${"Avg".padStart(8)} ${"Median".padStart(8)}`);
    console.log(`  ${"-".repeat(44)}`);
    for (const { name, result } of results) {
      console.log(
        `  ${name.padEnd(20)} ${result.winRate.toFixed(1).padStart(7)}% ${result.avgScore.toFixed(2).padStart(8)} ${String(result.medianScore).padStart(8)}`,
      );
    }
  }
}

main();
