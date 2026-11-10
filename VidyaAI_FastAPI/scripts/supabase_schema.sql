-- Legacy manual migration for EXISTING databases only.
-- For a FRESH empty Supabase project, run instead on your server:
--   cd backend && python scripts/init_db.py
--
-- Run one statement at a time in SQL Editor if you see upstream timeout.

ALTER TABLE users ADD COLUMN IF NOT EXISTS access_role_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(30);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS default_access_role_id INTEGER;

ALTER TABLE books ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0;
ALTER TABLE books ADD COLUMN IF NOT EXISTS processing_message VARCHAR(255);
ALTER TABLE books ADD COLUMN IF NOT EXISTS total_pdf_pages INTEGER;

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS pdf_start_page INTEGER;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS pdf_end_page INTEGER;
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS source_file_path VARCHAR(500);
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS source_file_type VARCHAR(20);
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS source_chapter_number INTEGER;

ALTER TABLE demo_leads ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'new';
ALTER TABLE demo_leads ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cycle VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS board VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS enrolled_school_name VARCHAR(255);
ALTER TABLE student_leads ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20);
ALTER TABLE student_leads ADD COLUMN IF NOT EXISTS parent_name VARCHAR(255);
ALTER TABLE student_leads ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(30);
ALTER TABLE student_leads ADD COLUMN IF NOT EXISTS school_name VARCHAR(255);
ALTER TABLE student_leads ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE student_leads ADD COLUMN IF NOT EXISTS board VARCHAR(40);

CREATE TABLE IF NOT EXISTS student_leads (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30) NOT NULL,
    class_grade INTEGER,
    plan_id VARCHAR(40),
    status VARCHAR(30) NOT NULL DEFAULT 'registered',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    user_id INTEGER REFERENCES users(id),
    admin_notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS ix_student_leads_email ON student_leads (email);
CREATE INDEX IF NOT EXISTS ix_student_leads_status ON student_leads (status);

CREATE TABLE IF NOT EXISTS email_otps (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    purpose VARCHAR(40) NOT NULL DEFAULT 'register',
    code_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS ix_email_otps_email ON email_otps (email);

ALTER TABLE lecture_visual_frames ADD COLUMN IF NOT EXISTS book_page_number INTEGER;
ALTER TABLE lecture_visual_frames ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'generated';

-- Parent portal: links parents to students for performance tracking
CREATE TABLE IF NOT EXISTS parent_student_links (
    id SERIAL PRIMARY KEY,
    parent_id INTEGER NOT NULL REFERENCES users(id),
    student_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    CONSTRAINT uq_parent_student UNIQUE (parent_id, student_id)
);
CREATE INDEX IF NOT EXISTS ix_parent_student_links_parent_id ON parent_student_links (parent_id);
CREATE INDEX IF NOT EXISTS ix_parent_student_links_student_id ON parent_student_links (student_id);

CREATE TABLE IF NOT EXISTS processing_jobs (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL,
    book_id INTEGER NOT NULL,
    payload TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS ix_processing_jobs_status ON processing_jobs (status);
CREATE INDEX IF NOT EXISTS ix_processing_jobs_book_id ON processing_jobs (book_id);
