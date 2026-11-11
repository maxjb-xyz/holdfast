import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileView } from "@/components/profile-view";
import { profilePage } from "@/lib/pages";
import { loadLeague } from "@/server/leagues";
import { syncStatus } from "@/server/status";
import { getViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Profile" };

export default async function OwnProfile() {
  const viewer = (await getViewer())!;
  const league = await loadLeague(viewer);
  const page = league && profilePage(league, viewer.id, viewer.id, today());
  if (!page) notFound();
  return (
    <ProfileView
      page={page}
      viewerInitial={viewer.name.charAt(0).toUpperCase()}
      status={await syncStatus(viewer)}
      isDemo={viewer.kind === "demo"}
      backHref="/league"
    />
  );
}
