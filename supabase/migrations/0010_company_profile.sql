-- Sendves phase 10: company profile.
-- Run AFTER 0009, in the Supabase SQL editor (or `supabase db push`). Safe to run more than once.
--
-- The details a campaign depends on now live in Settings, so the editor can pick them up automatically:
--   logo            workspaces.email_logo_*      (already there; Settings is now the place to set it)
--   address         workspaces.business_address  (kept as the one-line text every email footer uses;
--                                                 Settings builds it from the structured parts below)
--   everything else new columns below.

alter table public.workspaces
  add column if not exists company_website text check (company_website is null or char_length(company_website) <= 300),
  add column if not exists company_email text check (company_email is null or char_length(company_email) <= 254),
  add column if not exists company_phone text check (company_phone is null or char_length(company_phone) <= 40),
  add column if not exists address_line1 text check (address_line1 is null or char_length(address_line1) <= 120),
  add column if not exists address_line2 text check (address_line2 is null or char_length(address_line2) <= 120),
  add column if not exists address_city text check (address_city is null or char_length(address_city) <= 80),
  add column if not exists address_region text check (address_region is null or char_length(address_region) <= 80),
  add column if not exists address_postal_code text check (address_postal_code is null or char_length(address_postal_code) <= 20),
  add column if not exists address_country text check (address_country is null or char_length(address_country) <= 80),
  -- The colour new campaigns start with (buttons, links). Null means the Sendves default.
  add column if not exists brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  -- The footer line new campaigns start with ("You're receiving this because ..."). Null means the default sentence.
  add column if not exists email_footer_text text check (email_footer_text is null or char_length(email_footer_text) <= 500);
