import Modal from "../../../components/Modal";

export default function DeathModal({
  isOpen,
  onRestart,
}: {
  isOpen: boolean;
  onRestart: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onRestart} ariaLabel="Game Over">
      <div className="flex flex-col items-center justify-center p-6">
        <h2 className="text-xl font-bold mb-2 text-red-700 dark:text-red-400">
          You Died!
        </h2>
        <p className="mb-4 text-gray-800 dark:text-gray-200">
          Your adventure ends here. Try again?
        </p>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={onRestart}
        >
          Restart Game
        </button>
      </div>
    </Modal>
  );
}
