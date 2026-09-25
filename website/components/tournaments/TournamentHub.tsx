"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FaArrowRight,
  FaBolt,
  FaCalendarAlt,
  FaCheckCircle,
  FaClock,
  FaGamepad,
  FaGlobeAsia,
  FaPlus,
  FaSearch,
  FaShieldAlt,
  FaTimes,
  FaTrophy,
  FaUsers,
} from "react-icons/fa";
import AuthModal from "@/components/auth/AuthModal";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import type { Tournament, TournamentRegistration } from "@/lib/tournaments";
import styles from "./TournamentArena.module.css";

type TournamentFeed = {
  tournaments: Tournament[];
  registrations: TournamentRegistration[];
  viewerId: string | null;
};

type Filter = "all" | "open" | "live" | "joined" | "hosted";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Discover" },
  { value: "open", label: "Open now" },
  { value: "live", label: "Live" },
  { value: "joined", label: "Joined" },
  { value: "hosted", label: "Hosted" },
];

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
  swiss: "Swiss System",
  battle_royale: "Battle Royale",
};

function optionalAuthHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

async function loadTournamentFeed(): Promise<TournamentFeed> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch("/api/tournaments", {
    cache: "no-store",
    headers: optionalAuthHeaders(data.session?.access_token || null),
  });
  const payload = (await response.json()) as TournamentFeed & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Unable to load tournaments.");
  return payload;
}

