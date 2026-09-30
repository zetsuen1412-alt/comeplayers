/** CP numbers are identifiers, not telephone numbers or numeric values. */
export function normalizeCpNumber(value: unknown): string {
  if (typeof value !== "string" || value.length > 80) return "";
  const input = value.trim();
  if (!/^[0-9 -]+$/.test(input)) return "";
  const normalized = input.replace(/[ -]/g, "");
  return /^008[0-9]{10}$/.test(normalized) ? normalized : "";
}

export type ContactIdentifier =
  | { kind: "recent" | "invalid" }
  | { kind: "cp_number" | "username"; value: string };

export function parseContactIdentifier(value: unknown): ContactIdentifier {
  if (value == null || value === "") return { kind: "recent" };
  if (typeof value !== "string" || value.length > 80) return { kind: "invalid" };
  const input = value.trim();
  if (!input) return { kind: "recent" };
  const explicitUsername = input.startsWith("@");
  const username = explicitUsername ? input.slice(1) : input;
  if (!explicitUsername) {
    const cpNumber = normalizeCpNumber(input);
    if (cpNumber) return { kind: "cp_number", value: cpNumber };
    // Never interpret an incomplete CP number or a phone number as a username.
    // Prefix a numeric username with @ to choose username lookup explicitly.
    if (/^[+0-9\s().-]+$/.test(input)) return { kind: "invalid" };
  }
  if (username.length < 2 || !/^[a-zA-Z0-9_.-]+$/.test(username)) return { kind: "invalid" };
  return { kind: "username", value: username };
}
