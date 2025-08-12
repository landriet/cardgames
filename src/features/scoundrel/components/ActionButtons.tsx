import { ScoundrelGameState } from "../../../types/scoundrel";

export default function ActionButtons({
  game,
  onSkipRoom,
  onRestart,
}: {
  game: ScoundrelGameState;
  onSkipRoom: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="flex gap-4 mt-8">
      <button
        className={`px-4 py-2 rounded ${game.canDeferRoom && !game.lastActionWasDefer && game.currentRoom.cards.length === 4 ? "bg-yellow-600 text-white hover:bg-yellow-700" : "bg-gray-400 text-gray-200 cursor-not-allowed"}`}
        onClick={onSkipRoom}
        disabled={!game.canDeferRoom || game.lastActionWasDefer || game.currentRoom.cards.length !== 4}
      >
        Skip Room
      </button>
      <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onClick={onRestart}>
        Restart Game
      </button>
    </div>
  );
}
