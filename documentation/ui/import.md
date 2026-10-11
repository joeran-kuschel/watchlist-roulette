# CSV import

Route `/import`. Imports a Letterboxd export in two steps, like the backend ([CSV import](../backend/csv-import.md)). Code: `views/ImportView.vue`, `components/ImportSummary.vue`.

## Steps

1. **Choose a file** (`.csv`) with the **Choose CSV file** button; the chosen file name (or "No file chosen") is shown next to it. The file needs the columns `Date`, `Name`, `Year`, `Letterboxd URI`. Then press **Check file**. This calls `POST /api/films/import?dryRun=true`, which writes nothing.
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

## File chooser

The native `<input type="file" accept=".csv,text/csv" id="csv">` stays in the page, visually hidden with `.sr-only` (not `display: none`), so keyboard, screen readers, form handling and Playwright's `setInputFiles` work as usual. A second `<label for="csv" class="btn">` ("Choose CSV file") opens the dialog. It is deliberately **not** hidden from assistive technology: its visible text becomes part of the input's accessible name ("CSV file Choose CSV file"), so voice-control users can say "click Choose CSV file" (WCAG 2.5.3, label in name). The name is a little wordy for a screen reader, which is accepted. The file name or "No file chosen" that the browser itself shows for the native input is also read (in the browser's language); `#csv-name` is read through `aria-describedby`. Next to it, `#csv-name` shows the chosen file name or "No file chosen" (our own English text instead of the browser's); the input points to it with `aria-describedby`. When the input has keyboard focus, the button shows the normal 3 px focus ring. Long names wrap (`overflow-wrap: anywhere`). Clearing the selection shows "No file chosen" again. There is no drag-and-drop zone.
