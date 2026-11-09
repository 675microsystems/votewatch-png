import { legal } from "@/lib/legal";

// Shown until NEXT_PUBLIC_LEGAL_REVIEWED=true so an unreviewed draft is never mistaken for final legal text.
export function DraftBanner() {
  if (legal.reviewed) return null;
  return (
    <div className="notice" role="note">
      <b>Draft.</b> This text has not yet been reviewed by a lawyer. Fill in the operator details and have it checked
      against the law that applies to you before the service is used for a real election.
    </div>
  );
}
