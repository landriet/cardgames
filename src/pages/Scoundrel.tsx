import React from "react";
import MainLayout from "../layouts/MainLayout.tsx";
import ScoundrelGame from "../features/scoundrel/components/ScoundrelGame.tsx";

const ScoundrelPage: React.FC = () => {
  return (
    <MainLayout>
      <ScoundrelGame />
    </MainLayout>
  );
};

export default ScoundrelPage;
