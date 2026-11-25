-- Medical notes remain the single free-form health note on a resident.
alter table residents
  drop column if exists blood_type,
  drop column if exists allergies;
