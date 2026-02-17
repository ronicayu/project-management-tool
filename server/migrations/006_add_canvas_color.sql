-- Add canvas_color column for manual sticker color on the canvas view.
-- NULL means auto-assigned from palette. Stores hex bg color e.g. '#FFF9C4'.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS canvas_color TEXT;
