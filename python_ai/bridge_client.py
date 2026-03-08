from __future__ import annotations

import json
import subprocess
import warnings
from pathlib import Path
from typing import Any, Dict, List, Optional

MAX_WORKER_RETRIES = 2


class EngineWorkerClient:
    def __init__(
        self,
        command: Optional[List[str]] = None,
        cwd: Optional[Path] = None,
    ) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        self._cwd = cwd or repo_root
        self._command = command or ["npx", "tsx", "src/engine-lib/worker/engineWorker.ts"]
        self._process: Optional[subprocess.Popen[str]] = None
        self._next_request_id = 1

    def start(self) -> None:
        if self._process and self._process.poll() is None:
            return

        self._process = subprocess.Popen(
            self._command,
            cwd=self._cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    def stop(self) -> None:
        if not self._process:
            return
        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None

    def _restart(self) -> None:
        self.stop()
        self.start()

    def _drain_stderr(self) -> str:
        if not self._process or not self._process.stderr:
            return ""
        try:
            self._process.stderr.close()
        except OSError:
            pass
        try:
            self._process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            self._process.kill()
        return "(stderr drained after worker crash)"

    def request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        last_error: Optional[Exception] = None

        for attempt in range(1, MAX_WORKER_RETRIES + 1):
            self.start()
            assert self._process and self._process.stdin and self._process.stdout

            request_id = str(self._next_request_id)
            self._next_request_id += 1
            payload = {
                "id": request_id,
                "method": method,
                "params": params or {},
            }

            try:
                self._process.stdin.write(json.dumps(payload, separators=(",", ":")) + "\n")
                self._process.stdin.flush()
            except OSError as exc:
                last_error = RuntimeError(f"Worker stdin write failed (attempt {attempt}): {exc}")
                warnings.warn(str(last_error), stacklevel=2)
                self._restart()
                continue

            line = self._process.stdout.readline()
            if not line:
                stderr_note = self._drain_stderr()
                last_error = RuntimeError(f"Worker closed unexpectedly (attempt {attempt}). {stderr_note}")
                warnings.warn(str(last_error), stacklevel=2)
                self._restart()
                continue

            response = json.loads(line)
            if response.get("id") != request_id:
                raise RuntimeError("Worker response ID mismatch.")
            if not response.get("ok"):
                error = response.get("error", {})
                message = error.get("message", "Unknown worker error")
                raise RuntimeError(message)
            return response["result"]

        raise last_error or RuntimeError("Worker request failed after retries.")

    def create_session(self, deck_seed: Optional[int] = None) -> Dict[str, Any]:
        params: Dict[str, Any] = {}
        if deck_seed is not None:
            params["deckSeed"] = int(deck_seed)
        return self.request("create_session", params)

    def create_session_rl(self, deck_seed: Optional[int] = None) -> Dict[str, Any]:
        params: Dict[str, Any] = {}
        if deck_seed is not None:
            params["deckSeed"] = int(deck_seed)
        return self.request("create_session_rl", params)

    def reset_session(self, session_id: str, deck_seed: Optional[int] = None) -> Dict[str, Any]:
        params: Dict[str, Any] = {"sessionId": session_id}
        if deck_seed is not None:
            params["deckSeed"] = int(deck_seed)
        return self.request("reset_session", params)

    def reset_session_rl(self, session_id: str, deck_seed: Optional[int] = None) -> Dict[str, Any]:
        params: Dict[str, Any] = {"sessionId": session_id}
        if deck_seed is not None:
            params["deckSeed"] = int(deck_seed)
        return self.request("reset_session_rl", params)

    def get_state(self, session_id: str) -> Dict[str, Any]:
        return self.request("get_state", {"sessionId": session_id})

    def get_possible_actions(self, session_id: str) -> Dict[str, Any]:
        return self.request("get_possible_actions", {"sessionId": session_id})

    def step_action(self, session_id: str, action: Dict[str, Any]) -> Dict[str, Any]:
        return self.request("step_action", {"sessionId": session_id, "action": action})

    def step_action_rl(self, session_id: str, action: Dict[str, Any]) -> Dict[str, Any]:
        return self.request("step_action_rl", {"sessionId": session_id, "action": action})

    def close_session(self, session_id: str) -> Dict[str, Any]:
        return self.request("close_session", {"sessionId": session_id})


__all__ = ["EngineWorkerClient"]
