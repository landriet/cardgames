import { describe, expect, it } from "vitest";
import { EngineWorkerService } from "../engineWorkerService";
import type { WorkerRequest } from "../protocol";

function request(method: WorkerRequest["method"], params?: Record<string, unknown>): WorkerRequest {
  return {
    id: `${method}-id`,
    method,
    params,
  };
}

describe("EngineWorkerService", () => {
  it("creates session and returns possible actions", () => {
    const service = new EngineWorkerService();
    const response = service.handleRequest(request("create_session"));

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.result).toHaveProperty("sessionId");
    expect(response.result).toHaveProperty("state");
    expect(response.result).toHaveProperty("possibleActions");
  });

  it("steps a legal action", () => {
    const service = new EngineWorkerService();
    const created = service.handleRequest(request("create_session"));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { sessionId, possibleActions } = created.result as Extract<typeof created.result, { sessionId: string }>;
    const legalAction = possibleActions[0];
    expect(legalAction).toBeDefined();

    const stepped = service.handleRequest(
      request("step_action", {
        sessionId,
        action: legalAction,
      }),
    );

    expect(stepped.ok).toBe(true);
    if (!stepped.ok) return;
    expect(stepped.result).toHaveProperty("state");
  });

  it("rejects illegal action", () => {
    const service = new EngineWorkerService();
    const created = service.handleRequest(request("create_session"));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { sessionId } = created.result as Extract<typeof created.result, { sessionId: string }>;

    const invalid = service.handleRequest(
      request("step_action", {
        sessionId,
        action: {
          actionType: "playCard",
          cardIdx: 99,
          mode: "weapon",
        },
      }),
    );

    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.error.message).toContain("Illegal action");
  });

  it("closes a session", () => {
    const service = new EngineWorkerService();
    const created = service.handleRequest(request("create_session"));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { sessionId } = created.result as Extract<typeof created.result, { sessionId: string }>;

    const closed = service.handleRequest(request("close_session", { sessionId }));
    expect(closed.ok).toBe(true);

    const readAfterClose = service.handleRequest(request("get_state", { sessionId }));
    expect(readAfterClose.ok).toBe(false);
  });

  it("creates identical initial states for the same deckSeed", () => {
    const service = new EngineWorkerService();
    const seed = 12345;
    const first = service.handleRequest(request("create_session", { deckSeed: seed }));
    const second = service.handleRequest(request("create_session", { deckSeed: seed }));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const firstState = (first.result as Extract<typeof first.result, { state: unknown }>).state;
    const secondState = (second.result as Extract<typeof second.result, { state: unknown }>).state;
    expect(firstState.currentRoom.cards).toEqual(secondState.currentRoom.cards);
    expect(firstState.deck).toEqual(secondState.deck);
  });
});
