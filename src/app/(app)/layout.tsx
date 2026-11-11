import { redirect } from "next/navigation";
import { syncIfStale } from "@/server/lazy-sync";
import { currentUser } from "@/server/session";
import { getViewer } from "@/server/viewer";

/** Everything under here needs a viewer: a signed-in person or a demo visitor. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  if (viewer.kind === "user") {
    const user = await currentUser();
    if (user) await syncIfStale(user);
  }
  return <>{children}</>;
}
