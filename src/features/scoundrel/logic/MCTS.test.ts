// MCTS.test.ts
// Simple test/demo for Scoundrel MCTS AI
import { MCTS } from "./MCTS.ts";
import { ScoundrelMCTSGame } from "./ScoundrelMCTSGame.ts";
import { initGame } from "./engine.ts";

function runAIGameDemo(iterations = 1000) {
  let state = initGame();
  const gameAdapter = new ScoundrelMCTSGame(state);
  const mcts = new MCTS(gameAdapter, iterations);
  let turn = 0;
  while (!gameAdapter.gameOver(state)) {
    turn++;
    const move = mcts.selectMove();
    state = gameAdapter.playMove(state, move);
    gameAdapter.setState(state);
    console.log(`Turn ${turn}: AI chose card ${move.card.type} (rank ${move.card.rank})${move.mode ? ", mode: " + move.mode : ""}`);
    if (state.gameOver) {
      console.log("Game Over! Score:", state.score);
      break;
    }
    if (state.victory) {
      console.log("Victory! Final health:", state.health);
      break;
    }
  }
}

// Run demo with default iterations
runAIGameDemo();

// Export for test runners
export { runAIGameDemo };
