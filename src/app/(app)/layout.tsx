import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEntry } from "@/lib/picks";
import { deadlinePassed } from "@/lib/config";
import AppChrome from "@/components/AppChrome";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const entry = await getEntry(user.id);

  return (
    <AppChrome
      displayName={user.displayName}
      locked={!!entry?.locked}
      deadlinePassed={deadlinePassed()}
    >
      {children}
    </AppChrome>
  );
}
