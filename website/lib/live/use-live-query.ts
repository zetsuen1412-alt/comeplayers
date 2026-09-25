'use client';

import { useEffect, useRef, type DependencyList } from 'react';
import { useLiveRefresh } from './use-live-refresh';

type Cleanup = () => void;
type Query = (background: boolean, canApply: () => boolean) => void | Cleanup | Promise<unknown>;
type Options = { topics: string; enabled?: boolean; protectDrafts?: boolean };

/**
 * An opt-in replacement for a READ effect. Keeps its dependency/abort lifecycle.
 * Return the read promise, or the existing abort cleanup. Background=true lets
 * loaders keep the last displayed data instead of showing a loading skeleton.
 * Forms can retain their draft after the first edit until this page is left.
 */
export function useLiveQuery(query: Query, dependencies: DependencyList, options: Options) {
  const runner = useRef<((background: boolean) => Promise<boolean>) | null>(null);
  const draft = useRef(false);
  const latest = useRef(query);
  useEffect(() => { latest.current = query; });
  useEffect(() => {
    if (!options.protectDrafts) return;
    const edit = (event: Event) => {
      if (event.target instanceof HTMLElement && event.target.matches('input,textarea,select,[contenteditable="true"]')) draft.current = true;
    };
    document.addEventListener('input', edit, true);
    document.addEventListener('change', edit, true);
    return () => { document.removeEventListener('input', edit, true); document.removeEventListener('change', edit, true); };
  }, [options.protectDrafts]);

  useEffect(() => {
    let active = true, busy = false, cleanup: Cleanup | undefined;
    const run = async (background: boolean) => {
      if (!active) return true;
      if (busy || (background && options.protectDrafts && draft.current)) return false;
      cleanup?.(); cleanup = undefined;
      busy = true;
      try {
        // A user may start typing while the request is in flight. Form loaders
        // check this again immediately before applying returned form fields.
        const result = latest.current(background, () => active && !(background && options.protectDrafts && draft.current));
        if (typeof result === 'function') cleanup = result;
        else await result;
        return true;
      } finally { busy = false; }
    };
    runner.current = run;
    void run(false).catch(() => { /* Existing loaders own their visible errors. */ });
    return () => { active = false; cleanup?.(); if (runner.current === run) runner.current = null; };
    // The caller supplies the same dependencies as the original read effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  useLiveRefresh(() => runner.current?.(true), options);
}
