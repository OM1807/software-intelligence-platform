import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { RepoProvider } from '@/context/RepoContext';
import Login from '@/pages/Login';
import RepoConnect from '@/pages/RepoConnect';
import AppLayoutRoute from '@/components/AppLayoutRoute';
import Dashboard from '@/pages/Dashboard';
import DependencyView from '@/pages/DependencyView';
import RiskAnalysis from '@/pages/RiskAnalysis';
import ChangeImpact from '@/pages/ChangeImpact';
import ArchitectureDrift from '@/pages/ArchitectureDrift';
import EngineeringReport from '@/pages/EngineeringReport';
import AIAssistant from '@/pages/AIAssistant';
import { getToken } from '@/api';

function RouteScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <RouteScrollReset />
      <RepoProvider>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/github/callback" element={<Login />} />
          <Route path="/repositories" element={<ProtectedRoute><RepoConnect /></ProtectedRoute>} />
          <Route element={<AppLayoutRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dependencies" element={<DependencyView />} />
            <Route path="/risk" element={<RiskAnalysis />} />
            <Route path="/impact" element={<ChangeImpact />} />
            <Route path="/drift" element={<ArchitectureDrift />} />
            <Route path="/report" element={<EngineeringReport />} />
            <Route path="/assistant" element={<AIAssistant />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RepoProvider>
    </BrowserRouter>
  );
}

export default App;
