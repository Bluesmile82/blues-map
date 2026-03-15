-- Fix duplicate default lists and add unique constraint

-- First, keep only the oldest default list per user and set others to non-default
WITH ranked_lists AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) as rn
  FROM lists
  WHERE is_default = true
)
UPDATE lists
SET is_default = false
WHERE id IN (
  SELECT id FROM ranked_lists WHERE rn > 1
);

-- Add a unique constraint to prevent future duplicates
-- This uses a partial unique index (only applies where is_default is true)
CREATE UNIQUE INDEX lists_unique_default_per_user
  ON lists (user_id)
  WHERE is_default = true;

-- Optional: Verify no duplicates exist after the fix
-- Run this query to check:
-- SELECT user_id, COUNT(*)
-- FROM lists
-- WHERE is_default = true
-- GROUP BY user_id
-- HAVING COUNT(*) > 1;
-- Should return 0 rows

-- Optional: Show you how many defaults each user has now
-- SELECT user_id, COUNT(*) as default_count
-- FROM lists
-- WHERE is_default = true
-- GROUP BY user_id;
