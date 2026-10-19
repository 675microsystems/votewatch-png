import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { supabaseConfigured } from "@/lib/env";
import { safeNext } from "@/lib/safe";
import { getViewer } from "@/lib/viewer";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (!supabaseConfigured()) {
    return (<><Header /><main><SetupNotice /></main></>);
  }
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewer();
  if (viewer.signedIn) redirect(next);
  return (
    <>
      <Header viewer={viewer} />
      <main>
        <div className="login">
          <h1>Sign in</h1>
          <p className="note">Candidates, team admins and administrators sign in here. Scrutineers use the Android app.</p>
          {sp.error && <div className="notice" role="alert">{sp.error}</div>}
          <LoginForm next={next} />
        </div>
      </main>
    </>
  );
}