function formatMoney(value: number | string, currency = "IDR") {
  const amount = Number(value || 0);
  if (amount <= 0) return "FREE";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function derivedStatus(tournament: Tournament) {
  const now = Date.now();
  const start = new Date(tournament.starts_at).getTime();
  const end = tournament.ends_at ? new Date(tournament.ends_at).getTime() : null;
  const deadline = new Date(tournament.registration_deadline).getTime();

  if (tournament.status === "cancelled") return "cancelled";
  if (tournament.status === "completed" || (end && now > end)) return "completed";
  if (tournament.status === "live" || (now >= start && (!end || now <= end))) return "live";
  if (tournament.status === "registration_closed" || now >= deadline) return "closed";
  if (tournament.participant_count >= tournament.max_participants) return "full";
  return "open";
}

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function TournamentCard({
  tournament,
  joined,
  hosted,
}: {
  tournament: Tournament;
  joined: boolean;
  hosted: boolean;
}) {
  const status = derivedStatus(tournament);
  const percentage = Math.min(
    100,
    Math.round((tournament.participant_count / tournament.max_participants) * 100),
  );

  return (
    <article className={styles.card}>
      <div className={styles.cardVisual}>
        <div className={styles.cardOrb} />
        <div className={styles.cardGameIcon}>
          <FaGamepad />
        </div>
        <div className={styles.cardBadges}>
          <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
            <span /> {status}
          </span>
          {tournament.is_verified ? (
            <span className={styles.verifiedBadge}><FaCheckCircle /> Verified</span>
          ) : null}
        </div>
        <div className={styles.cardVisualText}>
          <p>{tournament.game_title}</p>
          <span>{tournament.game_mode}</span>
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <div>
            <p className={styles.eyebrow}>{FORMAT_LABELS[tournament.tournament_format]}</p>
            <h2>{tournament.title}</h2>
          </div>
          <div className={styles.prizeBox}>
            <span>PRIZE POOL</span>
            <strong>{formatMoney(tournament.prize_pool, tournament.currency)}</strong>
          </div>
        </div>

        <div className={styles.cardMeta}>
          <span><FaCalendarAlt /> {formatDate(tournament.starts_at)}</span>
          <span><FaGlobeAsia /> {tournament.region}</span>
          <span><FaGamepad /> {tournament.platform}</span>
        </div>

        <div className={styles.capacityLine}>
          <div>
            <span>Registration capacity</span>
            <strong>{tournament.participant_count}/{tournament.max_participants}</strong>
          </div>
          <div className={styles.progressTrack}>
            <span style={{ width: `${percentage}%` }} />
          </div>
        </div>

        <div className={styles.cardFooter}>
          <div className={styles.organizerMini}>
            <span>{tournament.organizer_name.slice(0, 1).toUpperCase()}</span>
            <div><small>Hosted by</small><strong>{tournament.organizer_name}</strong></div>
          </div>
          <Link
            href={`/tournaments/${tournament.id}${status === "open" && !hosted ? "?join=1" : ""}`}
            className={`${styles.joinButton} ${status !== "open" && !joined && !hosted ? styles.joinButtonMuted : ""}`}
          >
            {hosted ? "MANAGE" : joined ? "VIEW ENTRY" : status === "open" ? "JOIN NOW" : "VIEW DETAILS"}
            <FaArrowRight />
          </Link>
        </div>
      </div>
    </article>
  );
}

function CreateTournamentModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [defaults] = useState(() => {
    const currentTime = new Date().getTime();
    const deadline = new Date(currentTime + 3 * 24 * 60 * 60 * 1000);
    const start = new Date(currentTime + 4 * 24 * 60 * 60 * 1000);
    const end = new Date(currentTime + 4 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000);
    return {
      deadline: toLocalInput(deadline),
      start: toLocalInput(start),
      end: toLocalInput(end),
    };
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await authenticatedFetchJson<{ tournament: Tournament }>(
        "/api/tournaments",
        {
          method: "POST",
          body: JSON.stringify({
            title: form.get("title"),
            gameTitle: form.get("gameTitle"),
            gameMode: form.get("gameMode"),
            description: form.get("description"),
            rules: form.get("rules"),
            platform: form.get("platform"),
            region: form.get("region"),
            tournamentFormat: form.get("tournamentFormat"),
            skillLevel: form.get("skillLevel"),
            teamSize: form.get("teamSize"),
            maxParticipants: form.get("maxParticipants"),
            entryFee: form.get("entryFee"),
            prizePool: form.get("prizePool"),
            registrationDeadline: form.get("registrationDeadline"),
            startsAt: form.get("startsAt"),
            endsAt: form.get("endsAt"),
          }),
        },
      );
      router.push(`/tournaments/${response.tournament.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to post tournament.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.createModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-tournament-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>TOURNAMENT COMMAND</p>
            <h2 id="create-tournament-title">Post a new tournament</h2>
            <span>Configure the arena, schedule, capacity, and player requirements.</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close tournament form"><FaTimes /></button>
        </header>

        <form onSubmit={submit} className={styles.createForm}>
          <div className={styles.formSection}>
            <div className={styles.formSectionTitle}><span>01</span><div><strong>Identity</strong><small>Name the competition</small></div></div>
            <div className={styles.formGrid}>
              <label className={styles.formWide}>Tournament title<input name="title" minLength={4} maxLength={120} required placeholder="ComePlayers Open Championship" /></label>
              <label>Game<input name="gameTitle" minLength={2} maxLength={80} required placeholder="Valorant" /></label>
              <label>Game mode<input name="gameMode" minLength={2} maxLength={60} required placeholder="5v5 Competitive" /></label>
              <label className={styles.formWide}>Description<textarea name="description" minLength={20} maxLength={5000} required rows={4} placeholder="Tell players what makes this tournament worth entering..." /></label>
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionTitle}><span>02</span><div><strong>Arena setup</strong><small>Format and eligibility</small></div></div>
            <div className={styles.formGridThree}>
              <label>Format<select name="tournamentFormat" defaultValue="single_elimination"><option value="single_elimination">Single Elimination</option><option value="double_elimination">Double Elimination</option><option value="round_robin">Round Robin</option><option value="swiss">Swiss System</option><option value="battle_royale">Battle Royale</option></select></label>
              <label>Platform<select name="platform" defaultValue="PC"><option>PC</option><option>Mobile</option><option>PlayStation</option><option>Xbox</option><option>Cross-platform</option></select></label>
              <label>Region<select name="region" defaultValue="Southeast Asia"><option>Global</option><option>Southeast Asia</option><option>Asia</option><option>Europe</option><option>North America</option><option>South America</option><option>Oceania</option></select></label>
              <label>Skill level<select name="skillLevel" defaultValue="all_levels"><option value="all_levels">All levels</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="pro">Pro</option></select></label>
              <label>Players per entry<input name="teamSize" type="number" min={1} max={100} defaultValue={1} required /></label>
              <label>Entry capacity<input name="maxParticipants" type="number" min={2} max={4096} defaultValue={32} required /></label>
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionTitle}><span>03</span><div><strong>Schedule & rewards</strong><small>Lock the timeline</small></div></div>
            <div className={styles.formGridThree}>
              <label>Registration deadline<input name="registrationDeadline" type="datetime-local" defaultValue={defaults.deadline} required /></label>
              <label>Starts at<input name="startsAt" type="datetime-local" defaultValue={defaults.start} required /></label>
              <label>Ends at<input name="endsAt" type="datetime-local" defaultValue={defaults.end} /></label>
              <label>Entry fee (IDR)<input name="entryFee" type="number" min={0} step={1000} defaultValue={0} required /></label>
              <label>Prize pool (IDR)<input name="prizePool" type="number" min={0} step={1000} defaultValue={0} required /></label>
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionTitle}><span>04</span><div><strong>Rules</strong><small>Set clear expectations</small></div></div>
            <label className={styles.formStandalone}>Tournament rules<textarea name="rules" minLength={10} maxLength={12000} required rows={6} placeholder={"1. Players must check in before the match.\n2. Fair play is mandatory.\n3. Organizer decisions follow the published rules."} /></label>
          </div>

          {error ? <div className={styles.formError}>{error}</div> : null}
          <footer className={styles.formFooter}>
            <p><FaShieldAlt /> Your organizer identity is linked automatically to your ComePlayers account.</p>
            <div><button type="button" className={styles.cancelButton} onClick={onClose}>Cancel</button><button type="submit" className={styles.publishButton} disabled={submitting}>{submitting ? "PUBLISHING..." : "PUBLISH TOURNAMENT"}<FaArrowRight /></button></div>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default function TournamentHub() {
  const [feed, setFeed] = useState<TournamentFeed>({ tournaments: [], registrations: [], viewerId: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [platform, setPlatform] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const refresh = useCallback(async (background: boolean = false) => {
    if (!background) setLoading(true);
    setError("");
    try {
      setFeed(await loadTournamentFeed());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load tournaments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => {
      window.clearTimeout(initialLoad);
      data.subscription.unsubscribe();
    };
  }, [refresh]);
  useLiveRefresh(async () => { await refresh(true); }, { topics: 'catalog,account' });

  const activeRegistrationIds = useMemo(
    () => new Set(feed.registrations.filter((item) => item.status !== "withdrawn").map((item) => item.tournament_id)),
    [feed.registrations],
  );

  const platforms = useMemo(
    () => Array.from(new Set(feed.tournaments.map((item) => item.platform))).sort(),
    [feed.tournaments],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return feed.tournaments.filter((tournament) => {
      const status = derivedStatus(tournament);
      if (platform !== "all" && tournament.platform !== platform) return false;
      if (filter === "open" && status !== "open") return false;
      if (filter === "live" && status !== "live") return false;
      if (filter === "joined" && !activeRegistrationIds.has(tournament.id)) return false;
      if (filter === "hosted" && tournament.host_id !== feed.viewerId) return false;
      if (!query) return true;
      return [tournament.title, tournament.game_title, tournament.game_mode, tournament.organizer_name, tournament.region]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [activeRegistrationIds, feed.tournaments, feed.viewerId, filter, platform, search]);

  const liveCount = feed.tournaments.filter((item) => derivedStatus(item) === "live").length;
  const openCount = feed.tournaments.filter((item) => derivedStatus(item) === "open").length;
  const totalPlayers = feed.tournaments.reduce((sum, item) => sum + item.participant_count, 0);

  function openCreate() {
    if (!feed.viewerId) {
      setShowAuth(true);
      return;
    }
    setShowCreate(true);
  }

  return (
    <main className={styles.page}>
      <div className={styles.gridBackdrop} />
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroContent}>
          <div className={styles.heroCopy}>
            <p className={styles.heroKicker}><FaBolt /> COMEPLAYERS COMPETITIVE NETWORK</p>
            <h1>YOUR NEXT<br /><span>VICTORY STARTS HERE.</span></h1>
            <p>Discover community competitions, assemble your roster, or launch a professional tournament in minutes.</p>
            <div className={styles.heroActions}>
              <button type="button" onClick={openCreate}><FaPlus /> POST TOURNAMENT</button>
              <a href="#arena"><FaTrophy /> EXPLORE ARENAS</a>
            </div>
          </div>
          <div className={styles.heroCommand}>
            <div className={styles.commandRing}><FaTrophy /><span>CP</span></div>
            <p>ARENA STATUS</p>
            <div className={styles.commandStats}>
              <div><strong>{openCount}</strong><span>OPEN</span></div>
              <div><strong>{liveCount}</strong><span>LIVE</span></div>
              <div><strong>{totalPlayers}</strong><span>PLAYERS</span></div>
            </div>
            <small><i /> NETWORK ONLINE</small>
          </div>
        </div>
      </section>

      <section className={styles.featureStrip}>
        <div><FaShieldAlt /><span><strong>Protected registration</strong><small>Account-bound entries</small></span></div>
        <div><FaUsers /><span><strong>Community hosted</strong><small>Open to every player</small></span></div>
        <div><FaClock /><span><strong>Live capacity</strong><small>Fair database-enforced limits</small></span></div>
      </section>

      <section className={styles.arenaSection} id="arena">
        <header className={styles.sectionHeader}>
          <div><p className={styles.eyebrow}>TOURNAMENT DISCOVERY</p><h2>Active arenas</h2><span>Find the competition built for your game, region, and skill level.</span></div>
          <button type="button" onClick={openCreate}><FaPlus /> Create tournament</button>
        </header>

        <div className={styles.toolbar}>
          <div className={styles.filterTabs}>
            {FILTERS.map((item) => (
              <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={filter === item.value ? styles.filterActive : ""}>
                {item.label}
              </button>
            ))}
          </div>
          <div className={styles.searchControls}>
            <label><FaSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tournament, game, host..." /></label>
            <select value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label="Filter platform"><option value="all">All platforms</option>{platforms.map((item) => <option key={item}>{item}</option>)}</select>
          </div>
        </div>

        {error ? <div className={styles.errorState}><strong>Connection interrupted</strong><p>{error}</p><button type="button" onClick={() => void refresh()}>Retry</button></div> : null}
        {loading ? <div className={styles.loadingGrid}>{[0, 1, 2].map((item) => <div key={item} />)}</div> : null}
        {!loading && !error && visible.length > 0 ? (
          <div className={styles.cardGrid}>
            {visible.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} joined={activeRegistrationIds.has(tournament.id)} hosted={tournament.host_id === feed.viewerId} />
            ))}
          </div>
        ) : null}
        {!loading && !error && visible.length === 0 ? (
          <div className={styles.emptyState}>
            <div><FaTrophy /></div>
            <p className={styles.eyebrow}>THE NEXT ARENA IS YOURS</p>
            <h3>{feed.tournaments.length === 0 ? "Be the first organizer on ComePlayers" : "No tournaments match these filters"}</h3>
            <p>{feed.tournaments.length === 0 ? "Post a tournament with a schedule, rules, prize pool, and protected capacity. Players can register immediately." : "Try another filter or create a new competition for your community."}</p>
            <button type="button" onClick={openCreate}><FaPlus /> POST TOURNAMENT</button>
          </div>
        ) : null}
      </section>

      <CreateTournamentModal open={showCreate} onClose={() => setShowCreate(false)} />
      <AuthModal open={showAuth} initialMode="login" onClose={() => setShowAuth(false)} />
    </main>
  );
}
