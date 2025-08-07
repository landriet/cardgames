
import { useEffect, useState } from 'react';
import './App.css';
import Header from './components/Header.tsx';

function App() {
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
      {/* Blank page below menu */}
    </div>
  );
}

export default App;
