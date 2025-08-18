// MCTS.test.ts
// Simple test/demo for Scoundrel MCTS AI
import { scoundrelGameStateToString } from "../../../utils/scoundrelGameStateToString.ts";
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
    console.log(`Turn ${turn}: AI selected move`, move);
    console.log("Current state:", scoundrelGameStateToString(state));
    const newState = gameAdapter.playMove(state, move);
    console.log("New state:", scoundrelGameStateToString(newState));
    gameAdapter.setState(newState);
    mcts.advanceRoot(move, newState); // Advance MCTS tree to new state
    state = newState;
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
