/** Enable only after the reviewed single-session database migration is applied. */
export const singleDeviceSessionsEnabled = () => process.env.SINGLE_DEVICE_SESSIONS_ENABLED === "true";
