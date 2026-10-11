CREATE TABLE films (
  id             BIGSERIAL PRIMARY KEY,
  title          TEXT        NOT NULL CHECK (btrim(title) <> ''),
  release_year   SMALLINT    CHECK (release_year BETWEEN 1888 AND 2100),
  letterboxd_url TEXT        UNIQUE CHECK (letterboxd_url LIKE 'http://%' OR letterboxd_url LIKE 'https://%'),
  added_at       DATE        NOT NULL DEFAULT CURRENT_DATE,
  watched_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX films_unwatched_idx ON films (id) WHERE watched_at IS NULL;
