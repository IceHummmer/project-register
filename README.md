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