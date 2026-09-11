import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  FaBiohazard,
  FaBomb,
  FaBolt,
  FaCrosshairs,
  FaDesktop,
  FaRobot,
  FaShieldAlt,
  FaUsers,
} from "react-icons/fa";

export const metadata: Metadata = {
  title: "ComePlayers Strike | Black Core Update 0.4",
  description:
    "Play ComePlayers Strike directly in your browser with expanded industrial terrain, explosive objects, Zombie Survival, and a seven-chapter Zombie Adventure with checkpoints and a three-phase boss battle.",
  alternates: { canonical: "/games/comeplayers-strike" },
  openGraph: {
    title: "ComePlayers Strike | Black Core Update 0.4",
    description: "Five playable modes, a detailed industrial map, six infected archetypes, interactive hazards, Zombie Adventure checkpoints, and the three-phase Outbreak Colossus boss.",
    url: "/games/comeplayers-strike",
    siteName: "ComePlayers",
    type: "website",
    images: [
      {
        url: "/strike/strike-ui-home.png",
        width: 1672,
        height: 941,
        alt: "ComePlayers Strike game command center",
      },
    ],
  },
};

const MODES = [
  {
    icon: FaUsers,
    title: "Team Deathmatch",
    image: "/strike/mode-tdm.png",
    copy: "Respawn combat against an aggressive enemy squad. Reach the target score before time runs out.",
  },
  {
    icon: FaBomb,
    title: "Bomb Defusal",
    image: "/strike/mode-bomb.png",
    copy: "Reach Point A, hold E to plant the charge, and stop the defenders from completing a defuse.",
  },
  {
    icon: FaCrosshairs,
    title: "Free For All",
    image: "/strike/mode-ffa.png",
    copy: "Every fighter is a rival. Race the simulated opposition to fifteen eliminations.",
  },
  {
    icon: FaBiohazard,
    title: "Zombie Survival",
    image: "/strike/mode-zombie.png",
    copy: "Survive eight escalating waves featuring walkers, runners, crawlers, toxic spitters, screamers, brutes, and a three-phase final boss.",
  },
  {
    icon: FaRobot,
    title: "Zombie Adventure",
    image: "/strike/mode-adventure.png",
    copy: "Advance through seven objective chapters, raid a supply cache, open the quarantine gate, restart generators, purge the reactor, defeat the Colossus, and extract.",
  },
];

const FEATURES = [
  {
    icon: FaCrosshairs,
    title: "Responsive FPS Combat",
    copy: "Automatic fire, ADS, recoil, headshots, reload, sprint, crouch, jump, health, armor, and respawn rules.",
  },
  {
    icon: FaRobot,
    title: "Special Infected & Boss AI",
    copy: "Walkers pressure the player, runners and crawlers rush, spitters attack from range, screamers enrage hordes, brutes absorb damage, and the Colossus changes behavior across three phases.",
  },
  {
    icon: FaDesktop,
    title: "Runs in the Browser",
    copy: "Built with Three.js and WebGL for desktop keyboard and mouse without a separate game installation.",
  },
  {
    icon: FaShieldAlt,
    title: "Detailed Outbreak District",
    copy: "Expanded terrain, roads, catwalks, fences, buildings, containers, vehicles, generators, pickups, explosive barrels, toxic hazards, drones, lights, and environmental props.",
  },
];

