import type { LiveTopic } from './refresh-queue';

type Listener = (topics: ReadonlySet<LiveTopic>) => void;
const listeners = new Set<Listener>();
export type LiveConnection = 'connecting' | 'live' | 'reconnecting' | 'offline';
let connection: LiveConnection = 'connecting';
const statusListeners = new Set<() => void>();
export const getLiveConnection = () => connection;
export function setLiveConnection(next: LiveConnection) {
  if (connection === next) return;
  connection = next; statusListeners.forEach(listener => listener());
}
export function subscribeLiveConnection(listener: () => void) {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}
export function publishLiveChanges(topics: LiveTopic[]) {
  if (topics.length) for (const listener of listeners) listener(new Set(topics));
}
export function subscribeLiveChanges(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
