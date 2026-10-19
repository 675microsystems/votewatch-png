# Supabase authentication setup (do this before inviting anyone)

All steps are in the Supabase dashboard (online). Use your staging project first.

## 1. Site URL and redirect URLs  (Authentication > URL Configuration)
- **Site URL:** `https://YOUR-SITE.vercel.app` (later your own domain).
- **Redirect URLs:** add `https://YOUR-SITE.vercel.app/**`. Sign-up confirmation and password-reset links return to `/auth/callback`,
  so this entry must match. If you use Vercel preview deployments, also add `https://*-YOUR-TEAM.vercel.app/**`.

## 2. E-mail confirmation  (Authentication > Providers > Email)
- Recommended **ON** ("Confirm email"). The site handles both settings: with confirmation on, new users see "Check your e-mail";
  with it off, they continue straight to registration.
- Turn on **leaked password protection** and set the **minimum password length to 10** if your plan offers it (the website already requires 10).

## 3. A real e-mail sender  (Authentication > SMTP Settings)
Supabase's built-in e-mail is limited to a handful of messages per hour and is not meant for production. Without your own SMTP,
sign-up confirmations and password resets will start failing as soon as several people register. Use any transactional
provider (for example Resend, Postmark, Amazon SES, SendGrid): create an account, verify your sending domain, and paste the SMTP host,
port, username, password and a "from" address.

## 4. E-mail templates  (Authentication > Email Templates)
Keep the default links (they use `{{ .ConfirmationURL }}`). Edit only the wording. Mention VoteWatch PNG and that the message is automatic.

## 5. Rate limits  (Authentication > Rate Limits)
Keep sign-in and e-mail limits at their defaults or stricter. Also turn on **CAPTCHA protection** (Authentication > Attack Protection)
so throwaway accounts cannot be mass-created. The invitation-code claim function limits failed guesses per account (migration 008),
so account creation is the remaining way around it; see `docs/SECURITY_TEST_PLAN.md`.

## 6. Make the first administrator
Run in the SQL editor, then sign out and in again:
```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"platform_role":"admin"}' where email = 'you@example.com';
```
Never put the `service_role` key in the website, the app, GitHub or Vercel environment variables.
