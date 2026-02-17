-- Add canvas position columns for the canvas/sticker view.
-- NULL means the task has not been positioned on the canvas yet.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS canvas_x DOUBLE PRECISION;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS canvas_y DOUBLE PRECISION;
