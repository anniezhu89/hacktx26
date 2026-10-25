import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { IntakeScreen } from "./screens/IntakeScreen";
import { PlanScreen } from "./screens/PlanScreen";
import { QueueScreen } from "./screens/QueueScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SavingsScreen } from "./screens/SavingsScreen";
import { UnderstandScreen } from "./screens/UnderstandScreen";
import { CaseProvider, useCase } from "./state/CaseContext";
import type { ReactNode } from "react";

function RequireCase({ children }: { children: ReactNode }) {
  const { medCase } = useCase();
  if (!medCase) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <BrowserRouter>
      <CaseProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<IntakeScreen />} />
            <Route path="/review" element={<RequireCase><ReviewScreen /></RequireCase>} />
            <Route path="/understand" element={<RequireCase><UnderstandScreen /></RequireCase>} />
            <Route path="/savings" element={<RequireCase><SavingsScreen /></RequireCase>} />
            <Route path="/plan" element={<PlanScreen />} />
            <Route path="/queue" element={<QueueScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </CaseProvider>
    </BrowserRouter>
  );
}
