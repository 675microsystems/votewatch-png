import Link from "next/link";
import { Header } from "@/components/Header";
import { DraftBanner } from "@/components/DraftBanner";
import { legal } from "@/lib/legal";

export const metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main>
        <h1>Privacy notice</h1>
        <DraftBanner />
        <p className="note">Last updated {legal.updated}. Operated by {legal.operator}. Contact: {legal.contact}.</p>

        <h2>What this service is</h2>
        <p>
          VoteWatch PNG lets candidate teams in Papua New Guinea collect and view their own vote tallies, counted by their own
          scrutineers at polling places. It is independent and is <b>not</b> an official election result system.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><b>Account details:</b> your name, e-mail address and password (the password is stored only as a hash by our authentication provider).</li>
          <li><b>Candidate registration:</b> candidate name, candidate type (Open or Governor), electorate, and party if you give one.</li>
          <li><b>Team membership:</b> which team you belong to and your role (candidate, team admin or scrutineer), and invitation codes you use (stored only as hashes).</li>
          <li><b>Tally records:</b> the polling place, votes for the candidate, total votes cast, any source reference or note you type, who submitted it, and when (device time and server time).</li>
          <li><b>Audit log:</b> administrative and team actions (such as approvals, removals and election status changes) with who did them and when. Failed invitation-code attempts are counted to prevent guessing.</li>
          <li><b>Technical data:</b> our hosting and database providers may log IP addresses and request metadata for security and operation.</li>
        </ul>
        <p>The app does not collect your location (GPS), contacts, photos or device identifiers.</p>

        <h2>Why we use it</h2>
        <p>
          To create and secure your account, to decide who may register as a candidate, to show each team its own tallies, to
          detect duplicate or conflicting records, and to keep an accountable history of administrative actions.
        </p>

        <h2>Who can see it</h2>
        <ul>
          <li><b>A scrutineer</b> sees only the records they submitted.</li>
          <li><b>A candidate or team admin</b> sees their own team&apos;s records, roster (names and e-mail addresses) and invitations.</li>
          <li><b>Platform administrators</b> can see registrations, teams, records and the audit log in order to run the service.</li>
          <li><b>Service providers</b> that host the website, database and authentication (currently Vercel and Supabase) process data on our behalf.</li>
        </ul>
        <p>We do not sell personal data or use it for advertising. One team cannot see another team&apos;s tallies.</p>

        <h2>How long we keep it</h2>
        <p>
          [RETENTION PERIOD: state how long registrations, tally records and the audit log are kept after an election, and
          what happens afterwards.] Tally records and the audit log are designed to be append-only so that corrections stay
          traceable, which means individual records usually cannot be edited or deleted; they can be superseded by a corrected record.
        </p>

        <h2>Your choices</h2>
        <p>
          You can ask to see, correct, or delete your account information by writing to {legal.contact}. Some records
          (tallies you submitted and audit entries) may have to be kept for the integrity of the count; where we cannot
          delete them we may remove your name from them instead, where the system allows.
        </p>

        <h2>Security</h2>
        <p>
          Access is controlled by sign-in and database-level rules, connections are encrypted, and the Android app stores its
          sign-in on the device in encrypted storage. No online service is perfectly secure; protect your password and phone.
        </p>

        <h2>Changes and contact</h2>
        <p>We will update this page when practices change. Questions: {legal.contact}. See also the <Link href="/terms">Terms of use</Link>.</p>
      </main>
    </>
  );
}
