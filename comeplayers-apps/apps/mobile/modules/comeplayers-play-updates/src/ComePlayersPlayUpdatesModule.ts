import { NativeModule, requireOptionalNativeModule } from "expo";
import type { PlayUpdateResult } from "./ComePlayersPlayUpdates.types";

declare class ComePlayersPlayUpdatesModule extends NativeModule<{}> {
  checkAndStartUpdateAsync(): Promise<PlayUpdateResult>;
}

export default requireOptionalNativeModule<ComePlayersPlayUpdatesModule>(
  "ComePlayersPlayUpdates"
);
