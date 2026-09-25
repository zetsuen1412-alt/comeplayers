import Link from "next/link";
import GameCoverImage from "./GameCoverImage";
import type { GameCatalogImageSource } from "@/lib/gameCatalogImages";

type GameCardProps = {
  game: GameCatalogImageSource & {
    id: number;
    name: string;
    slug: string;
    offer_count?: number | null;
    is_trending?: boolean | null;
    rating?: number | null;
    description?: string | null;
    badge?: string | null;
    cta_label?: string | null;
  };
  href?: string;
};

export default function GameCard({ game, href }: GameCardProps) {
  const badge = game.badge || (game.is_trending ? "HOT" : null);
  const offerCount = Number(game.offer_count || 0);

  return (
    <Link href={href || `/games/${game.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-yellow-300/20 bg-[linear-gradient(180deg,#11110f_0%,#090a09_100%)] shadow-[0_18px_45px_rgba(0,0,0,0.34)] transition duration-300 hover:-translate-y-1 hover:border-yellow-300/65 hover:shadow-[0_22px_55px_rgba(0,0,0,0.46),0_0_24px_rgba(250,204,21,0.08)]">
      <GameCoverImage game={game} className="aspect-video w-full shrink-0" imageClassName="transition-transform duration-300 group-hover:scale-[1.03]" />
      <div className="flex min-h-36 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-black text-white transition group-hover:text-yellow-200">{game.name}</h3>
          {badge ? <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${game.badge ? "border border-yellow-300/30 bg-yellow-300/10 text-yellow-200" : "bg-yellow-400 text-black"}`}>{badge}</span> : null}
        </div>
        {game.description ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-neutral-400">{game.description}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs">
          <span className="rounded-lg border border-yellow-300/20 bg-yellow-300/[0.08] px-3 py-1 font-bold text-yellow-200">{offerCount.toLocaleString("id-ID")} offers</span>
          {game.cta_label ? <span className="font-bold text-neutral-300 transition group-hover:text-yellow-200">{game.cta_label}</span> : game.rating ? <span className="text-neutral-400">* {Number(game.rating).toFixed(1)}</span> : null}
        </div>
      </div>
    </Link>
  );
}
