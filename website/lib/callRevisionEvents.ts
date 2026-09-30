/** Enable only after the atomic revision migration and its RLS/publication checks.
 * A server-side switch lets deployed clients restore fast polling on rollback.
 */
export function callRevisionEventsEnabled(value = process.env.CALL_REVISION_EVENTS_ENABLED) {
  return value === "true";
}
