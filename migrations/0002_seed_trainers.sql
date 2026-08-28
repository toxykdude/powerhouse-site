-- 0002_seed_trainers.sql — seed the evaluable trainers.
--
-- IMPORTANT: this seed must stay in sync with the slugs in
-- src/data/evaluation-trainers.ts (the API resolves trainers by slug and
-- the frontend builds trainer pages from that same list).

INSERT OR IGNORE INTO trainers (slug, name, description, photo_url) VALUES
	('harold-giraldo', 'Harold Giraldo', 'Preparador Físico', '/uploads/harold-giraldo.png'),
	('esteban-morales', 'Esteban Morales', 'Entrenador Personal PowerHouse', '/uploads/esteban-morales.png'),
	('brayan-molina', 'Brayan Molina', 'Entrenador Personal', '/uploads/brayan-molina.webp');

-- Trainer staff changes: deactivate instead of deleting to preserve
-- historical evaluations, e.g.:
--   UPDATE trainers SET active = 0 WHERE slug = 'carlos-quintero';
