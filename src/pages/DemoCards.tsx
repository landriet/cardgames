import React from 'react';
import Card from '../components/Card';
import MainLayout from '../layouts/MainLayout';

const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
const ranks = ['A', '2', '3', 'J', 'Q', 'K'] as const;

const DemoCards: React.FC = () => {
  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center p-8">
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
    </MainLayout>
  );
};

export default DemoCards;
