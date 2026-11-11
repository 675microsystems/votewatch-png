export function SetupNotice() {
  return (
    <div className="notice">
      <b>Setup needed.</b> Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (copy <code>.env.example</code> to <code>.env.local</code>
      locally, or add them in Vercel &gt; Project Settings &gt; Environment Variables), then redeploy.
    </div>
  );
}
