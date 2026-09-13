// Re-export the native module. On web, it will be resolved to ComePlayersPlayUpdatesModule.web.ts
// and on native platforms to ComePlayersPlayUpdatesModule.ts
export { default } from './src/ComePlayersPlayUpdatesModule';
export * from './src/ComePlayersPlayUpdates.types';
