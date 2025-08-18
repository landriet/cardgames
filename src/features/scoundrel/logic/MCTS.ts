/**
 * Pretty-print an MCTSNode for readable console logging.
 */
export function printMCTSNode<State, Move>(
  node: MCTSNode<State, Move>,
  options?: { showChildren?: boolean; maxChildren?: number; showState?: boolean },
) {
  const { showChildren = true, maxChildren = 5, showState = false } = options || {};
  const summary: any = {
    move: node.move,
    nPlays: node.nPlays,
    totalScore: node.totalScore,
    averageScore: node.averageScore,
    unexpandedMoves: node.unexpandedMoves.length,
    children: node.children.size,
  };
  if (showState) {
    summary.state = node.state;
  }
  if (showChildren && node.children.size > 0) {
    summary.childMoves = Array.from(node.children.values())
      .slice(0, maxChildren)
      .map((child) => {
        let moveStr: string;
        try {
          moveStr = JSON.stringify(child.move);
        } catch {
          moveStr = String(child.move);
        }
        // Truncate long move strings for readability
        if (moveStr.length > 80) {
          moveStr = moveStr.slice(0, 77) + "...";
        }
        return {
          move: moveStr,
          nPlays: child.nPlays,
          averageScore: child.averageScore,
        };
      });
    if (node.children.size > maxChildren) {
      summary.childMoves.push({ more: `${node.children.size - maxChildren} more...` });
    }
  }
  console.log("MCTSNode:", summary);
}
// MCTS.ts
// Simple, reusable Monte Carlo Tree Search implementation for TypeScript
// Integrate with your game logic by implementing the required Game interface

export interface Game<State, Move> {
  getState(): State;
  setState(state: State): void;
  cloneState(state: State): State;
  moves(state: State): Move[];
  playMove(state: State, move: Move): State;
  gameOver(state: State): boolean;
  winner(state: State): number | null; // 1, -1, or 0 for draw
  score(state: State): number; // Numeric evaluation of the state
}

export class MCTSNode<State, Move> {
  state: State;
  parent: MCTSNode<State, Move> | null;
  children: Map<string, MCTSNode<State, Move>> = new Map();
  move: Move | null;
  nPlays = 0;
  nWins = 0;
  totalScore = 0;
  averageScore = 0;
  unexpandedMoves: Move[];

  constructor(state: State, parent: MCTSNode<State, Move> | null, move: Move | null, unexpandedMoves: Move[]) {
    this.state = state;
    this.parent = parent;
    this.move = move;
    this.unexpandedMoves = [...unexpandedMoves];
  }
}

export class MCTS<State, Move> {
  game: Game<State, Move>;
  root: MCTSNode<State, Move>;
  iterations: number;
  exploration: number;

  constructor(game: Game<State, Move>, iterations = 1000, exploration = Math.SQRT2) {
    this.game = game;
    const state = game.getState();
    this.root = new MCTSNode(state, null, null, game.moves(state));
    this.iterations = iterations;
    this.exploration = exploration;
  }

  /**
   * Log the root node in a readable format.
   */
  logRoot(options?: { showChildren?: boolean; maxChildren?: number; showState?: boolean }) {
    printMCTSNode(this.root, options);
  }

  /**
   * Call this after making a move in the real game to update the MCTS tree.
   * If the move exists as a child, reuse the subtree. Otherwise, reinitialize root.
   */
  advanceRoot(move: Move, newState: State) {
    const moveKey = JSON.stringify(move);
    const child = this.root.children.get(moveKey);
    if (child) {
      // Reuse subtree
      child.parent = null;
      this.root = child;
    } else {
      // Reinitialize root
      this.root = new MCTSNode(newState, null, null, this.game.moves(newState));
    }
    this.game.setState(newState);
  }

  /**
   * Selects the best move from the current root node using Monte Carlo Tree Search (MCTS).
   * Runs the search algorithm for a specified number of iterations, then chooses the child node
   * with the highest visit count (robust child) as the best move.
   *
   * @returns {Move} The move associated with the most visited child node.
   * @throws {Error} If no valid move is found among the root's children.
   */
  selectMove(): Move {
    for (let i = 0; i < this.iterations; i++) {
      this.runSearch();
    }
    // Choose child with most visits (robust child)
    let best: MCTSNode<State, Move> | null = null;
    let maxPlays = -Infinity;
    for (const child of this.root.children.values()) {
      if (child.nPlays > maxPlays) {
        best = child;
        maxPlays = child.nPlays;
      }
    }
    if (!best || !best.move) throw new Error("No valid move found");
    return best.move;
  }

  private runSearch() {
    // 1. Selection
    let node = this.root;
    while (node.unexpandedMoves.length === 0 && node.children.size > 0 && !this.game.gameOver(node.state)) {
      node = this.bestUCBChild(node);
    }
    // 2. Expansion
    if (node.unexpandedMoves.length > 0 && !this.game.gameOver(node.state)) {
      const move = node.unexpandedMoves.pop()!;
      const nextState = this.game.playMove(node.state, move);
      const child = new MCTSNode(nextState, node, move, this.game.moves(nextState));
      node.children.set(JSON.stringify(move), child);
      node = child;
    }
    // 3. Simulation
    let simState = node.state;
    while (!this.game.gameOver(simState)) {
      const moves = this.game.moves(simState);
      const move = moves[Math.floor(Math.random() * moves.length)];
      simState = this.game.playMove(simState, move);
    }
    const score = this.game.score(simState);
    // 4. Backpropagation
    let backNode: MCTSNode<State, Move> | null = node;
    while (backNode !== null) {
      backNode.nPlays++;
      backNode.totalScore += score;
      backNode.averageScore = backNode.totalScore / backNode.nPlays;
      backNode = backNode.parent;
    }
  }

  private bestUCBChild(node: MCTSNode<State, Move>): MCTSNode<State, Move> {
    let best: MCTSNode<State, Move> | null = null;
    let bestUCB = -Infinity;
    for (const child of node.children.values()) {
      const ucb = this.ucb1(child, node.nPlays);
      if (ucb > bestUCB) {
        bestUCB = ucb;
        best = child;
      }
    }
    if (!best) throw new Error("No children for UCB selection");
    return best;
  }

  private ucb1(node: MCTSNode<State, Move>, parentPlays: number): number {
    if (node.nPlays === 0) return Infinity;
    return node.averageScore + this.exploration * Math.sqrt(Math.log(parentPlays) / node.nPlays);
  }
}
