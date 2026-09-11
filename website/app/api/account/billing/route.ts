import { NextResponse } from "next/server";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";
import { normalizeCountryCode } from "@/lib/tax";

function clean(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("user_billing_profiles")
      .select("legal_name,address_line_1,address_line_2,city,state,postal_code,country_code,tax_country_code,tax_identification_number,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return NextResponse.json({
      billing: data || {
        legal_name: "",
        address_line_1: "",
        address_line_2: "",
        city: "",
        state: "",
        postal_code: "",
        country_code: "ID",
        tax_country_code: "ID",
        tax_identification_number: "",
        updated_at: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load billing profile.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(message) });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as Record<string, unknown>;
    const legalName = clean(body.legalName, 160);
    const addressLine1 = clean(body.addressLine1, 200);
    const addressLine2 = clean(body.addressLine2, 200);
    const city = clean(body.city, 100);
    const state = clean(body.state, 100);
    const postalCode = clean(body.postalCode, 30);
    const countryCode = normalizeCountryCode(body.countryCode, "");
    const taxCountryCode = normalizeCountryCode(body.taxCountryCode, "");
    const taxIdentificationNumber = clean(body.taxIdentificationNumber, 80);

    if (legalName.length < 2) {
      return NextResponse.json({ error: "Legal or billing name is required." }, { status: 400 });
    }
    if (addressLine1.length < 5 || city.length < 2 || postalCode.length < 2) {
      return NextResponse.json({ error: "A complete billing address is required." }, { status: 400 });
    }
    if (!countryCode || !taxCountryCode) {
      return NextResponse.json({ error: "Valid two-letter country codes are required." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("user_billing_profiles")
      .upsert(
        {
          user_id: user.id,
          legal_name: legalName,
          address_line_1: addressLine1,
          address_line_2: addressLine2 || null,
          city,
          state: state || null,
          postal_code: postalCode,
          country_code: countryCode,
          tax_country_code: taxCountryCode,
          tax_identification_number: taxIdentificationNumber || null,
          updated_at: now,
        },
        { onConflict: "user_id" }
      )
      .select("legal_name,address_line_1,address_line_2,city,state,postal_code,country_code,tax_country_code,tax_identification_number,updated_at")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ billing: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save billing profile.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(message) });
  }
}
