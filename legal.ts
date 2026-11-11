// Operator details shown on the privacy notice and terms. Set these in Vercel (Production + Preview).
// NEXT_PUBLIC_LEGAL_REVIEWED=true removes the "draft" banner once a lawyer has approved the wording.
export const legal = {
  operator: process.env.NEXT_PUBLIC_OPERATOR_NAME || "[OPERATOR NAME]",
  contact: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "[CONTACT E-MAIL]",
  reviewed: process.env.NEXT_PUBLIC_LEGAL_REVIEWED === "true",
  updated: "10 November 2026",
};
