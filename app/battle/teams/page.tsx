import type { Metadata } from "next";
import { TeamsApp } from "./teams-app";

export const metadata: Metadata = {
  title: "My Teams",
  description: "Build, import and export Pokémon battle teams, or start from a recommended Smogon sample team.",
};

export default function TeamsPage() {
  return <TeamsApp />;
}
