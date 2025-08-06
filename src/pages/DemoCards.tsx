import React from 'react';
import Card from '../components/Card';

const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const ranks = ['A', '2', '3', 'J', 'Q', 'K'] as const;

const DemoCards: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold mb-6">Card Component Demo</h1>
      <div className="flex flex-wrap gap-4">
        {suits.map((suit) =>
          ranks.map((rank) => (
            <Card key={`${suit}-${rank}`} suit={suit} rank={rank} />
          ))
        )}
        <Card suit="spades" rank="A" faceUp={false} />
      </div>
    </div>
  );
};

export default DemoCards;
