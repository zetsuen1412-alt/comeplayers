import type { Metadata } from "next";
import TournamentHub from "@/components/tournaments/TournamentHub";

export const metadata: Metadata = {
  title: "Tournaments",
  description:
    "Discover, host, and join community gaming tournaments on ComePlayers.",
};

export default function TournamentsPage() {
  return <TournamentHub />;
}
