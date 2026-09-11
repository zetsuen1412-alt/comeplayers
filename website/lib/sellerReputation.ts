export type SellerReputationInput = {
  averageRating?: number | null;
  reviewCount?: number | null;
  completedOrders?: number | null;
  activeProducts?: number | null;
  followersCount?: number | null;
  sellerStatus?: string | null;
};

export type SellerReputation = {
  score: number;
  tier: string;
  tierLabel: string;
  badge: string;
  colorClass: string;
  description: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function calculateSellerReputation(
  input: SellerReputationInput,
): SellerReputation {
  const averageRating = clamp(Number(input.averageRating || 0), 0, 5);
  const reviewCount = Math.max(0, Number(input.reviewCount || 0));
  const completedOrders = Math.max(0, Number(input.completedOrders || 0));
  const activeProducts = Math.max(0, Number(input.activeProducts || 0));
  const followersCount = Math.max(0, Number(input.followersCount || 0));
  const isApproved = input.sellerStatus === "approved";

  const ratingScore = (averageRating / 5) * 35;
  const reviewScore = clamp(reviewCount, 0, 100) * 0.18;
  const orderScore = clamp(completedOrders, 0, 250) * 0.12;
  const productScore = clamp(activeProducts, 0, 80) * 0.08;
  const followerScore = clamp(followersCount, 0, 500) * 0.02;
  const verificationScore = isApproved ? 8 : 0;

  const score = Math.round(
    clamp(
      ratingScore +
        reviewScore +
        orderScore +
        productScore +
        followerScore +
        verificationScore,
      0,
      100,
    ),
  );

  if (score >= 85) {
    return {
      score,
      tier: "elite",
      tierLabel: "Elite Seller",
      badge: "🏆",
      colorClass: "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
      description:
        "Top-tier seller with strong ratings, orders, and trust signals.",
    };
  }

  if (score >= 70) {
    return {
      score,
      tier: "trusted",
      tierLabel: "Trusted Seller",
      badge: "⭐",
      colorClass: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
      description: "Reliable seller with proven marketplace activity.",
    };
  }

  if (score >= 45) {
    return {
      score,
      tier: "verified",
      tierLabel: "Verified Seller",
      badge: "✅",
      colorClass: "border-green-400/30 bg-green-400/10 text-green-300",
      description: "Verified seller building a positive marketplace record.",
    };
  }

  return {
    score,
    tier: "growing",
    tierLabel: "Growing Seller",
    badge: "🌱",
    colorClass: "border-white/10 bg-white/[0.04] text-gray-300",
    description:
      "New or growing seller. Review product details carefully before buying.",
  };
}
