import Link from "next/link";
import Image from "next/image";
import type { Viewer } from "@/lib/viewer";
import { ThemeToggle } from "./ThemeToggle";

export function Header({ viewer }: { viewer?: Viewer }) {
  const v = viewer;
  return (
    <header className="top">
      <Link className="brand" href="/" aria-label="VoteWatch PNG home">
        <Image src="/mark.png" alt="" width={900} height={470} priority />
        <span className="bname">Vote<span className="w">Watch</span></span>
        <span className="s">PNG</span>
      </Link>
      <nav className="nav" aria-label="Main">
        {v?.signedIn ? (
          <>
            {v.isLeader && <Link className="btn ghost" href="/">Dashboard</Link>}
            {v.isLeader && <Link className="btn ghost" href="/team">Team</Link>}
            {v.isAdmin && <Link className="btn ghost" href="/admin">Admin</Link>}
            {!v.isLeader && !v.isAdmin && <Link className="btn ghost" href="/register">{v.registration ? "My registration" : "Register as candidate"}</Link>}
            <ThemeToggle />
            <span className="avatar" title={v.email ?? undefined} aria-hidden="true">{(v.email ?? "?").charAt(0).toUpperCase()}</span>
            <form action="/auth/signout" method="post" style={{ margin: 0 }}>
              <button type="submit" className="ghost">Sign out</button>
            </form>
          </>
        ) : (
          <>
            <ThemeToggle />
            <Link className="btn ghost" href="/signup">Create account</Link>
            <Link className="btn p" href="/login">Sign in</Link>
          </>
        )}
      </nav>
    </header>
  );
}
