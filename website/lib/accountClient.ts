"use client";
import { supabase } from "./supabase";
export async function accountRequest<T>(path: string, body?: Record<string, unknown>, method = "POST"): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in to continue.");
  const response = await fetch(path, { method: body ? method : "GET", headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The account request failed.");
  return result as T;
}
