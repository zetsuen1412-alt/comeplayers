"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FaClipboardList, FaSearch, FaShieldAlt } from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

type AuditLog = {
  id: number;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
  profiles:
    | {
        email?: string | null;
        username?: string | null;
        seller_name?: string | null;
      }
    | null;
};

function adminName(log: AuditLog) {
  return (
    log.profiles?.seller_name ||
    log.profiles?.username ||
    log.profiles?.email ||
    log.admin_id
  );
}

function pretty(value: string) {
  return value.replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    async function loadLogs() {
      try {
        const response = await authenticatedFetchJson<{ logs: AuditLog[] }>(
          "/api/admin/audit-logs?limit=200"
        );
        setLogs(response.logs || []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load audit logs.");
      } finally {
        setLoading(false);
      }
    }

    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return logs;

    return logs.filter((log) =>
      [
        log.action,
        log.entity_type,
        log.entity_id || "",
        adminName(log),
        log.admin_id,
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [logs, search]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-24 text-center text-white">
        Loading security audit logs...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <section className="border-b border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.18),transparent_36%)]">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-300">
            <FaShieldAlt /> Security Boundary V4
          </p>
          <h1 className="mt-5 text-5xl font-black md:text-7xl">Admin Audit Logs</h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Review privileged changes to users, seller applications, products, wallet top-ups, and withdrawals.
          </p>
          <Link href="/admin" className="mt-7 inline-flex rounded-xl border border-cyan-400 px-5 py-3 font-black text-cyan-300">
            Back to Admin
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10">
        {error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
          <FaSearch className="text-cyan-300" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search admin, action, entity, or ID..."
            className="w-full bg-transparent outline-none placeholder:text-slate-500"
          />
        </div>

        <div className="mt-6 space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center text-slate-400">
              No audit logs found.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const expanded = expandedId === log.id;
              return (
                <article key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <button
                    onClick={() => setExpandedId(expanded ? null : log.id)}
                    className="grid w-full gap-4 text-left md:grid-cols-[1fr_1fr_auto] md:items-center"
                  >
                    <div>
                      <p className="flex items-center gap-2 font-black text-cyan-300">
                        <FaClipboardList /> {pretty(log.action)}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {pretty(log.entity_type)} {log.entity_id ? `#${log.entity_id}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="font-bold">{adminName(log)}</p>
                      <p className="mt-1 text-xs text-slate-500">{log.admin_id}</p>
                    </div>
                    <div className="text-sm text-slate-400 md:text-right">
                      {formatDate(log.created_at)}
                    </div>
                  </button>

                  {expanded ? (
                    <div className="mt-5 grid gap-4 border-t border-white/10 pt-5 xl:grid-cols-3">
                      <JsonPanel title="Before" value={log.before_data} />
                      <JsonPanel title="After" value={log.after_data} />
                      <JsonPanel title="Metadata" value={log.metadata} />
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="font-black text-cyan-300">{title}</p>
      <pre className="mt-3 max-h-72 whitespace-pre-wrap break-all text-xs text-slate-300">
        {JSON.stringify(value, null, 2) || "null"}
      </pre>
    </div>
  );
}
