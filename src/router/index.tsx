import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from '../pages/Home';

import ScoundrelPage from '../pages/Scoundrel';
import DemoCards from '../pages/DemoCards';

const Router: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/demo-cards" element={<DemoCards />} />
      <Route path="/scoundrel" element={<ScoundrelPage />} />
    </Routes>
  </BrowserRouter>
);

export default Router;
