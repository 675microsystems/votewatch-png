import type { User } from "@supabase/supabase-js";

// Mirrors public.is_platform_admin(): app_metadata can only be set server-side, never by the user.
// This only controls what the UI shows; every admin_* database function re-checks the JWT itself.
export const isPlatformAdmin = (user: User | null | undefined) =>
  user?.app_metadata?.platform_role === "admin";
