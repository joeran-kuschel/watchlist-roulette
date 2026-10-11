# Add and edit a film

Routes `/watchlist/new` and `/watchlist/:id/edit`. One form for both. Code: `views/FilmFormView.vue`, `filmForm.ts`.

It is a page, not a dialog: no focus trap is needed and the back button works.

## Fields

| Field | Rule (same as the backend) |
|---|---|
| Title | required, at most 500 characters |
| Release year | optional, 1888 to 2100 |
| Letterboxd link | optional, must start with `http://` or `https://` |
| Date added | optional (today if empty on a new film), a real date |

## Saving

- New: `POST /api/films`. Edit: `GET /api/films/:id` to fill the form, `PATCH /api/films/:id` to save. Emptied optional fields are sent as `null`.
- After saving the screen goes to the watchlist, which announces "X was added." or "X was saved."
- Backend `409` (the Letterboxd link exists) is shown under the link field. Backend `400` validation issues are mapped to their fields. Other errors appear in an alert above the form.

## Errors

Mistakes are caught in the browser first (`filmForm.ts`). The form then shows a summary in a `role="alert"` box that receives focus, with a link to each field; each invalid field has `aria-invalid="true"` and its message linked with `aria-describedby`.

## Delete

On the edit page, **Delete film…** asks "Delete X? This cannot be undone." with **Yes, delete it** and **Keep film**. It calls `DELETE /api/films/:id` and returns to the watchlist.

## After saving

The backend looks the film up on TMDB in the background (poster, runtime, credits). Nothing to wait for in the form.
