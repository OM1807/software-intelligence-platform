import { Navigate, useOutlet } from 'react-router-dom';
import { getToken } from '@/api';
import AppLayout from '@/components/AppLayout';

export default function AppLayoutRoute() {
  const outlet = useOutlet();
  return getToken() ? <AppLayout>{outlet}</AppLayout> : <Navigate to="/" replace />;
}
