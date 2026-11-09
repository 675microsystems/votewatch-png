import Link from "next/link";
import Image from "next/image";
import type { Viewer } from "@/lib/viewer";

export function Header({ viewer }: { viewer?: Viewer }) {
  const v = viewer;
  return (
    <header className="top">
      <Link className="brand" href="/" aria-label="VoteWatch PNG home">
        <Image src="/mark.png" alt="" width={720} height={438} priority style={{ height: 34, width: "auto" }} />
        <span>Vote<span className="w">Watch</span></span>
        <span className="s">PNG</span>
      </Link>
      <nav className="nav">
        {v?.signedIn ? (
          <>
            {v.isAdmin && <Link className="btn" href="/admin">Admin</Link>}
            {v.isLeader && <Link className="btn" href="/team">Team</Link>}
            {(v.isLeader || v.isAdmin) && <Link className="btn" href="/dashboard">Dashboard</Link>}
            {!v.isLeader && !v.isAdmin && <Link className="btn" href="/register">{v.registration ? "My registration" : "Register as candidate"}</Link>}
            <form action="/auth/signout" method="post" style={{ margin: 0 }}>
              <button type="submit">Sign out</button>
            </form>
          </>
        ) : (
          <>
            <Link className="btn" href="/signup">Create account</Link>
            <Link className="btn p" href="/login">Sign in</Link>
          </>
        )}
      </nav>
    </header>
  );
}
