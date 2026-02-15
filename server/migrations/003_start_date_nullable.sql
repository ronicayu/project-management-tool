-- Allow start_date to be NULL when not yet decided.

ALTER TABLE tasks ALTER COLUMN start_date DROP NOT NULL;
