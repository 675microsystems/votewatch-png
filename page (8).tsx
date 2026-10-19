import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { supabaseConfigured } from "@/lib/env";
import { safeNext } from "@/lib/safe";
import { getViewer } from "@/lib/viewer";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!supabaseConfigured()) return (<><Header /><main><SetupNotice /></main></>);
  const next = safeNext((await searchParams).next, "/register");
  const viewer = await getViewer();
  if (viewer.signedIn) redirect(next);
  return (
    <>
      <Header viewer={viewer} />
      <main>
        <div className="login">
          <h1>Create an account</h1>
          <p className="note">
            For candidates and their team leaders. After creating an account you can register a candidate; a platform administrator
            approves each registration before the team goes live. Scrutineers create their account in the Android app.
          </p>
          <SignupForm next={next} />
        </div>
      </main>
    </>
  );
}
