import Link from "next/link";
import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { DashboardView } from "@/components/DashboardView";
import { Badge } from "@/components/ui";
import { Reveal } from "@/components/Reveal";
import { Icon, type IconName } from "@/components/Icon";
import { HeroArt } from "@/components/HeroArt";
import { CountUp } from "@/components/CountUp";
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
      <Header viewer={viewer} landing />
      <Reveal />
      <main className="lp">
        {!configured && <SetupNotice />}

        <section className="lp-hero">
          <div className="lp-hcopy">
            <p className="lp-badge"><span className="lp-dot" aria-hidden="true" />Built for Papua New Guinea&apos;s 2027 election cycle</p>
            <h1>Your own tally, <span className="grad">live from every polling place.</span></h1>
            <p className="lp-sub">
              Scrutineers record votes on the Android app, even offline. Candidates and team admins see the combined
              picture by province, district, LLG, ward and polling place, and compare it with the figures announced by
              the Electoral Commission.
            </p>
            <p className="lp-actions">
              <Link className="btn gold lg" href="/signup">Register your campaign <Icon name="arrow" /></Link>
              <Link className="btn lg" href="/#how-it-works">See how it works</Link>
            </p>
            <dl className="lp-stats">
              <div><dt>Scrutineers per team</dt><dd><CountUp to={100} /></dd></div>
              <div><dt>Levels of aggregation</dt><dd><CountUp to={5} /></dd></div>
              <div><dt>Recording</dt><dd>Offline-first</dd></div>
            </dl>
          </div>
          <HeroArt />
        </section>

        <ul className="lp-trust" aria-label="Trust signals">
          <li><Icon name="shield" />Encrypted connections</li>
          <li><Icon name="check" />Admin review for every team</li>
          <li><Icon name="phone" />Works without signal</li>
          <li><Icon name="doc" />Independent, unofficial tallies</li>
        </ul>

        <div className="notice">
          This is a campaign-side tool. Figures are your team&apos;s own unofficial tallies and are <b>not election results</b>.
          Official figures are the Electoral Commission&apos;s.
        </div>

        <section className="lp-sec" id="how-it-works">
          <header className="lp-head" data-reveal>
            <span className="lp-label">Three simple steps</span>
            <h2>From registration to real-time tally</h2>
            <p>Set up your campaign team, equip your scrutineers, and watch the numbers arrive from every polling place.</p>
          </header>
          <ol className="lp-steps">
            <li data-reveal>
              <h3>Register</h3>
              <p>Create an account and register your candidacy. An administrator checks and approves every team to keep the platform trustworthy.</p>
              <span className="lp-note">Approved by an administrator</span>
            </li>
            <li data-reveal>
              <h3>Invite scrutineers</h3>
              <p>Share an invitation code with up to 100 scrutineers. Each signs up with their own account in the Android app, with no shared logins.</p>
              <span className="lp-note">Codes expire and can be revoked</span>
            </li>
            <li data-reveal>
              <h3>Watch results</h3>
              <p>Totals, share, coverage and flagged records update live. Compare your tally with announced official figures at every level.</p>
              <span className="lp-note">Live, with a 30-second fallback</span>
            </li>
          </ol>
        </section>

        <section className="lp-sec lp-alt" id="features">
          <header className="lp-head" data-reveal>
            <span className="lp-label">Built for the field</span>
            <h2>Features that match PNG&apos;s realities</h2>
            <p>Designed for patchy connectivity, sensitive data and the speed of election day.</p>
          </header>
          <div className="bento">
            <article className="bx s3" data-reveal>
              <span className="lp-ficon"><Icon name="offline" /></span>
              <h3>Offline-first recording</h3>
              <p>Scrutineers record votes without a signal. Data is stored on the phone and syncs automatically when connectivity returns, with duplicate protection built in.</p>
              <div className="mini" aria-hidden="true">
                <div className="m-row"><span className="m-pill amber"><Icon name="offline" />No signal</span><span className="m-dim">3 saved on phone</span></div>
                {[["Ward 12 · Polling place 4", "Queued", "amber"], ["Ward 12 · Polling place 5", "Queued", "amber"], ["Ward 09 · Polling place 1", "Synced", "green"]].map(([t, st, c]) => (
                  <div className="m-row line" key={t}><span>{t}</span><span className={"m-pill " + c}>{st}</span></div>
                ))}
              </div>
            </article>
            <article className="bx s3" data-reveal>
              <span className="lp-ficon"><Icon name="layers" /></span>
              <h3>Five-level aggregation</h3>
              <p>Results roll up from polling place to ward, LLG, district and province. Drill down to see exactly where the numbers come from.</p>
              <div className="mini tree" aria-hidden="true">
                {["Province", "District", "LLG", "Ward", "Polling place"].map((t, i) => (
                  <div className="m-node" key={t} style={{ marginLeft: i * 18 }}><Icon name={i === 4 ? "pin" : "layers"} />{t}</div>
                ))}
              </div>
            </article>
            <article className="bx s2" data-reveal>
              <span className="lp-ficon"><Icon name="scale" /></span>
              <h3>Official figure comparison</h3>
              <p>See your tally next to Electoral Commission announcements, so you can spot gaps early.</p>
              <div className="mini" aria-hidden="true">
                <div className="m-bar"><small>Your tally</small><i><u style={{ width: "82%" }} className="warm" /></i></div>
                <div className="m-bar"><small>Announced</small><i><u style={{ width: "68%" }} className="cool" /></i></div>
              </div>
            </article>
            <article className="bx s2" data-reveal>
              <span className="lp-ficon"><Icon name="flag" /></span>
              <h3>Flagged records</h3>
              <p>Suspicious or duplicate submissions are flagged for review: confirm, correct or re-verify.</p>
              <div className="mini" aria-hidden="true">
                <div className="m-row line"><span>Duplicate entry</span><span className="m-pill amber">Review</span></div>
                <div className="m-row line"><span>Total over ballots issued</span><span className="m-pill amber">Review</span></div>
                <div className="m-row line"><span>Late correction</span><span className="m-pill green">Resolved</span></div>
              </div>
            </article>
            <article className="bx s2" data-reveal>
              <span className="lp-ficon"><Icon name="lock" /></span>
              <h3>Role-based access</h3>
              <p>Candidates, team admins and scrutineers see only what they should. Codes and administrator approval keep the wrong people out.</p>
              <div className="mini chips" aria-hidden="true">
                <span className="m-pill blue"><Icon name="user" />Candidate</span>
                <span className="m-pill blue"><Icon name="log" />Team admin</span>
                <span className="m-pill blue"><Icon name="phone" />Scrutineer</span>
              </div>
            </article>
            <article className="bx s6 wide" data-reveal>
              <div>
                <span className="lp-ficon"><Icon name="download" /></span>
                <h3>CSV export</h3>
                <p>Download your tally data for legal review, archiving or further analysis in Excel.</p>
              </div>
              <div className="mini file" aria-hidden="true">
                <span className="m-pill blue"><Icon name="doc" />tally-export.csv</span>
                <code>polling_place, ward, votes<br />Sample A, 12, 2410<br />Sample B, 15, 1875</code>
              </div>
            </article>
          </div>
        </section>

        <section className="lp-sec" id="dashboard">
          <header className="lp-head" data-reveal>
            <span className="lp-label">Live preview</span>
            <h2>Your command centre on election day</h2>
            <p>A lightweight dashboard built for low-bandwidth connections and fast decisions.</p>
          </header>
          <div className="lp-dash" data-reveal role="img" aria-label="Illustration of the dashboard with sample figures: tally cards and a polling place table with coverage bars">
            <div className="lp-dtop">
              <span><i className="lp-gdot" aria-hidden="true" />Sample team &mdash; sample figures</span>
              <span className="lp-sync"><Icon name="sync" />Syncing &mdash; 3 pending</span>
            </div>
            <div className="lp-dmain">
              <div className="lp-dcards">
                {([["Votes tallied", "14,280", "+1,240 today", ""], ["Coverage", "68%", "+5% since 10:00", ""], ["Flagged", "3", "Needs review", "warn"], ["EC announced", "11,950", "Last updated 11:42", "mut"]] as const).map(([l, v2, d, k]) => (
                  <div className="lp-dcard" key={l}><small>{l}</small><b>{v2}</b><em className={k}>{d}</em></div>
                ))}
              </div>
              <div className="wrap">
                <table className="left lp-table">
                  <caption className="sr">Sample polling place tally and coverage</caption>
                  <thead><tr><th scope="col">Polling place</th><th scope="col">Ward</th><th scope="col">Votes</th><th scope="col">Coverage</th><th scope="col">Status</th></tr></thead>
                  <tbody>
                    {rows.map(([name, ward, votes, cov, status, tone]) => (
                      <tr key={name}>
                        <td><strong>{name}</strong></td><td>{ward}</td><td>{votes}</td>
                        <td><span className="lp-bar" aria-label={`${cov} percent coverage`}><span className={"lp-fill " + (cov >= 80 ? "hi" : cov >= 50 ? "mid" : "lo")} style={{ width: `${cov}%` }} /></span></td>
                        <td><span className={"lp-tag " + tone}>{status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note" style={{ marginTop: 10 }}>Illustration only. All names and numbers are made up.</p>
            </div>
          </div>
        </section>

        <section className="lp-sec lp-alt" id="security">
          <header className="lp-head" data-reveal>
            <span className="lp-label">Trust &amp; safety</span>
            <h2>Your data is protected</h2>
            <p>Political data is sensitive. We treat it that way, with encrypted connections, strict access control and a full audit trail.</p>
          </header>
          <div className="lp-sgrid">
            {security.map(([ic, title, text]) => (
              <div className="lp-sitem" key={title} data-reveal>
                <Icon name={ic} /><h3>{title}</h3><p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-cta" id="register">
          <h2 data-reveal>Ready to set up your campaign team?</h2>
          <p data-reveal>Register your candidacy, invite your scrutineers, and start building your independent tally.</p>
          <p className="lp-actions" data-reveal>
            <Link className="btn lg lp-light" href="/signup">Register your team</Link>
            <Link className="btn lg lp-outline" href="/login">Sign in</Link>
          </p>
          <small>Administrator approval required. This is a campaign-side tool: figures are unofficial tallies, not election results.</small>
        </section>
      </main>
    </>
  );
}

const security: [IconName, string, string][] = [
  ["lock", "Encrypted connections", "Data travels over encrypted connections, and the Android app keeps its sign-in in encrypted device storage."],
  ["log", "Traceable records", "Submitted records are kept traceable. Mistakes are fixed with a corrected record, and admin actions are written to an audit log."],
  ["user", "Role-based access control", "Only approved team leaders see full tallies. Scrutineers submit; they don't browse other people's data."],
  ["doc", "Lawful observation only", "This tool supports scrutineers' legal role. All users must follow PNG electoral law and the code of conduct."],
];

const rows: [string, string, string, number, string, string][] = [
  ["Sample Primary", "Ward 12", "2,410", 92, "Complete", "ok"],
  ["Sample Community Hall", "Ward 15", "1,875", 78, "In progress", "ok"],
  ["Sample Youth Centre", "Ward 09", "1,320", 55, "Flagged", "flag"],
  ["Sample Station", "Ward 07", "2,040", 88, "Complete", "ok"],
  ["Sample Valley", "Ward 18", "965", 42, "Pending", "flag"],
];
