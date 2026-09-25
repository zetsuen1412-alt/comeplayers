'use client';

import { useEffect, useRef } from 'react';
import { subscribeLiveChanges } from './events';
import { createRefreshQueue, type LiveTopic } from './refresh-queue';

type Options = {
  topics: string;
  enabled?: boolean;
};

/** Only pass a read here. Never replay checkout, payment, or other mutation effects. */
export function useLiveRefresh(
  refresh: () => void | boolean | Promise<void | boolean>,
  { topics, enabled = true }: Options,
) {
  const current = useRef({ refresh, enabled });
  useEffect(() => { current.current = { refresh, enabled }; });
  useEffect(() => {
    const selected = new Set(topics.split(',') as LiveTopic[]);
    const queue = createRefreshQueue(
      () => current.current.refresh(),
      () => current.current.enabled && document.visibilityState === 'visible' && navigator.onLine,
    );
    const unsubscribe = subscribeLiveChanges(changed => {
      if ([...changed].some(topic => selected.has(topic))) queue.request();
    });
    return () => { unsubscribe(); queue.dispose(); };
  }, [topics]);
}
