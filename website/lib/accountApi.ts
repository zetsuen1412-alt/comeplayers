import { NextResponse } from "next/server";
import { getExplicitErrorStatus, getErrorMessage, safeApiErrorMessage } from "./apiErrors";
export function accountApiError(error: unknown, fallback = "This action could not be completed.") {
  const message = getErrorMessage(error);
  const status = getExplicitErrorStatus(error) || (/authentication|token/i.test(message) ? 401 : 500);
  if (status >= 500) console.error(fallback, message);
  return NextResponse.json({ error: safeApiErrorMessage(error, fallback, status) }, { status, headers: { "Cache-Control": "no-store" } });
}
export function inputError(message: string, status = 400) { return Object.assign(new Error(message), { status }); }
