# Scoundrel Game API

This API provides endpoints to interact with the Scoundrel card game server. It allows clients to start a new game, query game state, and perform game actions via HTTP requests.

## Setup & Run

1. **Install dependencies:**
   ```sh
   npm install
   ```
2. **Start the API server:**
   ```sh
   npx ts-node src/api/server.ts
   ```
   The server runs on port `3001` by default (or set `PORT` env variable).

## Endpoints

### Health Check

- **GET** `/api/health`
- **Response:** `{ "status": "ok" }`

### Start a New Game

- **POST** `/api/game/start`
- **Response:** `{ "sessionId": string, "state": ScoundrelGameState }`

### Get Current Game State

- **GET** `/api/game/state/:sessionId`
- **Response:** `{ "state": ScoundrelGameState }`
- **Error:** `{ "error": "Session not found" }`

### Avoid Room

- **POST** `/api/game/avoid-room/:sessionId`
- **Response:** `{ "state": ScoundrelGameState }`
- **Error:** `{ "error": "Session not found" }`

### Enter Room

- **POST** `/api/game/enter-room/:sessionId`
- **Response:** `{ "state": ScoundrelGameState }`
- **Error:** `{ "error": "Session not found" }`

### Act on a Card

- **POST** `/api/game/act/:sessionId`
- **Body:** `{ "cardIdx": number, "mode"?: string }`
- **Response:** `{ "state": ScoundrelGameState }`
- **Error:** `{ "error": "Session not found" }` or `{ "error": "Invalid card index" }`

## Example Usage

### Start a Game

```sh
curl -X POST http://localhost:3001/api/game/start
```

### Get Game State

```sh
curl http://localhost:3001/api/game/state/<sessionId>
```

### Avoid Room

```sh
curl -X POST http://localhost:3001/api/game/avoid-room/<sessionId>
```

### Enter Room

```sh
curl -X POST http://localhost:3001/api/game/enter-room/<sessionId>
```

### Act on a Card

```sh
curl -X POST http://localhost:3001/api/game/act/<sessionId> \
  -H "Content-Type: application/json" \
  -d '{"cardIdx":0,"mode":"attack"}'
```

## Notes

- All state objects follow the `ScoundrelGameState` type (see `src/types/scoundrel.ts`).
- Sessions are stored in-memory and will reset if the server restarts.
