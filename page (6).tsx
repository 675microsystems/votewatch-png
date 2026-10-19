import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { supabaseConfigured } from "@/lib/env";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function Home() {
  const configured = supabaseConfigured();
  const viewer = configured ? await getViewer() : undefined;
  const home = viewer && (viewer.isLeader || viewer.isAdmin) ? (viewer.isAdmin && !viewer.isLeader ? "/admin" : "/dashboard") : "/register";
  return (
    <>
      <Header viewer={viewer} />
      <main>
        {!configured && <SetupNotice />}
        <section className="hero">
          <div>
            <h1>Your own tally, live from every polling place.</h1>
            <p>
              Scrutineers record votes on the Android app, even offline. Candidates and team admins see
              the combined picture here by province, district, LLG, ward and polling place, and compare it with the
              figures announced by the Electoral Commission.
            </p>
            <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {viewer?.signedIn ? (
                <Link className="btn p" href={home}>{home === "/register" ? "Register as a candidate" : "Open your workspace"}</Link>
              ) : (
                <>
                  <Link className="btn p" href="/signup">Register as a candidate</Link>
                  <Link className="btn" href="/login">Sign in</Link>
                </>
              )}
            </p>
          </div>
          <div className="hero-art">
            <Image src="/mark.png" alt="VoteWatch PNG: an eye with a ballot check, topped by a bird of paradise" width={900} height={548} priority />
          </div>
        </section>
        <div className="notice">
          This is a campaign-side tool. Figures are your team&apos;s own unofficial tallies and are{" "}
          <b>not election results</b>. Official figures are the Electoral Commission&apos;s.
        </div>
        <ol className="steps">
          <li><h3>Register</h3><p>Create an account and register your candidacy. An administrator checks and approves every team.</p></li>
          <li><h3>Invite scrutineers</h3><p>Issue invitation codes for up to 100 scrutineers. Each uses their own account in the Android app.</p></li>
          <li><h3>Watch results</h3><p>Totals, share, coverage and flagged records update live. Compare your tally with announced official figures.</p></li>
        </ol>
      </main>
    </>
  );
}
