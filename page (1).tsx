import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { supabaseConfigured } from "@/lib/env";
import { getViewer } from "@/lib/viewer";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  if (!supabaseConfigured()) return (<><Header /><main><SetupNotice /></main></>);
  return (
    <>
      <Header viewer={await getViewer()} />
      <main>
        <div className="login">
          <h1>Reset your password</h1>
          <p className="note">Enter your account e-mail and we will send a link to choose a new password.</p>
          <ForgotForm />
        </div>
      </main>
    </>
  );
}
