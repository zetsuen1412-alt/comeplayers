import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.E2E_BASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!baseUrl || !supabaseUrl || !anonKey) {
  throw new Error(
    "E2E_BASE_URL, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
  );
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;
const origin = new URL(baseUrl).origin;
const outputDir = path.resolve("playwright/.auth");
await fs.mkdir(outputDir, { recursive: true });

for (const role of ["buyer", "seller", "admin"]) {
  const prefix = `E2E_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) {
    console.warn(`Skipping ${role}: ${prefix}_EMAIL or ${prefix}_PASSWORD is missing.`);
    continue;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const session = await response.json();
  if (!response.ok || !session.access_token) {
    throw new Error(`Failed to authenticate ${role}: ${session.error_description || session.msg || response.status}`);
  }

  const storageState = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
      },
    ],
  };

  const output = path.join(outputDir, `${role}.json`);
  await fs.writeFile(output, JSON.stringify(storageState, null, 2));
  console.log(`Created ${output}`);
}
