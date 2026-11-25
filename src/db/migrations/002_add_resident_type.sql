-- ---------------------------------------------------------------------
-- RESIDENTS — type/category (Senior Citizen, PWD, Responder, Barangay
-- Official) and a human-readable ID code (e.g. BRC-SC-2026-0001),
-- generated at enrollment from the type + enrollment year + sequence.
-- ---------------------------------------------------------------------
alter table residents
  add column resident_type text,
  add column resident_code text unique;
