import { Navigate, useOutlet } from 'react-router-dom';
import { getToken } from '@/api';
import AppLayout from '@/components/AppLayout';
import { useRepos } from '@/context/RepoContext';

export default function AppLayoutRoute() {
  const outlet = useOutlet();
  const { currentUser, authLoading } = useRepos();
  if (!getToken()) return <Navigate to="/login" replace />;
  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Verifying session…</div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <AppLayout>{outlet}</AppLayout>;
}
