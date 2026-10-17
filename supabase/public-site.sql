create table if not exists public.public_site_content (
    id integer primary key check (id = 1),
    payload jsonb not null,
    updated_at timestamptz not null default now()
);

alter table public.public_site_content enable row level security;

revoke all on table public.public_site_content from anon, authenticated;
grant select on table public.public_site_content to anon, authenticated;
grant all on table public.public_site_content to service_role;

drop policy if exists "Public can read public-site content" on public.public_site_content;
create policy "Public can read public-site content"
    on public.public_site_content
    for select
    to anon, authenticated
    using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'basics-public-announcements',
    'basics-public-announcements',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
