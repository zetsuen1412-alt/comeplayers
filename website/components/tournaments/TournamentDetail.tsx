"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FaArrowLeft,
  FaBolt,
  FaCalendarAlt,
  FaCheck,
  FaCheckCircle,
  FaClock,
  FaGamepad,
  FaGlobeAsia,
  FaLock,
  FaMedal,
  FaShieldAlt,
  FaTimes,
  FaTrophy,
  FaUserShield,
  FaUsers,
} from "react-icons/fa";
import AuthModal from "@/components/auth/AuthModal";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import type { Tournament, TournamentRegistration } from "@/lib/tournaments";
import styles from "./TournamentArena.module.css";

type TournamentDetailResponse = {
  tournament: Tournament;
  registration: TournamentRegistration | null;
  participants: TournamentRegistration[];
  viewerId: string | null;
  isOrganizer: boolean;
};

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
  swiss: "Swiss System",
  battle_royale: "Battle Royale",
};

const SKILL_LABELS: Record<string, string> = {
  all_levels: "All skill levels",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  pro: "Professional",
};

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
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function statusOf(tournament: Tournament) {
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

function remainingTime(deadline: string, now: number) {
  const remaining = Math.max(0, new Date(deadline).getTime() - now);
  if (remaining === 0) return "Registration closed";
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

async function loadTournament(id: string): Promise<TournamentDetailResponse> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`/api/tournaments/${id}`, {
    cache: "no-store",
    headers: data.session?.access_token
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : undefined,
  });
  const payload = (await response.json()) as TournamentDetailResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Unable to load tournament.");
  return payload;
}

function JoinModal({
  open,
  tournament,
  onClose,
  onJoined,
}: {
  open: boolean;
  tournament: Tournament;
  onClose: () => void;
  onJoined: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await authenticatedFetchJson(`/api/tournaments/${tournament.id}/join`, {
        method: "POST",
        body: JSON.stringify({
          gameUsername: form.get("gameUsername"),
          teamName: form.get("teamName"),
          contactHandle: form.get("contactHandle"),
          notes: form.get("notes"),
        }),
      });
      await onJoined();
      onClose();
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Unable to join tournament.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <section className={styles.joinModal} role="dialog" aria-modal="true" aria-labelledby="join-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.joinModalHeader}>
          <div className={styles.joinShield}><FaTrophy /></div>
          <div><p className={styles.eyebrow}>SECURE ARENA ENTRY</p><h2 id="join-title">Join {tournament.title}</h2><span>Your entry is bound to your ComePlayers account.</span></div>
          <button type="button" onClick={onClose} aria-label="Close join form"><FaTimes /></button>
        </header>
        <div className={styles.joinSummary}>
          <div><span>GAME</span><strong>{tournament.game_title}</strong></div>
          <div><span>ENTRY</span><strong>{formatMoney(tournament.entry_fee, tournament.currency)}</strong></div>
          <div><span>TEAM SIZE</span><strong>{tournament.team_size === 1 ? "Solo" : `${tournament.team_size} players`}</strong></div>
        </div>
        <form onSubmit={submit} className={styles.joinForm}>
          <label>In-game username<input name="gameUsername" required minLength={2} maxLength={80} placeholder="Your exact player ID" /></label>
          {tournament.team_size > 1 ? <label>Team name<input name="teamName" required minLength={2} maxLength={80} placeholder="Your registered squad name" /></label> : null}
          <label>Discord or contact handle <span>optional</span><input name="contactHandle" maxLength={120} placeholder="For match coordination" /></label>
          <label>Notes for organizer <span>optional</span><textarea name="notes" maxLength={1000} rows={3} placeholder="Roster details or availability" /></label>
          <div className={styles.joinConsent}><FaShieldAlt /><p><strong>Fair-play registration</strong><span>By joining, you agree to the published tournament rules and ComePlayers community standards.</span></p></div>
          {error ? <div className={styles.formError}>{error}</div> : null}
          <button type="submit" disabled={submitting}>{submitting ? "SECURING YOUR ENTRY..." : "CONFIRM & JOIN NOW"}<FaCheck /></button>
        </form>
      </section>
    </div>
  );
}

