"use client";

import { useState } from "react";
import { FaDice } from "react-icons/fa6";

export default function ComePlayersMonopolyV21ArcadeGame() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#07121b]">
      {!loaded ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.15),transparent_34%),#07121b]">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl border border-yellow-300/45 bg-yellow-300/10 text-2xl text-yellow-200">
              <FaDice />
            </span>
            <div>
              <p className="text-sm font-black tracking-[0.18em] text-yellow-200">
                LOADING CP MONOPOLY V22
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Preparing Marble World inside Messages &amp; Chat
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <iframe
        src="/games/monopoly?embed=messages"
        title="CP Monopoly V22"
        className="h-full min-h-0 w-full border-0 bg-[#07121b]"
        allow="autoplay; fullscreen; gamepad"
        allowFullScreen
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
