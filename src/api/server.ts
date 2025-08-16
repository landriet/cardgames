import express from "express";
import { v4 as uuidv4 } from "uuid";
import { initGame, avoidRoom, enterRoom, handleCardAction } from "../features/scoundrel/logic/engine.ts";

// Simple in-memory session store
type SessionStore = { [sessionId: string]: import("../types/scoundrel").ScoundrelGameState };
const sessions: SessionStore = {};

const app = express();
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Start a new game
app.post("/api/game/start", (req, res) => {
  const sessionId = uuidv4();
  const state = initGame();
  sessions[sessionId] = state;
  res.json({ sessionId, state });
});

// Get current game state
app.get("/api/game/state/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const state = sessions[sessionId];
  if (!state) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json({ state });
});

// Avoid room
app.post("/api/game/avoid-room/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const state = sessions[sessionId];
  if (!state) return res.status(404).json({ error: "Session not found" });
  const newState = avoidRoom(state);
  sessions[sessionId] = newState;
  res.json({ state: newState });
});

// Enter room
app.post("/api/game/enter-room/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const state = sessions[sessionId];
  if (!state) return res.status(404).json({ error: "Session not found" });
  const newState = enterRoom(state);
  sessions[sessionId] = newState;
  res.json({ state: newState });
});

// Act on a card
app.post("/api/game/act/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const { cardIdx, mode } = req.body;
  const state = sessions[sessionId];
  if (!state) return res.status(404).json({ error: "Session not found" });
  const card = state.currentRoom.cards[cardIdx];
  if (!card) return res.status(400).json({ error: "Invalid card index" });
  let newState;
  if (card.type === "monster") {
    newState = handleCardAction(state, card, mode);
  } else {
    newState = handleCardAction(state, card);
  }
  sessions[sessionId] = newState;
  res.json({ state: newState });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
