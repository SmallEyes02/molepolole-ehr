-- =====================================================================
-- Migration 0003: seed villages/wards for the Molepolole area
-- Run after 0001_init.sql and 0002_icd_seed.sql. Safe to re-run.
-- =====================================================================

insert into villages (name, district) values
  ('Kgosing Ward', 'Kweneng'),
  ('Borakalalo Ward', 'Kweneng'),
  ('Ntsweng Ward', 'Kweneng'),
  ('Lorwana Ward', 'Kweneng'),
  ('Boiketlo Ward', 'Kweneng'),
  ('Matlhako Ward', 'Kweneng'),
  ('Magopye Ward', 'Kweneng'),
  ('Suping Ward', 'Kweneng'),
  ('Basaje Ward', 'Kweneng'),
  ('Lekgwapheng Ward', 'Kweneng'),
  ('Lentsweletau', 'Kweneng'),
  ('Mmankgodi', 'Kweneng'),
  ('Gabane', 'Kweneng'),
  ('Thamaga', 'Kweneng'),
  ('Metsimotlhabe', 'Kweneng'),
  ('Kumakwane', 'Kweneng'),
  ('Kopong', 'Kweneng'),
  ('Mogoditshane', 'Kweneng'),
  ('Other / not listed', 'Kweneng')
on conflict (name, district) do nothing;
