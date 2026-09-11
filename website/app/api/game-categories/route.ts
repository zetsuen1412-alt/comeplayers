import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type CategoryRow = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  created_at?: string | null;
};

export async function GET() {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,slug,icon,created_at")
    .order("name", { ascending: true });

  if (error) {
    console.error("Game category query failed:", error.message);
    return NextResponse.json(
      { error: "Unable to load game categories." },
      { status: 500 },
    );
  }

  const categories = ((data || []) as CategoryRow[]).map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    icon: category.icon,
    description: "",
    href: `/games?category=${category.slug}`,
  }));

  return NextResponse.json({ categories });
}