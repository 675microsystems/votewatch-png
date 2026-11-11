import { redirect } from "next/navigation";

// The dashboard now lives on the homepage; this keeps old links and bookmarks working.
export const dynamic = "force-dynamic";

export default async function DashboardRedirect({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const { team } = await searchParams;
  redirect(team ? "/?team=" + encodeURIComponent(team) : "/");
}
