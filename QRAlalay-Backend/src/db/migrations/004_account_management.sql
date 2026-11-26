-- Metadata used by the mobile account-management and ward-profile screens.
alter table users add column if not exists position text;
alter table residents add column if not exists guardian_relationship text;
