-- 0001_evaluation_schema.sql — Cloudflare D1 schema for the trainer
-- evaluation system (POST /api/evaluations).
--
-- Two tables mirroring the business spec:
--   trainers   → seeded catalog of evaluable trainers (0002_seed_trainers.sql)
--   evaluations→ one row per submitted anonymous evaluation

CREATE TABLE IF NOT EXISTS trainers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	slug TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	photo_url TEXT,
	active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evaluations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	trainer_id INTEGER NOT NULL REFERENCES trainers(id),
	empathy INTEGER NOT NULL CHECK (empathy BETWEEN 1 AND 5),
	respect INTEGER NOT NULL CHECK (respect BETWEEN 1 AND 5),
	attention INTEGER NOT NULL CHECK (attention BETWEEN 1 AND 5),
	availability INTEGER NOT NULL CHECK (availability BETWEEN 1 AND 5),
	communication INTEGER NOT NULL CHECK (communication BETWEEN 1 AND 5),
	motivation INTEGER NOT NULL CHECK (motivation BETWEEN 1 AND 5),
	technical_expertise INTEGER NOT NULL CHECK (technical_expertise BETWEEN 1 AND 5),
	personalized_guidance INTEGER NOT NULL CHECK (personalized_guidance BETWEEN 1 AND 5),
	professionalism INTEGER NOT NULL CHECK (professionalism BETWEEN 1 AND 5),
	overall_experience INTEGER NOT NULL CHECK (overall_experience BETWEEN 1 AND 5),
	recommendation TEXT NOT NULL CHECK (
		recommendation IN ('definitely_yes', 'probably_yes', 'not_sure', 'probably_no', 'definitely_no')
	),
	membership_duration TEXT CHECK (
		membership_duration IN ('less_1_month', '1_3_months', '3_6_months', '6_12_months', 'more_1_year')
		OR membership_duration IS NULL
	),
	positive_feedback TEXT,
	improvement_feedback TEXT,
	additional_comments TEXT,
	overall_score REAL NOT NULL,
	experience_score REAL NOT NULL,
	professional_score REAL NOT NULL,
	ip_hash TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_evaluations_trainer_created
	ON evaluations (trainer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_evaluations_ip_created
	ON evaluations (ip_hash, created_at);
