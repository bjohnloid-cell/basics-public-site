# BASICS public website

This folder is the complete Vercel website. Its public homepage matches the locally hosted Barangay Uyong homepage design and remains a static public-facing frontend; visitors can submit certificate requests but cannot read submitted records. The Laravel public homepage separately provides the public concern form. This folder does not contain the Laravel staff application or resident database.

## Supabase setup

1. Create a Supabase project and run [`supabase/public-site.sql`](supabase/public-site.sql) in its SQL Editor. If you already set up the public site, run the updated SQL file again to add the public concern and certificate request inboxes. Public users can only submit these records; only the Laravel service-role key can read or update them.
2. In this folder's `config.js`, set `supabaseUrl` to the project URL and `supabaseAnonKey` to the project's **publishable/anon** key. That key is used by the public page and must have read-only access under the supplied row-level security policy.
3. In the local Laravel `.env` file, set `SUPABASE_PUBLIC_URL` to the same project URL and `SUPABASE_PUBLIC_SERVICE_ROLE_KEY` to the project's **secret** key. The app sends modern `sb_secret_...` keys only in the `apikey` header; legacy `service_role` JWT keys are also supported. Never put this secret in `config.js`, GitHub, or Vercel.
4. Run `php artisan basics:sync-public-site` from the Laravel project to publish the initial public-only snapshot.

Selecting an available certificate on the Vercel site opens a request form that submits to `public_certificate_request_inbox`. The Laravel homepage's concern form submits to `public_concerns`. The Laravel dashboard imports new certificate requests into its `certificate_requests` list, and new concerns and requests appear in the notification bell. Public requests are reviewed and approved in the staff certificate request page. Never expose the service-role key in this static site.

The local application synchronizes published announcements, barangay contact details, and active staff names/positions when those records change. It does not send resident records, resident emails, ID images, staff contact numbers, login data, or certificate/blotter data. Announcement images are copied into a public Supabase Storage bucket.

## GitHub and Vercel

Create a separate GitHub repository containing **only the files in this folder**. Do not upload the Laravel project root or `.env` files. Import that repository into Vercel as a static site; no build command is required. The HTML reads public content directly from Supabase and checks for updates once per minute, so announcement changes do not require a Vercel redeploy.

If an update cannot reach Supabase, the local change remains saved and the staff page reports the sync problem. After resolving the connection/configuration, run `php artisan basics:sync-public-site` to retry the complete public snapshot.
