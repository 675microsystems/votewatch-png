import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/auth";
import type { RegStatus, Team } from "@/lib/types";

export type Viewer = {
  signedIn: boolean;
  email: string | null;
  isAdmin: boolean;
  isLeader: boolean; // approved candidate or team admin of at least one team
  registration: RegStatus | null; // this user's own candidate registration, if any
};

const ANON: Viewer = { signedIn: false, email: null, isAdmin: false, isLeader: false, registration: null };

export async function getViewer(): Promise<Viewer> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return ANON;
  const { data: teams } = await supabase.rpc("my_teams");
  const isLeader = ((teams ?? []) as Team[]).some(
    (t) => t.team_status === "approved" && ["candidate", "team_admin"].includes(t.member_role),
  );
  const { data: reg } = await supabase
    .from("candidate_registrations").select("status").eq("user_id", user.id).maybeSingle();
  return {
    signedIn: true,
    email: user.email ?? null,
    isAdmin: isPlatformAdmin(user),
    isLeader,
    registration: ((reg as { status?: RegStatus } | null)?.status ?? null),
  };
}
