import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { supabaseConfigured } from "@/lib/env";
import { getViewer } from "@/lib/viewer";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  if (!supabaseConfigured()) return (<><Header /><main><SetupNotice /></main></>);
  const viewer = await getViewer();
  if (!viewer.signedIn) redirect("/forgot-password"); // arrived without a valid reset link
  return (
    <>
      <Header viewer={viewer} />
      <main>
        <div className="login">
          <h1>Choose a new password</h1>
          <ResetForm />
        </div>
      </main>
    </>
  );
}
