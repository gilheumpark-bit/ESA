'use client';

import { useCallback, useEffect, useState } from 'react';
import { FeatureRequestError } from '@/lib/feature-request';

interface ResourceState<T> {
  key: string; revision: number; data?: T; error: string | null; status: number; loaded: boolean;
}
/** Caller supplies a memoized loader and a key containing every identity/filter.
 * Old-account data is hidden during render, before effect cleanup runs. */
export function useFeatureResource<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceState<T> | null>(null);
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal).then((data) => {
        if (!controller.signal.aborted) setState({ key, revision, data, loaded: true, error: null, status: 200 });
      }, (error: unknown) => {
        if (controller.signal.aborted) return;
        const status = error instanceof FeatureRequestError ? error.status : 0;
        setState({ key, revision, loaded: true, status,
          error: error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.' });
      });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, load, revision]);
  const current = state?.key === key && state.revision === revision ? state : null;
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { data: key === null ? undefined : current?.data, error: key === null ? null : current?.error ?? null,
    status: current?.status ?? 0, loading: key !== null && !current?.loaded, reload };
}
