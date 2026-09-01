-- Editable OPCR document header (title + office + commitment lines).
-- Run once in Supabase SQL Editor. Safe to re-run.

alter table public.opcr_forms
  add column if not exists header_title text not null default '';

alter table public.opcr_forms
  add column if not exists header_office_line text not null default '';

alter table public.opcr_forms
  add column if not exists header_commitment_line text not null default '';
