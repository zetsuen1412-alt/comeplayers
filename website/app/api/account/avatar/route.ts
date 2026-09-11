import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

const AVATAR_BUCKET = "profile-avatars-public";
const MAX_AVATAR_BYTES = 400_000;
const PROFILE_SELECT = "id,email,username,full_name,avatar_url,role";

function withStatus(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function avatarSignatureMatches(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (mimeType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

async function ensureAvatarBucket(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
) {
  const { data } = await supabaseAdmin.storage.getBucket(AVATAR_BUCKET);
  if (data) return;

  const { error } = await supabaseAdmin.storage.createBucket(AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: MAX_AVATAR_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Unable to prepare avatar storage: ${error.message}`);
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({
      profile: data || {
        id: user.id,
        email: user.email || null,
        username: user.user_metadata?.username || null,
        full_name: user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        role: null,
      },
    });
  } catch (error) {
    const status = authErrorStatus(error instanceof Error ? error.message : "");
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to load the profile.", status) },
      { status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw withStatus("Choose a profile image first.", 400);
    }

    const mimeType = String(file.type || "").toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw withStatus("Profile photos must be JPEG, PNG, or WebP.", 400);
    }
    if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
      throw withStatus("Profile photos must be smaller than 400 KB.", 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!avatarSignatureMatches(bytes.slice(0, 16), mimeType)) {
      throw withStatus("The selected file is not a valid profile image.", 400);
    }

    const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const objectPath = `${user.id}/avatar.${extension}`;
    const supabaseAdmin = createSupabaseAdmin();
    await ensureAvatarBucket(supabaseAdmin);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(objectPath, bytes, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicAsset } = supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(objectPath);
    const avatarUrl = `${publicAsset.publicUrl}?v=${Date.now()}`;
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id)
      .select(PROFILE_SELECT)
      .single();
    if (profileError) throw new Error(profileError.message);

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    const explicitStatus = Number((error as { status?: number })?.status || 0);
    const status =
      explicitStatus ||
      authErrorStatus(error instanceof Error ? error.message : "");
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to update the profile photo.", status) },
      { status },
    );
  }
}
