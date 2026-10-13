# Project Register — public frontend

Web replacement for the user-facing workflow of the macro-enabled Excel register `7.1 Project Register.xlsm`.

This repository is intentionally **data-free**. Live projects, customers, audit entries and authentication hashes live behind the private `project-register-be` API.

## Run locally

1. Start the private backend on port `8787`.
2. From this repository run any static HTTP server, for example:

```bash
python -m http.server 8080
```

3. Open `http://localhost:8080`.
4. If necessary, use **API settings** to change the private backend URL.
5. Use **Authorization** with an existing workbook user PIN.

No npm install or build step is required.

## Implemented

- All Projects plus Plan / Progress / Completed / Refusal views
- Add, edit and delete project workflows
- Customer/representative management
- Role-based project editing
- Project status transition rules and numbering
- Planned/actual duration calculation
- Search and filtering
- Audit log
- Existing folder-link display
- Email/Outlook update action shown as a deliberate backend stub
- OneDrive folder synchronization shown as a deliberate backend stub

## Data boundary

The browser never contains a built-in copy of the Excel data. It requests data after authorization from `project-register-be`. The private backend is responsible for validation and permissions; client-side controls are convenience only and are not a security boundary.

See [`docs/EXCEL_ANALYSIS.md`](docs/EXCEL_ANALYSIS.md) for the workbook-to-web mapping.

## Resizable table columns

All workspace tables support Excel-style column resizing by dragging the right edge of a column header. Supported layouts: All Projects / Plan / Progress / Completed / Refusal (shared widths), Updates Required, Customers, Change History and Users & Access. Customer management and Request update dialog tables can also be resized.

- Drag a column-header separator to change its width.
- Double-click a separator to reset just that column; keyboard focus on a separator and press Left/Right arrows (Shift = 25-pixel steps; Home = reset).
- Use the **↔ Reset column widths** toolbar control to restore all widths in the current workspace.
- Width preferences are stored only in this device/browser's local storage, isolated by table layout. They are not part of any project and are not synchronized to the backend.
- Table zoom works with toolbar **− / 100% / +** and **Ctrl + mouse wheel** in all workspace views, including Change History. Existing fullscreen/pinch controls remain available.


## Change History: one card per project operation

Change History shows **one clickable list record per saved project change**, regardless of how many fields were edited together. Each record displays Helsinki-local timestamp, project number/name, person who changed it, operation type and a concise summary (such as "5 fields changed").

Click the row (or focus it and press Enter/Space) to open a read-only change card with the complete list of user-facing fields modified by that save and their **Before / After** values. Project creation/deletion remains visible as single event cards. No-op edits and technical OneDrive folder-sync events remain hidden. Search covers field labels and old/new values even while cards are closed. Column resizing, 250-record pagination, table zoom and fullscreen remain available.

The backend continues to store one audit record per operation and returns the existing `changes` array. This update affects **frontend presentation only**, with no migration or modification of project/audit data.


## English / Russian interface

The authenticated header provides a compact **EN / RU** selector alongside the signed-in user's name. Selecting a language updates menus, project tables, customer/user management tables, project forms, validations, standard status and activity type labels, Change History, System messages and PWA installation instructions. The setting persists **per browser/PWA** in local storage (`hh-register-language-v1`); it is not written to project data or user accounts.

**Data is never translated or migrated.** Status and activity dropdowns keep their original canonical English `value` attributes so backend workflows, permissions, scheduled reminders and project status filters are unchanged. Only the visible option caption is localized. Project and customer names, contact details, manager usernames, work locations, contract/document descriptions, and any other manually entered fields are shown verbatim. Unknown/custom activity type values intentionally remain unchanged rather than being incorrectly translated. History translates field names and only known status/activity enum values, not free-text values. Search can match localized status/activity labels. Changing the language does not reset unsaved project forms or send any API update.

The default interface language is English until the user switches to Russian. The language preference is local to each device. The backend and audit records continue to store the original canonical values.

All text is rendered safely using `textContent` for dynamic user-controlled values.
