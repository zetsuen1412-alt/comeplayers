"use client";

import { useState } from "react";
import { getGameImageCandidates, type GameCatalogImageSource } from "@/lib/gameCatalogImages";

type Props = {
  game: GameCatalogImageSource & { name: string };
  className?: string;
  imageClassName?: string;
  fallbackLabel?: string;
};

function ImageSequence({ sources, name, className, imageClassName, fallbackLabel }: {
  sources: string[]; name: string; className: string; imageClassName: string; fallbackLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const source = sources[index];
  return (
    <div className={`relative overflow-hidden bg-neutral-950 ${className}`}>
      {source ? (
        // Public catalog URLs are already optimized on upload; arbitrary admin URLs must not be proxied by Next.js.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt={`${name} — game artwork`} width={1600} height={900}
          loading="lazy" decoding="async" referrerPolicy="no-referrer"
          className={`h-full w-full object-cover ${imageClassName}`}
          onError={() => setIndex((current) => current === index ? current + 1 : current)} />
      ) : (
        <div role="img" aria-label={`${name}: ${fallbackLabel}`} className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-neutral-900 via-neutral-950 to-yellow-950/30 px-4 py-5 text-center text-yellow-300/70">
          <svg viewBox="0 0 120 76" fill="none" aria-hidden="true" className="h-12 w-20">
            <path d="M34 17h52c10 0 16 8 19 20l6 21c3 12-9 18-17 10L79 54H41L26 68C18 76 6 70 9 58l6-21c3-12 9-20 19-20Z" stroke="currentColor" strokeWidth="4" />
            <path d="M33 29v19m-10-9h20M51 17l4-9h10l4 9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            <circle cx="84" cy="32" r="4" fill="currentColor" /><circle cx="94" cy="43" r="4" fill="currentColor" />
          </svg>
          <span className="text-xs font-medium">{fallbackLabel}</span>
        </div>
      )}
    </div>
  );
}

export default function GameCoverImage({ game, className = "aspect-video", imageClassName = "", fallbackLabel = "Artwork not available yet" }: Props) {
  const sources = getGameImageCandidates(game);
  return <ImageSequence key={sources.join("\n")} sources={sources} name={game.name}
    className={className} imageClassName={imageClassName} fallbackLabel={fallbackLabel} />;
}
