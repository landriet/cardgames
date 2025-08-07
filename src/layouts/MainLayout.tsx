import React, { useEffect, useState } from 'react';
import Header from '../components/Header.tsx';

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
    <div className="h-screen w-screen flex flex-col dark:bg-gray-900">
      <Header dark={dark} setDark={setDark} />
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
