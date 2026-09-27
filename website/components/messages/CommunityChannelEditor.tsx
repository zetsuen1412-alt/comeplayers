"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import type { CommunityBundle, CommunityChannel } from "./CommunityChannelSidebar";

export type ChannelEditorTarget = { kind: "channel"; channel?: CommunityChannel; categoryId?: string } | { kind: "category" };

export default function CommunityChannelEditor({ bundle, target, onClose, onSaved }: {
  bundle: CommunityBundle;
  target: ChannelEditorTarget;
  onClose: () => void;
  onSaved: (channel?: CommunityChannel) => void;
}) {
  const channel = target.kind === "channel" ? target.channel : undefined;
  const category = target.kind === "category";
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(channel?.name || "");
  const [topic, setTopic] = useState(channel?.topic || "");
  const [type, setType] = useState<CommunityChannel["channel_type"]>(channel?.channel_type || "text");
  const [categoryId, setCategoryId] = useState(channel?.category_id || (target.kind === "channel" ? target.categoryId : "") || "");
  const [isPrivate, setPrivate] = useState(Boolean(channel?.is_private));
  const [isReadOnly, setReadOnly] = useState(Boolean(channel?.is_read_only));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const title = category ? "Create category" : channel ? "Channel settings" : "Create channel";

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const base = `/api/messages/communities/${bundle.community.id}`;
      const result = await authenticatedFetchJson<{ channel?: CommunityChannel }>(
        category ? `${base}/categories` : `${base}/channels${channel ? `/${channel.id}` : ""}`,
        {
          method: channel ? "PATCH" : "POST",
          body: JSON.stringify(category ? { name: name.trim() } : {
            name: name.trim(), topic: topic.trim(), type, categoryId: categoryId || null,
            isPrivate, isReadOnly: type === "announcement" || isReadOnly,
          }),
        },
      );
      onSaved(result.channel);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save. Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const inputClass = "mt-1 w-full rounded-xl border border-white/15 bg-[#101c2c] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20";
  return (
    <dialog ref={dialog} aria-labelledby="channel-editor-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0b1422] p-6 text-gray-200 shadow-2xl backdrop:bg-black/75">
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div><p className="text-xs font-bold uppercase tracking-widest text-cyan-300">{bundle.community.name}</p><h2 id="channel-editor-title" className="mt-2 text-xl font-bold text-white">{title}</h2></div>
        <label className="block text-sm">{category ? "Category name" : "Channel name"}
          <input autoFocus required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder={category ? "GAMING" : "squad-chat"} />
        </label>
        {!category ? <>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Channel type<select disabled={Boolean(channel)} value={type} onChange={(event) => setType(event.target.value as CommunityChannel["channel_type"])} className={inputClass}>
              <option value="text">Text chat</option><option value="voice">Voice lobby</option><option value="announcement">Announcements</option>
            </select></label>
            <label className="text-sm">Category<select aria-label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputClass}>
              <option value="">Uncategorized</option>{bundle.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
          </div>
          <label className="block text-sm">Topic <span className="text-gray-400">(optional)</span>
            <textarea maxLength={500} rows={3} value={topic} onChange={(event) => setTopic(event.target.value)} className={inputClass} placeholder="What can members discuss here?" />
            <span className="mt-1 block text-right text-xs text-gray-400">{topic.length}/500</span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3 text-sm">
            <input type="checkbox" checked={isPrivate} onChange={(event) => setPrivate(event.target.checked)} className="mt-1 accent-cyan-400" />
            <span>Private channel<span className="mt-1 block text-xs leading-5 text-gray-400">Visible to the owner, admins, and members granted private-channel access.</span></span>
          </label>
          {type !== "voice" ? <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3 text-sm">
            <input type="checkbox" checked={type === "announcement" || isReadOnly} disabled={type === "announcement"} onChange={(event) => setReadOnly(event.target.checked)} className="mt-1 accent-cyan-400" />
            <span>Read-only<span className="mt-1 block text-xs leading-5 text-gray-400">Only members with message management permission can post.</span></span>
          </label> : null}
        </> : null}
        {error ? <p role="alert" className="rounded-xl bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl px-4 text-sm hover:bg-white/10 disabled:opacity-50">Cancel</button>
          <button disabled={busy || !name.trim()} className="min-h-11 rounded-xl bg-cyan-300 px-5 text-sm font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">{busy ? "Saving…" : channel ? "Save changes" : "Create"}</button>
        </div>
      </form>
    </dialog>
  );
}
