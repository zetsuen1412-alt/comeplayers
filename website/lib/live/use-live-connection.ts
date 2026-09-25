'use client';
import { useSyncExternalStore } from 'react';
import { getLiveConnection, subscribeLiveConnection } from './events';
export function useLiveConnection() {
  return useSyncExternalStore(subscribeLiveConnection, getLiveConnection, () => 'connecting');
}
