import Link from "next/link";
import Image from "next/image";
import { legal } from "@/lib/legal";

export function Footer() {
  const hasContact = legal.contact && !legal.contact.startsWith("[");
  return (
    <footer className="foot">
      <div className="foot-grid">
        <div className="foot-brand">
          <Link className="brand" href="/" aria-label="VoteWatch PNG home">
            <Image src="/mark.png" alt="" width={900} height={470} />
            <span className="bname">Vote<span className="w">Watch</span></span>
            <span className="s">PNG</span>
          </Link>
          <p>Independent tallies for candidate teams. Built for Papua New Guinea&apos;s electoral environment.</p>
        </div>
        <nav aria-label="Product">
          <h4>Product</h4>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/#features">Features</Link>
          <Link href="/#dashboard">Dashboard</Link>
          <Link href="/#security">Security</Link>
        </nav>
        <nav aria-label="Legal and support">
          <h4>Legal &amp; support</h4>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of use</Link>
          {hasContact && <a href={`mailto:${legal.contact}`}>Contact support</a>}
        </nav>
      </div>
      <div className="foot-bottom">
        <span>&copy; 2026 VoteWatch PNG</span>
        <span className="foot-disc">
          VoteWatch PNG is an independent campaign tool, not an official election result system. Figures are
          unofficial tallies submitted by campaign teams. Official figures are the Electoral Commission&apos;s.
        </span>
      </div>
    </footer>
  );
}
