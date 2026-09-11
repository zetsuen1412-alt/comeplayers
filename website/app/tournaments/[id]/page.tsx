import type { Metadata } from "next";
import TournamentDetail from "@/components/tournaments/TournamentDetail";

export const metadata: Metadata = {
  title: "Tournament Arena",
  description: "Tournament details, rules, schedule, and registration on ComePlayers.",
};

type TournamentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TournamentPage({ params }: TournamentPageProps) {
  const { id } = await params;
  return <TournamentDetail tournamentId={id} />;
}
