import Link from "next/link";
import { Header } from "@/components/Header";
import { DraftBanner } from "@/components/DraftBanner";
import { legal } from "@/lib/legal";

export const metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <>
      <Header />
      <main>
        <h1>Terms of use</h1>
        <DraftBanner />
        <p className="note">Last updated {legal.updated}. Operated by {legal.operator}. Contact: {legal.contact}.</p>

        <h2>1. What VoteWatch PNG is</h2>
        <p>
          A tool for candidate teams to record and view their <b>own</b> tallies from polling places. It is
          <b> not</b> an official source of election results and is not connected to the Papua New Guinea Electoral Commission.
          Nothing shown here should be presented as an official or final result.
        </p>

        <h2>2. Accounts and roles</h2>
        <ul>
          <li>You must give accurate information. Candidate registrations are reviewed and may be approved or rejected.</li>
          <li>Keep your password and invitation codes private. You are responsible for activity under your account.</li>
          <li>Scrutineers join a team only with an invitation code from the candidate or a team admin, and may be removed by them.</li>
        </ul>

        <h2>3. Acceptable use</h2>
        <ul>
          <li>Record only what you actually counted or were officially given. Do not enter false, invented or altered figures.</li>
          <li>Do not try to access other teams&apos; data, guess invitation codes, overload the service or probe it for weaknesses without written permission.</li>
          <li>Do not use the service to publish results as official, to intimidate voters or officials, or to break any law.</li>
        </ul>

        <h2>4. Accuracy and responsibility for figures</h2>
        <p>
          Tallies depend on what scrutineers enter. Differences between a team&apos;s tally and official figures are a prompt to
          check count sheets, not a finding. The service is provided &ldquo;as is&rdquo;, without a promise that it is error-free
          or always available, and it may be offline or unreliable in areas with poor connectivity.
        </p>

        <h2>5. Suspension and changes</h2>
        <p>
          We may suspend or remove accounts or teams that break these terms or put the service at risk, and we record such
          actions in an audit log. We may change the service or these terms; continuing to use it means you accept the update.
        </p>

        <h2>6. Liability</h2>
        <p>[LIABILITY AND GOVERNING LAW: to be completed on legal advice for the operator&apos;s jurisdiction.]</p>

        <h2>7. Privacy and contact</h2>
        <p>How we handle personal data is in the <Link href="/privacy">Privacy notice</Link>. Questions: {legal.contact}.</p>
      </main>
    </>
  );
}
