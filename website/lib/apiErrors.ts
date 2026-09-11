type ErrorLike = {
  message?: unknown;
  status?: unknown;
};

const INTERNAL_ERROR_PATTERN =
  /(?:pgrst\d+|postgrest|postgres|sqlstate|schema cache|relation\s+.+\s+does not exist|column\s+.+\s+does not exist|duplicate key|violates?\s+.+\s+constraint|null value in column|invalid input syntax|syntax error|type uuid|\brpc\b|supabase|service[_ -]?role|econn(?:refused|reset)|enotfound|fetch failed|environment variable|next_public_|supabase_|paypal_client_|stack trace)/i;

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.trim();

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as ErrorLike).message || "").trim();
    return message;
  }

  return "";
}

export function getExplicitErrorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;

  const status = Number((error as ErrorLike).status);
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : null;
}

export function safeApiErrorMessage(
  error: unknown,
  fallback: string,
  status: number,
) {
  const message = getErrorMessage(error);

  if (!message || status >= 500 || message.length > 300) return fallback;
  if (INTERNAL_ERROR_PATTERN.test(message)) return fallback;

  return message;
}
