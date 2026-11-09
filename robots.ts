import type { MetadataRoute } from "next";

// Keep the signed-in tool out of search results; the landing page stays indexable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/team", "/register", "/reset-password", "/auth/", "/api/"] }],
  };
}