export default function ComePlayersStrikeLandingPage() {
  return (
    <main className="min-h-screen bg-[#040609] text-white">
      <section className="relative isolate min-h-[760px] overflow-hidden border-b border-yellow-400/20">
        <Image
          src="/strike/strike-ui-home.png"
          alt="ComePlayers Strike redesigned command center"
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-center"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(3,5,8,.99)_0%,rgba(3,5,8,.93)_34%,rgba(3,5,8,.35)_70%,rgba(3,5,8,.78)_100%),linear-gradient(0deg,rgba(3,5,8,.98),transparent_52%)]" />

        <div className="mx-auto flex min-h-[760px] max-w-7xl items-center px-5 py-24 sm:px-8 lg:px-12">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 border border-yellow-400/40 bg-yellow-400/10 px-4 py-2 text-xs font-black tracking-[.2em] text-yellow-300">
              <FaBolt /> BLACK CORE UPDATE 0.4
            </p>
            <h1 className="mt-7 text-5xl font-black leading-[.86] tracking-[-.07em] sm:text-7xl lg:text-8xl">
              COMEPLAYERS
              <span className="mt-3 block -skew-x-6 text-yellow-400">STRIKE</span>
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              A 3D ComePlayers FPS that runs directly in your browser, now featuring a more detailed industrial map,
              five modes, eight-wave Zombie Survival, and a seven-chapter Zombie Adventure with checkpoints, interactive objects, special infected, and a three-phase boss.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/play/comeplayers-strike"
                className="inline-flex min-h-14 items-center justify-center gap-3 -skew-x-3 bg-yellow-400 px-8 text-sm font-black tracking-[.08em] text-black shadow-2xl shadow-yellow-400/20 transition hover:-translate-y-1 hover:bg-yellow-300"
              >
                <FaCrosshairs /> OPEN STRIKE COMMAND CENTER
              </Link>
              <a
                href="#modes"
                className="inline-flex min-h-14 items-center justify-center border border-white/20 bg-black/55 px-8 text-sm font-black tracking-[.08em] text-white backdrop-blur transition hover:border-yellow-400 hover:text-yellow-300"
              >
                VIEW ALL MODES
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-2 text-xs font-bold text-slate-300">
              <span className="border border-white/10 bg-black/45 px-4 py-2">Keyboard + Mouse</span>
              <span className="border border-white/10 bg-black/45 px-4 py-2">5 Playable Modes</span>
              <span className="border border-white/10 bg-black/45 px-4 py-2">Three.js WebGL</span>
              <span className="border border-white/10 bg-black/45 px-4 py-2">Bot Prototype</span>
            </div>
          </div>
        </div>
      </section>

      <section id="modes" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
        <p className="text-xs font-black tracking-[.2em] text-yellow-400">FIVE WAYS TO FIGHT</p>
        <h2 className="mt-3 text-4xl font-black tracking-[-.045em] sm:text-5xl">CHOOSE YOUR BATTLEFIELD</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <article key={mode.title} className="group overflow-hidden border border-white/10 bg-white/[.035] transition hover:-translate-y-1 hover:border-yellow-400/60">
                <div className="relative aspect-[4/3] overflow-hidden bg-black">
                  <Image src={mode.image} alt="" fill sizes="(min-width: 1280px) 20vw, 50vw" className="object-cover opacity-80 transition duration-500 group-hover:scale-105 group-hover:opacity-100" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                  <Icon className="absolute left-5 top-5 text-2xl text-yellow-400" />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-black uppercase">{mode.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{mode.copy}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#080b10] py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="border border-white/10 bg-white/[.035] p-6 transition hover:-translate-y-1 hover:border-yellow-400/50 hover:bg-yellow-400/[.04]">
                  <div className="grid h-12 w-12 place-items-center bg-yellow-400 text-xl text-black"><Icon /></div>
                  <h2 className="mt-5 text-xl font-black">{feature.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{feature.copy}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ["strike-ui-modes.png", "Interactive game mode selection"],
            ["strike-ui-loadout.png", "Loadout and operator customization"],
            ["strike-ui-lobby.png", "Bomb Defusal room lobby"],
          ].map(([image, alt]) => (
            <div key={image} className="relative aspect-video overflow-hidden border border-white/10 bg-black">
              <Image src={`/strike/${image}`} alt={alt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition duration-500 hover:scale-105" />
            </div>
          ))}
        </div>

        <div className="mt-14 border border-yellow-400/30 bg-[linear-gradient(120deg,rgba(247,181,0,.12),rgba(255,255,255,.02))] p-7 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-10">
          <div>
            <p className="text-xs font-black tracking-[.2em] text-yellow-400">READY FOR DEPLOYMENT?</p>
            <h2 className="mt-3 text-3xl font-black">Enter the Black Core outbreak.</h2>
            <p className="mt-2 text-sm text-slate-400">Select a mode and press Start Match from the lobby. Desktop keyboard and mouse are required.</p>
          </div>
          <Link href="/play/comeplayers-strike" className="mt-6 inline-flex min-h-14 shrink-0 items-center justify-center gap-3 bg-yellow-400 px-8 text-sm font-black tracking-[.08em] text-black transition hover:bg-yellow-300 sm:mt-0">
            <FaCrosshairs /> PLAY NOW
          </Link>
        </div>
      </section>
    </main>
  );
}
