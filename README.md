# BASICS public website

This folder is the complete Vercel website. Its public homepage matches the locally hosted Barangay Uyong homepage design and remains a static public-facing frontend. Its forms can submit concerns and certificate requests but cannot read submitted records. It does not contain the Laravel staff application or resident database.

## Supabase setup

1. Create a Supabase project and run [`supabase/public-site.sql`](supabase/public-site.sql) in its SQL Editor. Both form submissions are validated and rate-limited by Edge Functions; public users cannot read or write either submission table directly.
2. In this folder's `config.js`, set `supabaseUrl` to the project URL and `supabaseAnonKey` to the project's **publishable/anon** key. The public page uses it to read public content and call the submission Edge Functions; it is not a secret.
3. In the local Laravel `.env` file, set `SUPABASE_PUBLIC_URL` to the same project URL and `SUPABASE_PUBLIC_SERVICE_ROLE_KEY` to the project's **secret** key. The app sends modern `sb_secret_...` keys only in the `apikey` header; legacy `service_role` JWT keys are also supported. Never put this secret in `config.js`, GitHub, or Vercel.
4. Run `php artisan basics:sync-public-site` from the Laravel project to publish the initial public-only snapshot.

### Public concern replies

The public concern form requires a valid email address and only saves the concern through the `auto-reply-concern` Edge Function. It does not send an automatic email. Staff can open the Public concerns inbox in the Laravel app and choose **Reply by email** to send the prepared English response for that concern category. After the email is sent successfully, the concern is marked as reviewed. To limit abuse, each concern or certificate form accepts up to five submissions per source IP per hour, shared across the Vercel and Laravel public submission routes. The rate limiter keeps only a temporary keyed hash of the IP; concern and certificate requests use separate limits. Laravel uses its framework-resolved client IP, so configure only the reverse proxies trusted by the Laravel host; do not trust arbitrary forwarded-IP headers.

For each form separately, only the newest unprocessed request for a trimmed, case-insensitive email is kept. A new concern removes older concerns still marked `new`; a new certificate request removes older inbox entries still marked `new` or `imported` and, when Laravel imports it, older local public requests still marked `Pending`. Reviewed concerns and approved or rejected Laravel certificate requests are retained. Re-run `supabase/public-site.sql` in the Supabase SQL Editor to install the database cleanup triggers.

To enable concern submissions:

1. Apply the updated `supabase/public-site.sql` in the Supabase SQL Editor.
2. In Supabase **Edge Functions → Secrets**, set only `PUBLIC_SITE_ORIGINS` to the exact deployed Vercel website origin, such as `https://your-site.vercel.app` (no trailing slash). For multiple deployment origins, separate them with commas. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function at runtime.
3. From this `vercel-public` folder, deploy both functions with `supabase functions deploy auto-reply-concern` and `supabase functions deploy submit-public-certificate-request`. Both functions fail closed if the trusted source IP or rate-limit service is unavailable. The concern function only saves concerns; it does not require a Resend API key or sender address.
4. Redeploy the static Vercel site so the form displays the saved-only confirmation.

The function uses a unique submission ID so a browser retry after a network interruption does not create a duplicate concern. Sending the prepared reply from the Laravel inbox uses the Laravel app's configured mail transport.

Selecting an available certificate opens a request form that submits through `submit-public-certificate-request` to `public_certificate_request_inbox`; the ID number is checked against the resident record, and ID photos are not uploaded. The Laravel dashboard imports new certificate requests into its `certificate_requests` list, and new concerns and requests appear in the staff notification counts. Staff can approve a public request only after its ID number matches a resident record. Approval or rejection notices are emailed to the address entered in the request. The public form itself does not send email; the five-per-hour IP limit protects public submissions, while staff email is sent only when staff process a request. Public requests are reviewed in the staff certificate request page. Never expose the service-role key in this static site.

The local application synchronizes published announcements, barangay contact details, and active staff names/positions when those records change. It does not send resident records, resident emails, ID images, staff contact numbers, login data, or certificate/blotter data. Announcement images are copied into a public Supabase Storage bucket.

## GitHub and Vercel

Create a separate GitHub repository containing **only the files in this folder**. Do not upload the Laravel project root or `.env` files. Import that repository into Vercel as a static site; no build command is required. The HTML reads public content directly from Supabase and checks for updates once per minute, so announcement changes do not require a Vercel redeploy.

If an update cannot reach Supabase, the local change remains saved and the staff page reports the sync problem. After resolving the connection/configuration, run `php artisan basics:sync-public-site` to retry the complete public snapshot.
