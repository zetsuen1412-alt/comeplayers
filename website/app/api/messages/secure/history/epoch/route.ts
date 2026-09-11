import { NextResponse } from "next/server";
import { accountApiError, inputError } from "@/lib/accountApi";
import { limitedBody, privateRoom, uuid } from "@/lib/privateMessaging";
import {
  loadSecureAccounts, secureActor, secureEpochHash, verifySecureEpoch, type SecureEpoch,
} from "@/lib/secureHistoryProtocol";

const json = (value: unknown) => NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  try {
    const { user, db } = await secureActor(request), roomId = uuid(new URL(request.url).searchParams.get("roomId"));
    const { room, target } = await privateRoom(db, user.id, roomId);
    const accounts = await loadSecureAccounts(db, [user.id, target]);
    const rosters = await db.from("cp_secure_rosters").select("user_id,revision,roster,roster_hash", { count: "exact" }).in("user_id", [user.id, target]).order("revision").limit(2000);
    if (rosters.error) throw rosters.error;
    if ((rosters.count ?? 0) > 2000) throw inputError("This device authorization history is too large to synchronize safely.", 409);
    const epochs = await db.from("cp_secure_epochs").select("payload,epoch_hash,created_at", { count: "exact" }).eq("room_id", room.id).order("epoch").limit(1000);
    if (epochs.error) throw epochs.error;
    if ((epochs.count ?? 0) > 1000) throw inputError("This encrypted conversation is too large to synchronize safely.", 409);
    return json({
      accounts: [...accounts.entries()].map(([userId, value]) => ({ userId, roster: value.roster, rosterHash: value.roster_hash })),
      rosterHistory: rosters.data || [],
      epochs: (epochs.data || []).map(item => ({ epoch: item.payload, epochHash: item.epoch_hash, serverCreatedAt: item.created_at })),
    });
  } catch (error) { return accountApiError(error); }
}

export async function POST(request: Request) {
  try {
    const text = await limitedBody(request, 200000), { user, db, device } = await secureActor(request, text);
    let body: { epoch?: unknown }; try { body = JSON.parse(text); } catch { throw inputError("Invalid conversation-key request."); }
    const roomId = uuid((body.epoch as { roomId?: unknown } | undefined)?.roomId);
    const { room, target } = await privateRoom(db, user.id, roomId);
    const accounts = await loadSecureAccounts(db, [user.id, target]);
    const latest = await db.from("cp_secure_epochs").select("payload").eq("room_id", room.id).order("epoch", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw latest.error;
    const epoch = verifySecureEpoch(body.epoch, room.id, [user.id, target], accounts, latest.data?.payload as SecureEpoch | undefined);
    if (epoch.authorUserId !== user.id || epoch.authorDeviceId !== device.id) throw inputError("The signed request and key author do not match.", 403);
    const hash = secureEpochHash(epoch);
    const saved = await db.rpc("cp_secure_put_epoch", { p_actor: user.id, p_room: room.id, p_epoch: epoch, p_hash: hash });
    if (saved.error) throw inputError(/stale|roster|device changes/i.test(saved.error.message) ? "Device authorization changed. Reload the conversation keys and rotate again." : "The encrypted conversation key could not be saved.", 409);
    return json({ inserted: !!saved.data, epochHash: hash });
  } catch (error) { return accountApiError(error); }
}
