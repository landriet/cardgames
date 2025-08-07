import React, { useState, useEffect } from 'react';
import ScoundrelGame from '../features/scoundrel/components/ScoundrelGame.tsx';
import Header from '../components/Header.tsx';

const ScoundrelPage: React.FC = () => {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [dark]);

  return (
    <div className="min-h-screen w-screen flex flex-col">
      <Header dark={dark} setDark={setDark} />
      <ScoundrelGame />
    </div>
  );
};

export default ScoundrelPage;
