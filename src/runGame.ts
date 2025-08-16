import { initGame, handleCardAction, avoidRoom, simulateCardActionHealth } from "./features/scoundrel/logic/engine.ts";
import * as ScoundrelTypes from "./types/scoundrel.ts";

// --- Q-learning agent ---
type QKey = string; // Discretized state-action key
const Q: Map<QKey, number> = new Map();
// Expanded actions: avoidRoom, playCard (index, mode)
type AgentAction = { type: "avoidRoom" } | { type: "playCard"; cardIdx: number; mode?: "barehanded" | "weapon" };

function getValidActions(state: ScoundrelTypes.ScoundrelGameState): AgentAction[] {
  const actions: AgentAction[] = [];
  if (state.canDeferRoom) actions.push({ type: "avoidRoom" });
  // For each card in the room, add only valid playCard actions
  state.currentRoom.cards.forEach((card, idx) => {
    if (card.type === "monster") {
      // Barehanded is always valid
      actions.push({ type: "playCard", cardIdx: idx, mode: "barehanded" });
      // Weapon: only valid if simulateCardActionHealth changes health
      if (state.equippedWeapon) {
        // Weapon kill limit: can only be used on monsters <= last monster it killed (if any)
        const lastDefeated = state.lastMonsterDefeated;
        if (!lastDefeated || card.rank <= lastDefeated.rank) {
          actions.push({ type: "playCard", cardIdx: idx, mode: "weapon" });
        }
      }
    } else {
      // Non-monster cards: always valid
      actions.push({ type: "playCard", cardIdx: idx });
    }
  });
  return actions;
}
const alpha = 0.1; // learning rate
const gamma = 0.95; // discount factor
const epsilon = 0.2; // exploration rate

function discretizeState(state: ScoundrelTypes.ScoundrelGameState): string {
  // More detailed: health, equippedWeapon rank, room card types/ranks
  const health = Math.floor(state.health / 5) * 5;
  const weapon = state.equippedWeapon ? state.equippedWeapon.rank : 0;
  const room = state.currentRoom.cards.map((c) => `${c.type[0]}${c.rank}`).join("");
  return `${health}|${weapon}|${room}`;
}

function chooseAction(state: ScoundrelTypes.ScoundrelGameState): AgentAction {
  const validActions = getValidActions(state);
  if (Math.random() < epsilon) {
    return validActions[Math.floor(Math.random() * validActions.length)];
  }
  const s = discretizeState(state);
  let bestAction = validActions[0];
  let bestQ = -Infinity;
  for (const a of validActions) {
    const key = `${s}|${JSON.stringify(a)}`;
    const q = Q.get(key) ?? 0;
    if (q > bestQ) {
      bestQ = q;
      bestAction = a;
    }
  }
  return bestAction;
}

function qlStep(state: ScoundrelTypes.ScoundrelGameState, action: AgentAction) {
  let nextState = state;
  let reward = 0;
  // Survival reward: small positive reward for each step survived
  reward += 0.05;
  if (action.type === "avoidRoom" && state.canDeferRoom) {
    nextState = avoidRoom(state);
  } else if (action.type === "playCard") {
    const card = state.currentRoom.cards[action.cardIdx];
    if (card.type === "monster" && action.mode) {
      nextState = handleCardAction(state, card, action.mode);
    } else {
      nextState = handleCardAction(state, card);
    }
  }
  // Health change
  reward += (nextState.health - state.health) * 0.2; // larger penalty for losing health
  // Monster defeated, potion/weapon taken (only for playCard actions)
  if (action.type === "playCard" && state.currentRoom.cards.length > nextState.currentRoom.cards.length) {
    const playedCard = state.currentRoom.cards[action.cardIdx];
    if (playedCard && playedCard.type === "monster") reward += 1.0; // bigger reward
    if (playedCard && playedCard.type === "potion") reward += 0.3;
    if (playedCard && playedCard.type === "weapon") reward += 0.3;
  }
  // Room cleared: reward for clearing all cards from a room
  if (state.currentRoom.cards.length > 0 && nextState.currentRoom.cards.length === 0) {
    reward += 0.5;
  }
  // Victory/game over
  if (nextState.victory) reward += 2;
  else if (nextState.gameOver) reward -= 2;
  return { nextState, reward, done: nextState.gameOver || nextState.victory };
}

function trainQL(numEpisodes = 10000) {
  for (let ep = 0; ep < numEpisodes; ep++) {
    let state = initGame();
    let done = false;
    let steps = 0;
    while (!done && steps < 100) {
      const s = discretizeState(state);
      const action = chooseAction(state);
      const { nextState, reward, done: d } = qlStep(state, action);
      const sNext = discretizeState(nextState);
      const validNextActions = getValidActions(nextState);
      // Q-learning update
      const qKey = `${s}|${JSON.stringify(action)}`;
      const qNext = validNextActions.length > 0 ? Math.max(...validNextActions.map((a) => Q.get(`${sNext}|${JSON.stringify(a)}`) ?? 0)) : 0;
      const oldQ = Q.get(qKey) ?? 0;
      const newQ = oldQ + alpha * (reward + gamma * qNext - oldQ);
      Q.set(qKey, newQ);
      state = nextState;
      done = d;
      steps++;
    }
  }
  console.log(`Q-learning training complete. Q-table size: ${Q.size}`);
  // Print sample Q-values
  for (const [key, value] of Array.from(Q.entries()).slice(0, 5)) {
    console.log(key, value);
  }
}

// Run Q-learning training
trainQL(50000);

// Evaluate trained agent
function evaluateQLAgent(numEpisodes = 50) {
  let wins = 0;
  let totalScore = 0;
  for (let ep = 0; ep < numEpisodes; ep++) {
    let state = initGame();
    let done = false;
    let steps = 0;
    while (!done && steps < 100) {
      const s = discretizeState(state);
      const validActions = getValidActions(state);
      // Always choose best action (no exploration)
      let bestAction = validActions[0];
      let bestQ = -Infinity;
      for (const a of validActions) {
        const key = `${s}|${JSON.stringify(a)}`;
        const q = Q.get(key) ?? 0;
        if (q > bestQ) {
          bestQ = q;
          bestAction = a;
        }
      }
      const { nextState, done: d } = qlStep(state, bestAction);
      state = nextState;
      done = d;
      steps++;
    }
    if (state.victory) wins++;
    totalScore += state.score ?? 0;
  }
  console.log(`Evaluation: Win rate ${((wins / numEpisodes) * 100).toFixed(1)}%, Avg score ${(totalScore / numEpisodes).toFixed(2)}`);
}

// Run evaluation
evaluateQLAgent(50);
