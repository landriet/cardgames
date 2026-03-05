import readline from "node:readline";
import { EngineWorkerService } from "./engineWorkerService";
import type { WorkerRequest, WorkerResponse } from "./protocol";

function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<WorkerRequest>;
  return typeof request.id === "string" && typeof request.method === "string";
}

function writeResponse(response: WorkerResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

const service = new EngineWorkerService();

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    writeResponse({
      id: "unknown",
      ok: false,
      error: { code: "BAD_JSON", message: "Could not parse request JSON." },
    });
    return;
  }

  if (!isWorkerRequest(parsed)) {
    writeResponse({
      id: "unknown",
      ok: false,
      error: { code: "BAD_REQUEST", message: "Invalid request envelope." },
    });
    return;
  }

  writeResponse(service.handleRequest(parsed));
});

rl.on("close", () => {
  process.exit(0);
});
