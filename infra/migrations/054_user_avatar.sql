ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data text;
ALTER TABLE users ADD CONSTRAINT users_avatar_data_bounded CHECK (avatar_data IS NULL OR (length(avatar_data) <= 88000 AND avatar_data LIKE 'data:image/jpeg;base64,%'));