export default function TournamentDetail({ tournamentId }: { tournamentId: string }) {
  const [data, setData] = useState<TournamentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await loadTournament(tournamentId);
      setData(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load tournament.");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    const { data: listener } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      listener.subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    const openFromQuery = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("join") === "1") {
        setShowJoin(true);
      }
    }, 0);
    return () => window.clearTimeout(openFromQuery);
  }, []);

  useEffect(() => {
    if (!data || !showJoin || data.viewerId) return;
    const requireLogin = window.setTimeout(() => {
      setShowJoin(false);
      setShowAuth(true);
    }, 0);
    return () => window.clearTimeout(requireLogin);
  }, [data, showJoin]);

  const activeRegistration = data?.registration && data.registration.status !== "withdrawn" ? data.registration : null;
  const tournamentStatus = data ? statusOf(data.tournament) : "closed";
  const percentage = useMemo(() => {
    if (!data) return 0;
    return Math.min(100, Math.round((data.tournament.participant_count / data.tournament.max_participants) * 100));
  }, [data]);

  function requestJoin() {
    if (!data?.viewerId) {
      setShowJoin(false);
      setShowAuth(true);
      return;
    }
    setShowJoin(true);
  }

  async function withdraw() {
    if (!data || !window.confirm("Withdraw your registration from this tournament? You can rejoin before the deadline if capacity remains.")) return;
    setWithdrawing(true);
    setError("");
    try {
      await authenticatedFetchJson(`/api/tournaments/${data.tournament.id}/join`, { method: "DELETE" });
      await refresh();
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : "Unable to withdraw.");
    } finally {
      setWithdrawing(false);
    }
  }

  if (loading && !data) {
    return <main className={styles.detailPage}><div className={styles.detailLoading}><FaTrophy /><span>CONNECTING TO ARENA...</span></div></main>;
  }

  if (!data) {
    return <main className={styles.detailPage}><div className={styles.detailError}><FaTimes /><h1>Arena unavailable</h1><p>{error}</p><Link href="/tournaments"><FaArrowLeft /> Back to tournaments</Link></div></main>;
  }

  const tournament = data.tournament;
  const canJoin = tournamentStatus === "open" && !data.isOrganizer && !activeRegistration;

  return (
    <main className={styles.detailPage}>
      <div className={styles.gridBackdrop} />
      <section className={styles.detailHero}>
        <div className={styles.detailHeroGlow} />
        <div className={styles.detailHeroInner}>
          <Link href="/tournaments" className={styles.backLink}><FaArrowLeft /> ALL TOURNAMENTS</Link>
          <div className={styles.detailHeroGrid}>
            <div>
              <div className={styles.detailBadges}>
                <span className={`${styles.statusBadge} ${styles[`status_${tournamentStatus}`]}`}><i /> {tournamentStatus}</span>
                {tournament.is_verified ? <span className={styles.verifiedBadge}><FaCheckCircle /> Verified arena</span> : null}
                {data.isOrganizer ? <span className={styles.organizerBadge}><FaUserShield /> Organizer console</span> : null}
              </div>
              <p className={styles.heroKicker}>{tournament.game_title} · {tournament.game_mode}</p>
              <h1>{tournament.title}</h1>
              <p className={styles.detailIntro}>{tournament.description}</p>
              <div className={styles.detailMeta}>
                <span><FaCalendarAlt /><small>STARTS</small><strong>{formatDate(tournament.starts_at)}</strong></span>
                <span><FaGlobeAsia /><small>REGION</small><strong>{tournament.region}</strong></span>
                <span><FaGamepad /><small>PLATFORM</small><strong>{tournament.platform}</strong></span>
              </div>
            </div>
            <div className={styles.detailEmblem}><div><FaTrophy /><span>CP ARENA</span></div></div>
          </div>
        </div>
      </section>

      <section className={styles.detailLayout}>
        <div className={styles.detailMain}>
          <div className={styles.detailPanel}>
            <header><div><p className={styles.eyebrow}>COMPETITION INTEL</p><h2>Tournament overview</h2></div><span><FaShieldAlt /> Account-protected</span></header>
            <div className={styles.intelGrid}>
              <div><FaTrophy /><span>Format</span><strong>{FORMAT_LABELS[tournament.tournament_format]}</strong></div>
              <div><FaUsers /><span>Entry type</span><strong>{tournament.team_size === 1 ? "Solo" : `${tournament.team_size}-player team`}</strong></div>
              <div><FaMedal /><span>Skill level</span><strong>{SKILL_LABELS[tournament.skill_level]}</strong></div>
              <div><FaLock /><span>Entry fee</span><strong>{formatMoney(tournament.entry_fee, tournament.currency)}</strong></div>
            </div>
          </div>

          <div className={styles.detailPanel}>
            <header><div><p className={styles.eyebrow}>RULEBOOK</p><h2>Rules & requirements</h2></div><span>Published by organizer</span></header>
            <div className={styles.rulesText}>{tournament.rules.split("\n").map((line, index) => <p key={`${line}-${index}`}>{line || "\u00A0"}</p>)}</div>
          </div>

          <div className={styles.detailPanel}>
            <header><div><p className={styles.eyebrow}>ORGANIZER</p><h2>Hosted by {tournament.organizer_name}</h2></div>{tournament.is_verified ? <span><FaCheckCircle /> Verified</span> : null}</header>
            <div className={styles.organizerProfile}>
              <div>{tournament.organizer_name.slice(0, 1).toUpperCase()}</div>
              <p><strong>{tournament.organizer_name}</strong><span>ComePlayers community organizer</span></p>
              <small><FaShieldAlt /> Registration details are shared only with this organizer.</small>
            </div>
          </div>

          {data.isOrganizer ? (
            <div className={styles.detailPanel}>
              <header><div><p className={styles.eyebrow}>ROSTER CONTROL</p><h2>Registered participants</h2></div><span>{data.participants.filter((item) => item.status !== "withdrawn").length} active</span></header>
              {data.participants.length ? (
                <div className={styles.participantTable}>
                  <div className={styles.participantHead}><span>Player</span><span>Entry</span><span>Contact</span><span>Status</span></div>
                  {data.participants.map((participant) => (
                    <div key={participant.id} className={styles.participantRow}>
                      <span><i>{participant.player_name.slice(0, 1).toUpperCase()}</i><strong>{participant.player_name}</strong><small>{participant.game_username}</small></span>
                      <span>{participant.team_name || "Solo"}</span>
                      <span>{participant.contact_handle || "Not provided"}</span>
                      <span className={styles.participantStatus}>{participant.status.replace("_", " ")}</span>
                    </div>
                  ))}
                </div>
              ) : <div className={styles.rosterEmpty}><FaUsers /><p>No player registrations yet.</p></div>}
            </div>
          ) : null}
        </div>

        <aside className={styles.registrationCard}>
          <div className={styles.registrationTop}><p>PRIZE POOL</p><strong>{formatMoney(tournament.prize_pool, tournament.currency)}</strong><span>Hosted competition reward</span></div>
          <div className={styles.registrationTimer}><span><FaClock /> REGISTRATION WINDOW</span><strong>{remainingTime(tournament.registration_deadline, now)}</strong><small>Closes {formatDate(tournament.registration_deadline)}</small></div>
          <div className={styles.registrationCapacity}>
            <div><span>ARENA CAPACITY</span><strong>{tournament.participant_count} / {tournament.max_participants}</strong></div>
            <div><i style={{ width: `${percentage}%` }} /></div>
            <small>{tournament.max_participants - tournament.participant_count} slots remaining</small>
          </div>

          {activeRegistration ? (
            <div className={styles.joinedState}><div><FaCheck /></div><strong>YOU&apos;RE IN</strong><span>Registered as {activeRegistration.game_username}</span><small>{activeRegistration.team_name || "Solo entry"}</small></div>
          ) : null}
          {data.isOrganizer ? <div className={styles.joinedState}><div><FaUserShield /></div><strong>ORGANIZER MODE</strong><span>You host this arena.</span><small>Player details appear in Roster Control.</small></div> : null}

          {canJoin ? <button type="button" className={styles.primaryJoin} onClick={requestJoin}><FaBolt /> JOIN NOW</button> : null}
          {!canJoin && !activeRegistration && !data.isOrganizer ? <button type="button" className={styles.closedJoin} disabled>{tournamentStatus === "full" ? "ARENA FULL" : tournamentStatus === "live" ? "MATCH IN PROGRESS" : "REGISTRATION CLOSED"}</button> : null}
          {activeRegistration ? <button type="button" className={styles.withdrawButton} disabled={withdrawing} onClick={() => void withdraw()}>{withdrawing ? "WITHDRAWING..." : "WITHDRAW REGISTRATION"}</button> : null}
          <div className={styles.registrationTrust}><FaShieldAlt /><p><strong>Protected by ComePlayers</strong><span>Capacity, deadlines, and duplicate entries are enforced automatically.</span></p></div>
          {error ? <div className={styles.formError}>{error}</div> : null}
        </aside>
      </section>

      <JoinModal open={showJoin && canJoin && Boolean(data.viewerId)} tournament={tournament} onClose={() => setShowJoin(false)} onJoined={refresh} />
      <AuthModal open={showAuth} initialMode="login" onClose={() => setShowAuth(false)} />
    </main>
  );
}
