import { NextResponse } from "next/server";
import { accountApiError } from "./accountApi";
import { requireAuthenticatedUser } from "./serverSupabase";

/** Retire device-key enrollment explicitly; never silently convert a signed request. */
export async function accountMessagingUpgradeRequired(request: Request) {
  try {
    await requireAuthenticatedUser(request);
    return NextResponse.json({
      error: "Update ComePlayers to continue. Messages now sync through your account without a separate passkey.",
      code: "ACCOUNT_MESSAGES_UPDATE_REQUIRED",
      messagingMode: "account",
    }, { status: 426, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
