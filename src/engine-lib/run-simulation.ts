import * as fs from "fs";
import { RuleConfig, GameAction, DungeonCard } from "./src/index";
import { runSimulation, SimulationResult } from "./src/simulation";

const DEFAULT_NODE_LIMIT = 5_000_000;

function parseArgs(argv: string[]): {
  configs: Array<{ name: string; rules: RuleConfig }>;
  games: number;
  trace: boolean;
  nodeLimit: number;
} {
  const args = argv.slice(2);
  let games = 1000;
  let configPath: string | undefined;
  let trace = false;
  let nodeLimit = DEFAULT_NODE_LIMIT;
  const rules: RuleConfig = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--games":
        games = parseInt(args[++i], 10);
        break;
      case "--health": {
        const hp = parseInt(args[++i], 10);
        rules.startingHealth = hp;
        if (rules.maxHealth === undefined) rules.maxHealth = hp;
        break;
      }
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
      case "--trace":
        trace = true;
        break;
      case "--node-limit":
        nodeLimit = parseInt(args[++i], 10);
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
        trace,
        nodeLimit,
      };
    }
    return { games, configs: [{ name: configPath, rules: parsed }], trace, nodeLimit };
  }

  const hasCustomRules = Object.keys(rules).length > 0;
  const configs = [{ name: hasCustomRules ? "Custom" : "Default", rules }];

  return { games, configs, trace, nodeLimit };
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

function formatAction(action: GameAction): string {
  if (action.actionType !== "playCard") return action.actionType;
  const card = action.card ? formatCard(action.card) : "unknown-card";
  if (action.card?.type === "monster") {
    return `${action.actionType} ${card} (${action.mode ?? "barehanded"})`;
  }
  return `${action.actionType} ${card}`;
}

function formatCard(card: DungeonCard): string {
  return `${card.type}-${card.suit}-${card.rank}`;
}

function main(): void {
  const { configs, games, trace, nodeLimit } = parseArgs(process.argv);

  console.log(`Scoundrel Optimal Solver — Difficulty Analysis`);
  console.log(`Running ${games} games per rule set...`);
  console.log(`Node limit per game: ${nodeLimit.toLocaleString()}`);
  if (trace) {
    console.log(`Trace mode enabled: printing each game step.`);
  }

  const results: Array<{ name: string; result: SimulationResult }> = [];

  for (const { name, rules } of configs) {
    const start = Date.now();
    const result = runSimulation(rules, games, {
      trace,
      nodeLimit,
      onGameComplete: trace
        ? ({ gameNumber, result: gameResult }) => {
            console.log(`\n[${name}] Game ${gameNumber}`);
            if (!gameResult.trace || gameResult.trace.length === 0) {
              console.log(`  No trace steps recorded.`);
            } else {
              for (const step of gameResult.trace) {
                console.log(
                  `  Step ${step.step}: ${formatAction(step.action)} | HP ${step.healthBefore}->${step.healthAfter} | Deck ${step.deckBefore}->${step.deckAfter}`,
                );
                console.log(`           Room: [${step.roomBefore.join(", ")}] -> [${step.roomAfter.join(", ")}]`);
                console.log(`           Score: ${step.scoreAfter} | gameOver=${step.gameOver} victory=${step.victory}`);
              }
            }
            console.log(
              `  Final: victory=${gameResult.victory} score=${gameResult.score} nodesExplored=${gameResult.nodesExplored} steps=${gameResult.trace?.length ?? 0}`,
            );
          }
        : undefined,
    });
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
