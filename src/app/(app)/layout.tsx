import { redirect } from "next/navigation";
import { getViewer } from "@/server/viewer";

/** Everything under here needs a viewer: a signed-in person or a demo visitor. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  return <>{children}</>;
}
