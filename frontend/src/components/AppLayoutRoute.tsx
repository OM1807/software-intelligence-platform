import { useOutlet } from 'react-router-dom';

import AppLayout from '@/components/AppLayout';

export default function AppLayoutRoute() {
  const outlet = useOutlet();
  return <AppLayout>{outlet}</AppLayout>;
}
