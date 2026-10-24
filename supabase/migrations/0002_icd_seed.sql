-- =====================================================================
-- Migration 0002: seed common primary-care ICD-10 codes
-- Run this after 0001_init.sql. Safe to re-run (upsert on code).
-- =====================================================================

insert into icd_codes (code, description) values
  ('A00', 'Cholera'),
  ('A09', 'Diarrhoea and gastroenteritis of presumed infectious origin'),
  ('A15', 'Respiratory tuberculosis'),
  ('B50', 'Plasmodium falciparum malaria'),
  ('B20', 'HIV disease resulting in infectious/parasitic disease'),
  ('B24', 'HIV disease, unspecified'),
  ('E10', 'Type 1 diabetes mellitus'),
  ('E11', 'Type 2 diabetes mellitus'),
  ('I10', 'Essential (primary) hypertension'),
  ('J00', 'Acute nasopharyngitis (common cold)'),
  ('J02', 'Acute pharyngitis'),
  ('J18', 'Pneumonia, organism unspecified'),
  ('J45', 'Asthma'),
  ('K29', 'Gastritis and duodenitis'),
  ('L03', 'Cellulitis'),
  ('N39', 'Urinary tract infection, site not specified'),
  ('O26', 'Maternal care for other conditions related to pregnancy'),
  ('R50', 'Fever, unspecified'),
  ('R51', 'Headache'),
  ('T14', 'Injury, unspecified')
on conflict (code) do nothing;
