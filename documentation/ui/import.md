# CSV import

Route `/import`. Imports a Letterboxd export in two steps, like the backend ([CSV import](../backend/csv-import.md)). Code: `views/ImportView.vue`, `components/ImportSummary.vue`.

## Steps

1. **Choose a file** (`.csv`) with the columns `Date`, `Name`, `Year`, `Letterboxd URI`, and press **Check file**. This calls `POST /api/films/import?dryRun=true`, which writes nothing.
2. The **Check result** shows what would happen: films added, updated, unchanged, **removed** and **rejected rows** (line number and reason), plus films kept because they are watched. Focus moves to the result heading and a status message says nothing has been changed yet.
3. **Import films** applies the import (`POST /api/films/import`, same file).
4. **Import finished** shows the same report in past tense, with a link to the watchlist.

## Confirmations

The import removes films that are not in the file (unless watched), so:

- If films would be removed, the user must tick "I understand that N films will be removed from my list." The check's `removalToken` is sent with the apply request; it identifies exactly the shown list.
- If more than half of the unwatched films would be removed (`requiresLargeRemovalConfirmation`), a second box is needed and `confirmLargeRemoval=true` is sent.
- **Import films** stays disabled until the needed boxes are ticked.
- If the backend answers `409` (the list changed since the check), nothing was imported; the screen goes back to the start and asks to check the file again.

Rejected rows are always listed, never skipped silently. Choosing another file clears the result.

## Errors

A rejected file (for example a missing column, `400`) and other errors are shown in an alert with the backend's message.
