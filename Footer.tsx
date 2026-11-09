import Link from "next/link";

export function Footer() {
  return (
    <footer className="foot">
      <span>VoteWatch PNG is an independent campaign tool, not an official election result system.</span>
      <nav aria-label="Legal">
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
      </nav>
    </footer>
  );
}
