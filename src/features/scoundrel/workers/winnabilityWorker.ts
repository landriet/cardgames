/// <reference lib="webworker" />

import type { SolverRequest, SolverResponse } from "../logic/winnability.ts";
import { evaluateWinnability } from "../logic/winnability.ts";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<SolverRequest>) => {
  const { requestId, gameState } = event.data;
  const evaluation = evaluateWinnability(gameState);

  const response: SolverResponse = {
    requestId,
    ...evaluation,
  };

  workerScope.postMessage(response);
};

export {};
