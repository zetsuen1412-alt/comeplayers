"use client";

import { useState } from "react";
import { FaCrosshairs } from "react-icons/fa6";

export default function ComePlayersStrikeArcadeGame() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#05070b]">
      {!loaded ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.12),transparent_32%),#05070b]">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="flex h-16 w-16 animate-pulse items-center justify-center border border-yellow-300/45 bg-yellow-300/10 text-2xl text-yellow-200">
              <FaCrosshairs />
            </span>
            <div>
              <p className="text-sm font-black tracking-[0.18em] text-yellow-200">
                LOADING STRIKE BLACK CORE 0.4
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Preparing the Black Core district inside Messages &amp; Chat
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <iframe
        src="/play/comeplayers-strike?embed=messages"
        title="ComePlayers Strike"
        className="h-full min-h-0 w-full border-0 bg-[#05070b]"
        allow="autoplay; fullscreen; gamepad"
        allowFullScreen
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
