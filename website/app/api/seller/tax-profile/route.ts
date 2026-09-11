import { NextResponse } from "next/server";
import { requireApprovedSeller, sellerErrorStatus } from "@/lib/sellerSecurity";
import { encryptTaxIdentifier } from "@/lib/taxResidencyCrypto";

function clean(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

const safeColumns = "seller_id,country_code,legal_name,tax_identifier_last4,residency_since,evidence_reference,status,submitted_at,verified_by,verified_at,rejected_by,rejected_at,rejection_reason,metadata,updated_at";

export async function GET(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const { data, error } = await supabaseAdmin
      .from("seller_tax_residencies")
      .select(safeColumns)
      .eq("seller_id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ taxResidency: data || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load tax residency.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const countryCode = clean(body.countryCode, 2).toUpperCase();
    const legalName = clean(body.legalName, 180);
    const taxIdentifier = clean(body.taxIdentifier, 100);
    const residencySince = clean(body.residencySince, 10);
    const evidenceReference = clean(body.evidenceReference, 500);

    if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error("A valid two-letter tax country is required.");
    if (legalName.length < 2) throw new Error("Legal name is required.");
    if (residencySince && !/^\d{4}-\d{2}-\d{2}$/.test(residencySince)) throw new Error("Residency date must use YYYY-MM-DD.");
    if (!evidenceReference) throw new Error("Tax residency evidence reference is required.");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("seller_tax_residencies")
      .select("seller_id,tax_identifier_ciphertext,tax_identifier_iv,tax_identifier_auth_tag,tax_identifier_key_version,tax_identifier_last4")
      .eq("seller_id", user.id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing && !taxIdentifier) throw new Error("Tax identifier is required for the first submission.");

    const encrypted = taxIdentifier ? encryptTaxIdentifier(taxIdentifier) : null;
    const now = new Date().toISOString();
    const payload = {
      seller_id: user.id,
      country_code: countryCode,
      legal_name: legalName,
      tax_identifier_last4: encrypted?.last4 || existing?.tax_identifier_last4 || null,
      tax_identifier_ciphertext: encrypted?.ciphertext || existing?.tax_identifier_ciphertext || null,
      tax_identifier_iv: encrypted?.iv || existing?.tax_identifier_iv || null,
      tax_identifier_auth_tag: encrypted?.authTag || existing?.tax_identifier_auth_tag || null,
      tax_identifier_key_version: encrypted?.keyVersion || existing?.tax_identifier_key_version || 1,
      residency_since: residencySince || null,
      evidence_reference: evidenceReference,
      status: "pending",
      submitted_at: now,
      verified_by: null,
      verified_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      metadata: { version: "v23", resubmitted: Boolean(existing) },
      updated_at: now,
    };
    const { data, error } = await supabaseAdmin
      .from("seller_tax_residencies")
      .upsert(payload, { onConflict: "seller_id" })
      .select(safeColumns)
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ taxResidency: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save tax residency.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}
