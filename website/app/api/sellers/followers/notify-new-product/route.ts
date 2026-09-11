import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function productUrl(product: { id: number; slug: string | null }) {
  return `/product/${product.slug || product.id}`;
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const accessToken = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const productId = Number(body.productId);

    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid productId." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !userData.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized seller request." },
        { status: 401 }
      );
    }

    const sellerId = userData.user.id;

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id,title,slug,seller_id,seller,seller_name,game_name,category")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      return NextResponse.json(
        { success: false, error: productError.message },
        { status: 500 }
      );
    }

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found." },
        { status: 404 }
      );
    }

    if (product.seller_id !== sellerId) {
      return NextResponse.json(
        { success: false, error: "Product does not belong to this seller." },
        { status: 403 }
      );
    }

    const { data: followers, error: followersError } = await supabaseAdmin
      .from("seller_followers")
      .select("follower_id")
      .eq("seller_id", sellerId);

    if (followersError) {
      return NextResponse.json(
        { success: false, error: followersError.message },
        { status: 500 }
      );
    }

    const followerIds = Array.from(
      new Set(
        (followers || [])
          .map((row: { follower_id: string | null }) => row.follower_id)
          .filter((id): id is string => Boolean(id && id !== sellerId))
      )
    );

    if (followerIds.length === 0) {
      return NextResponse.json({ success: true, inserted: 0 });
    }

    const sellerName =
      product.seller_name || product.seller || "A seller you follow";
    const gameText = product.game_name ? ` for ${product.game_name}` : "";

    const notifications = followerIds.map((userId) => ({
      user_id: userId,
      type: "followed_seller_new_product",
      title: "New product from a seller you follow",
      message: `${sellerName} listed ${product.title}${gameText}.`,
      link_url: productUrl(product),
      is_read: false,
    }));

    const { error: notificationError } = await supabaseAdmin
      .from("notifications")
      .insert(notifications);

    if (notificationError) {
      return NextResponse.json(
        { success: false, error: notificationError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inserted: notifications.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected notification error.";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
