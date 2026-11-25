-- Publicly dialable barangay numbers are managed by active officials.
-- A changed or newly entered number remains inactive until explicitly confirmed.
create table if not exists barangay_contacts (
  id uuid primary key default gen_random_uuid(),
  barangay_id uuid not null references barangays(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 100),
  phone text not null check (phone ~ '^[+]?[0-9]{3,15}$' and regexp_replace(phone,'^\+','') <> '911'),
  availability text,
  is_primary boolean not null default false,
  is_active boolean not null default false,
  verified_by uuid references users(id),
  verified_at timestamptz,
  check (not is_active or (verified_by is not null and verified_at is not null))
);
create unique index if not exists one_primary_active_barangay_contact
  on barangay_contacts(barangay_id) where is_primary and is_active;
create index if not exists barangay_contacts_visible
  on barangay_contacts(barangay_id,is_active,is_primary);
alter table barangay_contacts enable row level security;
