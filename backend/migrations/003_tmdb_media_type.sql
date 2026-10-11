-- TMDB numbers a movie and a TV show separately, so the same id can mean two different titles.
-- Existing rows keep working as movies.
ALTER TABLE films
  ADD COLUMN tmdb_media_type TEXT NOT NULL DEFAULT 'movie'
    CHECK (tmdb_media_type IN ('movie', 'tv'));

ALTER TABLE films DROP CONSTRAINT films_tmdb_id_key;
ALTER TABLE films ADD CONSTRAINT films_tmdb_media_type_id_key UNIQUE (tmdb_media_type, tmdb_id);
