import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProfileView } from "@/components/profile-view";
import { profilePage } from "@/lib/pages";
import { loadLeague } from "@/server/leagues";
import { syncStatus } from "@/server/status";
import { getViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Profile" };

/**
 * A friend's profile. It is always opened through a league the viewer is in,
 * so nobody can look up a profile for someone they do not share a league with.
 */
export default async function FriendProfile({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const { userId } = await params;
  const { league: leagueId } = await searchParams;
  const viewer = (await getViewer())!;
  const id = decodeURIComponent(userId);
  if (id === viewer.id) redirect("/profile");
  const league = await loadLeague(viewer, leagueId ?? "demo");
  const page = league && profilePage(league, id, viewer.id, today());
  if (!page) notFound();
  return (
    <ProfileView
      page={page}
      viewerInitial={viewer.name.charAt(0).toUpperCase()}
      status={await syncStatus(viewer)}
      isDemo={viewer.kind === "demo"}
      backHref={leagueId ? `/league?league=${leagueId}` : "/league"}
    />
  );
}
