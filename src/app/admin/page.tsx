import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { supabaseConfigured } from "@/lib/env";
import { getViewer } from "@/lib/viewer";
import { AdminConsole } from "./AdminConsole";

export const metadata = { title: "Admin console" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!supabaseConfigured()) {
    return (<><Header /><main><SetupNotice /></main></>);
  }
  const viewer = await getViewer();
  if (!viewer.signedIn) redirect("/login?next=/admin");

  if (!viewer.isAdmin) {
    return (
      <>
        <Header viewer={viewer} />
        <main>
          <h1>Administrators only</h1>
          <p className="note">
            Your account is not a platform administrator. <Link href="/">Go to your dashboard</Link>.
          </p>
        </main>
      </>
    );
  }
  return (
    <>
      <Header viewer={viewer} />
      <main className="wide">
        <h1>Admin console</h1>
        <div className="note">
          Platform administration. Every action is enforced and audit-logged in the database, not just in this page.
        </div>
        <AdminConsole />
      </main>
    </>
  );
}
