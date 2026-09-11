import { NextResponse } from "next/server";
import { accountingMonthBounds } from "@/lib/accounting";
import { requireApprovedSeller, sellerErrorStatus } from "@/lib/sellerSecurity";

function clean(value: unknown, maxLength = 100) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export async function GET(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const url = new URL(request.url);
    const statementId = clean(url.searchParams.get("statementId"), 80);
    if (statementId) {
      const { data: statement, error } = await supabaseAdmin
        .from("seller_tax_statements")
        .select("*")
        .eq("id", statementId)
        .eq("seller_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!statement) throw new Error("Tax statement not found.");
      const { data: lines, error: linesError } = await supabaseAdmin
        .from("seller_tax_statement_lines")
        .select("*")
        .eq("statement_id", statementId)
        .order("recognized_at", { ascending: true })
        .limit(5000);
      if (linesError) throw new Error(linesError.message);
      return NextResponse.json({ statement, lines: lines || [] });
    }
    const { data, error } = await supabaseAdmin
      .from("seller_tax_statements")
      .select("*")
      .eq("seller_id", user.id)
      .order("period_start", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ statements: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load tax statements.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const now = new Date();
    const defaultPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const bounds = accountingMonthBounds(clean(body.periodKey, 7) || defaultPeriod);
    const currency = clean(body.currency || "IDR", 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Statement currency is invalid.");
    const { data, error } = await supabaseAdmin.rpc("cp_generate_seller_tax_statement_v23", {
      p_seller_id: user.id,
      p_period_start: bounds.start,
      p_period_end: bounds.end,
      p_currency: currency,
      p_accounting_period_id: null,
      p_close: false,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ result: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate tax statement.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}
