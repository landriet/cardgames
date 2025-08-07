import React from 'react';

interface MainLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, sidebar }) => (
  <div className="h-screen w-screen flex flex-col bg-gray-50">
    <header className="bg-white shadow-md" role="banner">
      <div className="max-w-7xl mx-auto flex justify-between items-center p-4">
        <span className="text-2xl font-bold">CardGames</span>
        <nav aria-label="Main navigation" className="flex gap-4">
          <a href="/" className="text-gray-700 hover:text-blue-600 font-medium">Home</a>
          <a href="/demo-cards" className="text-gray-700 hover:text-blue-600 font-medium">Demo Cards</a>
          <a href="/scoundrel" className="text-gray-700 hover:text-blue-600 font-medium">Scoundrel</a>
        </nav>
      </div>
    </header>
    <div className="flex flex-1 min-h-0">
      {sidebar && (
        <aside className="hidden md:block w-64 bg-gray-100 p-4 border-r border-gray-200" role="complementary">
          {sidebar}
        </aside>
      )}
      <main className="flex-1 p-4 overflow-auto" role="main">
        {children}
      </main>
    </div>
    <footer className="bg-gray-100 p-4" role="contentinfo">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-gray-500 text-sm">
        <span>&copy; 2025 CardGames. All rights reserved.</span>
        <div className="flex gap-3 mt-2 md:mt-0">
          <a href="https://twitter.com" aria-label="Twitter" target="_blank" rel="noopener" className="hover:text-blue-400"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557a9.93 9.93 0 01-2.828.775 4.932 4.932 0 002.165-2.724c-.951.564-2.005.974-3.127 1.195a4.916 4.916 0 00-8.38 4.482C7.691 8.094 4.066 6.13 1.64 3.161c-.543.93-.855 2.01-.855 3.17 0 2.188 1.115 4.117 2.813 5.254a4.904 4.904 0 01-2.229-.616c-.054 2.281 1.581 4.415 3.949 4.89a4.936 4.936 0 01-2.224.084c.627 1.956 2.444 3.377 4.6 3.417A9.867 9.867 0 010 21.543a13.94 13.94 0 007.548 2.209c9.142 0 14.307-7.721 13.995-14.646A9.936 9.936 0 0024 4.557z"/></svg></a>
          <a href="https://github.com" aria-label="GitHub" target="_blank" rel="noopener" className="hover:text-gray-800"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.757-1.333-1.757-1.089-.745.083-.729.083-.729 1.205.084 1.84 1.236 1.84 1.236 1.07 1.834 2.809 1.304 3.495.997.108-.775.418-1.305.762-1.605-2.665-.305-5.466-1.334-5.466-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.301 1.23a11.52 11.52 0 013.003-.404c1.018.005 2.045.138 3.003.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.803 5.624-5.475 5.921.43.371.823 1.102.823 2.222v3.293c0 .322.218.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12z"/></svg></a>
        </div>
      </div>
    </footer>
  </div>
);

export default MainLayout;
