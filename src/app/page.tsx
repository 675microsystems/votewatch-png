import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { DashboardView } from "@/components/DashboardView";
import { Badge } from "@/components/ui";
import { supabaseConfigured } from "@/lib/env";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const configured = supabaseConfigured();
  const viewer = configured ? await getViewer() : undefined;
  const { team } = await searchParams;

  // Signed-in candidates and team admins: the homepage is their live dashboard.
  if (viewer?.signedIn && (viewer.isLeader || (viewer.isAdmin && team))) {
    return (
      <>
        <Header viewer={viewer} />
        <main className="wide"><DashboardView viewer={viewer} viewTeam={team} /></main>
      </>
    );
  }

  // Signed in, but no approved team yet (pending registration, scrutineer-only, or platform admin).
  if (viewer?.signedIn) {
    return (
      <>
        <Header viewer={viewer} />
        <main>
          <section className="welcome c">
            <p className="kicker">Welcome{viewer.email ? `, ${viewer.email}` : ""}</p>
            {viewer.isAdmin ? (
              <>
                <h1>Platform administration</h1>
                <p className="note">Approve candidate teams, manage elections and locations, and review the audit log.</p>
                <p><Link className="btn p" href="/admin">Open the admin console</Link></p>
              </>
            ) : viewer.registration ? (
              <>
                <h1>Your registration is <Badge value={viewer.registration} /></h1>
                <p className="note">Your live dashboard appears here as soon as an administrator approves your team. Sign in again later to see the result.</p>
                <p><Link className="btn" href="/register">View my registration</Link></p>
              </>
            ) : (
              <>
                <h1>Register your candidacy</h1>
                <p className="note">Once an administrator approves your team, this page becomes your live dashboard.</p>
                <p><Link className="btn p" href="/register">Register as a candidate</Link></p>
              </>
            )}
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <Header viewer={viewer} />
      <main>
        {!configured && <SetupNotice />}
        <section className="hero">
          <div>
            <p className="kicker">Independent tallies for candidate teams</p>
            <h1>Your own tally, live from every polling place.</h1>
            <p className="lede">
              Scrutineers record votes on the Android app, even offline. Candidates and team admins see the combined
              picture here by province, district, LLG, ward and polling place, and compare it with the figures announced
              by the Electoral Commission.
            </p>
            <p className="cta">
              <Link className="btn p lg" href="/signup">Register as a candidate</Link>
              <Link className="btn lg" href="/login">Sign in</Link>
            </p>
          </div>
          <div className="hero-art">
            <Image src="/mark.png" alt="VoteWatch PNG: an eye with a ballot check, topped by a bird of paradise" width={900} height={470} priority />
          </div>
        </section>
        <div className="notice">
          This is a campaign-side tool. Figures are your team&apos;s own unofficial tallies and are <b>not election results</b>.
          Official figures are the Electoral Commission&apos;s.
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
