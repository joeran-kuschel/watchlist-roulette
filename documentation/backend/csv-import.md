# CSV import

Imports a Letterboxd or an IMDb watchlist export. `POST /api/films/import`, multipart form with the file in the field `file`.

## File format

Comma-separated, with a header row (columns in any order, case-insensitive, extra columns ignored). The format is told apart by the header: a file with a `Const` column (and no `Letterboxd URI`) is read as an IMDb export, anything else as a Letterboxd export. A header that fits neither is rejected (`400`) with a message naming both. The report says which one was detected (`source`: `letterboxd` or `imdb`).

### Letterboxd export

| Column | Rule |
|---|---|
| `Date` | the date added, `YYYY-MM-DD`, a real calendar date |
| `Name` | required, at most 500 characters |
| `Year` | 1888 to 2100, or empty if unknown |
| `Letterboxd URI` | required, an `http(s)` link; **identifies the film** |

### IMDb export

The file IMDb produces with **Export** on a watchlist or any list.

| Column | Rule |
|---|---|
| `Const` | the IMDb title id (`tt1234567`); **identifies the film**. If it is empty or not an id, it is taken from `URL` (`…/title/tt1234567/`) |
| `Title` | required, at most 500 characters |
| `Year` | 1888 to 2100, or empty if unknown |
| `Created` | the date added, `YYYY-MM-DD`; may be empty (see below) |
| `Title Type` | optional; rows with the type `tvEpisode` (also written `TV Episode`) are rejected, every other type (movies, series, shorts, …) is imported |

The film's link is stored in the same column as the Letterboxd link, in the canonical form `https://www.imdb.com/title/tt1234567/`, so the same title id always means the same film. A film without a `Created` date gets the day of the import; an existing film keeps its date, so importing the same file again changes nothing. A `Created` value that is not `YYYY-MM-DD` is rejected.

### Both formats

A UTF-8 BOM, CRLF line endings, quoted fields with commas, quotes or line breaks, and empty lines are handled. A file without a header or with a missing column is rejected (`400`), and so is a file with more than 20,000 rows (`413`).

## Rules

- A row whose link exists is **updated** (title, year, date added); a new link is **inserted**. Importing the same file twice changes nothing.
- An update never touches `watched_at` or the TMDB data.
- Films **with a link** that are **not in the file** are **removed**, but only films from the same source as the file (an IMDb file considers only films whose link is on `imdb.com`; a Letterboxd file everything else), so importing one export never removes the films of the other. The guard against a broken file below counts the same films. Films are removed unless they are watched (they are listed as `keptWatched`) or their row was rejected (a broken row must not delete a film). Exception: a row that can't be read at all (for example a broken quote) has no usable link, so its film appears in the removal list; check the preview's `rejected` list before confirming. A film that is marked watched while the import is being applied is not deleted. Films added by hand without a link are never removed.
- Rejected rows (`{ line, reason }`) are reported, never skipped silently. The valid rows are still imported. A link that appears twice in the file is rejected the second time.
- The import runs in one transaction: if the database fails halfway, nothing is imported.
- After an import, the TMDB enrichment starts in the background.

## Two steps: preview, then apply

1. `POST /api/films/import?dryRun=true` writes nothing and returns the report:

```json
{
  "source": "letterboxd", "applied": false, "inserted": 12, "updated": 3, "unchanged": 480,
  "removed": [{ "id": 7, "title": "…", "releaseYear": 2001 }],
  "keptWatched": [], "rejected": [{ "line": 5, "reason": "Name is empty" }],
  "removalToken": "…", "requiresLargeRemovalConfirmation": false
}
```

2. `POST /api/films/import` with the same file applies it. When films would be removed, send the preview's `removalToken` as a form field. The token identifies exactly the list the preview showed: if the list is different when applying (the database or the file changed), the answer is `409` with `code: "removal_not_confirmed"` and the new list; preview again.

## Guard against a broken file

If the import would remove **more than half of the unwatched films** (an empty or truncated export, for example), `requiresLargeRemovalConfirmation` is `true` and the apply step also needs the form field `confirmLargeRemoval=true`; otherwise it answers `409` with `code: "large_removal"`.

## Example

```bash
curl -F file=@watchlist.csv 'http://localhost:8080/api/films/import?dryRun=true'
curl -F file=@watchlist.csv -F removalToken=<token> http://localhost:8080/api/films/import
```

## Known limits

A film that is in both a Letterboxd and an IMDb export is stored twice, because its two links differ. Matching them by title and year is not done: it would merge different films with the same title.

Two imports at the same moment are not serialized. This is a single-user tool; the removal token protects against a changed list.
