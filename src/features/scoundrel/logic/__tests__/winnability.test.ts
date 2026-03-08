import { describe, expect, it } from "vitest";
import { initGame } from "../engineAdapter";
import { evaluateWinnability, getTerminalStatus } from "../winnability";

describe("winnability", () => {
  it("returns victory for terminal win state", () => {
    const state = { ...initGame({ deckSeed: 2 }), victory: true, gameOver: false };
    expect(getTerminalStatus(state)).toBe("victory");

    const result = evaluateWinnability(state);
    expect(result.status).toBe("victory");
    expect(result.nodesExplored).toBe(0);
  });

  it("returns defeat for terminal loss state", () => {
    const state = { ...initGame({ deckSeed: 2 }), victory: false, gameOver: true };
    expect(getTerminalStatus(state)).toBe("defeat");

    const result = evaluateWinnability(state);
    expect(result.status).toBe("defeat");
    expect(result.nodesExplored).toBe(0);
  });

  it("detects non-terminal winnable and not winnable seeded states", () => {
    const winnable = initGame({ deckSeed: 2 });
    const notWinnable = initGame({ deckSeed: 1 });

    expect(evaluateWinnability(winnable).status).toBe("winnable");
    expect(evaluateWinnability(notWinnable).status).toBe("not_winnable");
  });
});
