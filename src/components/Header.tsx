import React from 'react';

const Header: React.FC<{ dark: boolean; setDark: React.Dispatch<React.SetStateAction<boolean>> }> = ({ dark, setDark }) => (
  <header className="bg-white dark:bg-gray-800 shadow-md" role="banner">
    <div className="max-w-7xl mx-auto flex justify-between items-center p-4">
      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">CardGames</span>
      <nav aria-label="Main navigation" className="flex gap-4">
        <a href="/" className="text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 font-medium">Home</a>
        <a href="/demo-cards" className="text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 font-medium">Demo Cards</a>
        <a href="/scoundrel" className="text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 font-medium">Scoundrel</a>
      </nav>
      <button
        onClick={() => setDark((d) => !d)}
        className="ml-4 px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
        aria-label="Toggle dark mode"
      >
        {dark ? '🌙' : '☀️'}
      </button>
    </div>
  </header>
);

export default Header;
