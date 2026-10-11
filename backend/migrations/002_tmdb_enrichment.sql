ALTER TABLE films
  ADD COLUMN tmdb_id         INTEGER UNIQUE,
  ADD COLUMN tmdb_status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (tmdb_status IN ('pending', 'matched', 'ambiguous', 'not_found', 'error')),
  ADD COLUMN tmdb_synced_at  TIMESTAMPTZ,
  ADD COLUMN original_title  TEXT,
  ADD COLUMN tagline         TEXT,
  ADD COLUMN overview        TEXT,
  ADD COLUMN runtime_minutes SMALLINT CHECK (runtime_minutes > 0),
  ADD COLUMN vote_average    NUMERIC(3, 1),
  ADD COLUMN vote_count      INTEGER,
  ADD COLUMN poster_path     TEXT,
  ADD COLUMN backdrop_path   TEXT,
  ADD COLUMN countries       TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE genres (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE film_genres (
  film_id  BIGINT  NOT NULL REFERENCES films (id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres (id),
  PRIMARY KEY (film_id, genre_id)
);
CREATE INDEX film_genres_genre_idx ON film_genres (genre_id);

CREATE TABLE people (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE film_credits (
  film_id   BIGINT   NOT NULL REFERENCES films (id) ON DELETE CASCADE,
  person_id INTEGER  NOT NULL REFERENCES people (id),
  role      TEXT     NOT NULL CHECK (role IN ('director', 'cast')),
  position  SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (film_id, person_id, role)
);
