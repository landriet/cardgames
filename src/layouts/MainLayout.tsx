import React, { useEffect, useState } from 'react';

interface MainLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, sidebar }) => {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [dark]);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50 dark:bg-gray-900">
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
      <div className="flex flex-1 min-h-0">
        {sidebar && (
          <aside className="hidden md:block w-64 bg-gray-100 dark:bg-gray-900 p-4 border-r border-gray-200 dark:border-gray-800" role="complementary">
            {sidebar}
          </aside>
        )}
        <main className="flex-1 p-4 overflow-auto text-gray-900 dark:text-gray-100" role="main">
          {children}
        </main>
      </div>
      <footer className="bg-gray-100 dark:bg-gray-800 p-4" role="contentinfo">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-gray-500 dark:text-gray-400 text-sm">
          <span>&copy; 2025 CardGames. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
};

export default MainLayout;
