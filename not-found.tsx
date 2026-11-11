import Link from "next/link";
import { Header } from "@/components/Header";

export default function NotFound() {
  return (
    <>
      <Header />
      <main>
        <h1>Page not found</h1>
        <p className="note">That page does not exist or has moved. <Link href="/">Back to the home page</Link>.</p>
      </main>
    </>
  );
}
