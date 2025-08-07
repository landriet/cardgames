import React, { useState } from 'react';
import Card from '../components/Card.tsx';
import Header from '../components/Header.tsx';
import Modal from '../components/Modal.tsx';

const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const ranks = ['A', '2', '3', 'J', 'Q', 'K'] as const;

const DemoCards: React.FC = () => {
  const [isModalOpen, setModalOpen] = useState(false);
  const [dark, setDark] = useState(false);

  React.useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [dark]);

  return (
    <div className="min-h-screen w-screen flex flex-col dark:bg-gray-900">
      <Header dark={dark} setDark={setDark} />
      <div className="flex flex-col items-center justify-center p-8">
        <h1 className="text-2xl font-bold mb-6">Card Component Demo</h1>
        <button
          className="mb-6 px-6 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition"
          onClick={() => setModalOpen(true)}
        >
          Show Popup
        </button>
        <div className="flex flex-wrap gap-4">
          {suits.map((suit) =>
            ranks.map((rank) => (
              <Card key={`${suit}-${rank}`} suit={suit} rank={rank} />
            ))
          )}
          <Card suit="spades" rank="A" faceUp={false} />
        </div>
        <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} ariaLabel="Demo Popup">
          <h2 className="text-xl font-bold mb-2">Beautiful Popup</h2>
          <p className="mb-4">This is a demo popup for displaying actions or text on top of the UI.</p>
          <button
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
            onClick={() => setModalOpen(false)}
          >
            Close
          </button>
        </Modal>
      </div>
    </div>
  );
};

export default DemoCards;
