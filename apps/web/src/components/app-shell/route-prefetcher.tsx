'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useProjects } from '@/lib/projects/projects-context';
import { buildDashboardPrefetchRoutes } from './route-prefetch-routes';

export function RoutePrefetcher() {
  const router = useRouter();
  const { projects } = useProjects();
  const routes = useMemo(() => buildDashboardPrefetchRoutes(projects), [projects]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prefetch = () => {
      for (const route of routes) router.prefetch(route);
    };

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(prefetch, 250);
    return () => globalThis.clearTimeout(timeoutId);
  }, [router, routes]);

  return null;
}
