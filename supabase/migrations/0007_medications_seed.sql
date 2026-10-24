-- =====================================================================
-- Migration 0007: seed common primary-care medications
-- Run after 0006_role_based_access.sql. Safe to re-run.
-- =====================================================================

insert into medications (name, form, strength) values
  ('Paracetamol', 'tablet', '500mg'),
  ('Ibuprofen', 'tablet', '400mg'),
  ('Amoxicillin', 'capsule', '500mg'),
  ('Amoxicillin', 'suspension', '125mg/5ml'),
  ('Metronidazole', 'tablet', '400mg'),
  ('Oral Rehydration Salts', 'sachet', '20.5g'),
  ('Artemether-Lumefantrine (Coartem)', 'tablet', '20mg/120mg'),
  ('Tenofovir-Lamivudine-Dolutegravir (TLD)', 'tablet', '300mg/300mg/50mg'),
  ('Isoniazid', 'tablet', '300mg'),
  ('Rifampicin-Isoniazid-Pyrazinamide-Ethambutol (RIPE)', 'tablet', 'fixed-dose combination'),
  ('Metformin', 'tablet', '500mg'),
  ('Amlodipine', 'tablet', '5mg'),
  ('Hydrochlorothiazide', 'tablet', '25mg'),
  ('Salbutamol inhaler', 'inhaler', '100mcg/dose'),
  ('Omeprazole', 'capsule', '20mg'),
  ('Cetirizine', 'tablet', '10mg'),
  ('Ferrous sulphate', 'tablet', '200mg'),
  ('Folic acid', 'tablet', '5mg'),
  ('Multivitamin', 'tablet', 'standard'),
  ('Chlorhexidine antiseptic', 'solution', '5% w/v')
on conflict (name, form, strength) do nothing;
