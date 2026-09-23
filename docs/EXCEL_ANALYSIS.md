# Excel → Web analysis

Source: `7.1 Project Register.xlsm`.

This document describes structure and behaviour only. It intentionally excludes customer/project records, plaintext legacy PINs and other editable operational data.

## Workbook structure

The workbook contains seven worksheets:

| Excel sheet | Role in workbook | Web replacement |
|---|---|---|
| `_AuditLog` | Change history with before/after values | Audit Log view backed by private data |
| `System_List` | Customers, representatives, contacts and lookup lists | Private customer/lookups API + Customer management |
| `All Projects` | Canonical project register | Canonical `projects` collection |
| `Projects in Plan` | Duplicate status-specific project rows | Filtered view of canonical projects |
| `Projects in Progress` | Duplicate status-specific project rows | Filtered view of canonical projects |
| `Completed Projects` | Duplicate status-specific project rows | Filtered view of canonical projects |
| `Projects in Refusal` | Duplicate status-specific project rows | Filtered view of canonical projects |

The status sheets all use the same 21 business fields: order number, project name, customer, status, activity type, representative/contact details, project manager, work location, planned and actual dates/durations, expected and actual cost, currency, contract/document and project folder link.

The web version deliberately does **not** store duplicate rows for status pages. They are derived views of the canonical register, eliminating the Excel synchronization failure mode while preserving the visible workflow.

## VBA inventory

The VBA project contains workbook/sheet event modules, utility modules and five UserForms. The significant modules are:

- `modConfig` — statuses, column constants, folder locations and shared messages.
- `modAccess` — protection/session helpers and synchronization between `All Projects` and status sheets.
- `modAuth` — PIN login, roles and project-edit permissions.
- `modAuditLog` — before/after snapshots for register changes.
- `modProjectFolders` — OneDrive folder creation/move/rename, GUID metadata and hyperlink handling.
- `modMail` — Outlook-based update-request email generation.
- `modDates` — locale-safe date parsing/formatting.
- `modTables`, `modDiagnostics` and UserForm launcher modules — support code.
- `ThisWorkbook` / workbook module — startup protection and OneDrive-link adjustment.
- Project-sheet change event — removes a project from old status sheets and writes it to the appropriate status sheet.

## UserForms

### UserForm1 — Add project

Provides project creation with customer/representative cascading lists, date/duration logic, required-field checks, project-number generation, folder handling and attachment/update-related actions.

Web mapping: **Add project** modal. Number generation and validation are server-authoritative.

### UserForm2 — Edit project

Loads an existing project, applies role permissions, validates status transitions, changes a three-digit planning number to `YYYYxxx` when the project enters an active/full-number stage, updates fields and supports deletion.

Web mapping: **Edit selected** modal. Double-clicking a project also opens it when permitted.

### UserForm3 — Customer management

Adds, edits and deletes customer representatives and their phone/email details.

Web mapping: **Customers → Manage customers**.

### UserForm4 — Edit customer record

Focused edit dialog for one customer/representative record.

Web mapping: edit action inside the customer-management dialog.

### UserForm5 — Authorization

PIN login/logout and current-user status.

Web mapping: **Authorization** dialog. Plaintext PINs are not copied to either source repository; the private backend uses salted scrypt hashes.

## Status model

Exact VBA statuses are retained:

- `In plan`
- `Offer Preparation`
- `Awaiting Client Decision`
- `Confirmed`
- `In Progress`
- `Completed`
- `Rejected`

They map to four visible status groups:

- Plan: `In plan`, `Offer Preparation`, `Awaiting Client Decision`
- Progress: `Confirmed`, `In Progress`
- Completed: `Completed`
- Refusal: `Rejected`

Allowed transitions carried into the backend:

- Plan group → another Plan status, Progress group, or Rejected.
- Progress group → Confirmed/In Progress, Completed, or Rejected.
- Completed → Completed only.
- Rejected → Rejected only.

## Project numbering

The workbook has two numbering modes and the backend preserves them:

- Plan-group / Rejected records use a three-digit sequence such as `001`.
- Confirmed/In Progress/Completed records use seven digits in `YYYYxxx` format.
- Moving a Plan-group project into an active/full-number group creates the next `YYYYxxx` number for the current year.

## Required fields

Base requirement: Project name and Status.

For non-Rejected projects, VBA additionally requires customer, activity type, representative, at least one contact method, and planned start/end dates.

Confirmed/In Progress/Completed additionally require project manager, expected cost, currency and contract/document.

In Progress/Completed additionally require work location and actual start.

Completed additionally requires actual end and actual cost.

The workbook's Rejected path is intentionally minimal (project name + status); this exact behaviour is retained for compatibility.

## Date logic

Planned and actual duration are inclusive: `end - start + 1 day`. End before start is invalid. The web UI calculates the value for immediate feedback, while the backend recalculates it authoritatively.

## Access model

Roles found in the workbook:

- Global administrator
- Local administrator
- Project manager

Administrators can edit any project. A PM can normally edit only a project assigned to that PM. The existing reciprocal exception between the two named PM accounts encoded in VBA is retained in the backend.

One VBA inconsistency was normalized: the add-project UI treats local administrators as administrators able to assign a PM, while one save path would overwrite the PM as though `localAdmin` were a PM. The web implementation follows the intended UI/access model: `admin` and `localAdmin` can assign a PM; a PM account is constrained to itself.

## Audit behaviour

Existing Excel audit history is migrated to the private data store. New web Add/Edit/Delete operations append a timestamped entry with user plus before/after snapshots. The web version also records deletes consistently; this closes a gap between the workbook's audit helper and its actual delete flow.

## OneDrive / folders

The workbook performs Windows-local OneDrive operations: it discovers the local OneDrive root, creates a project folder from a sample, writes `.project.meta`, locates the folder by project GUID, moves/renames it when status/number changes, and updates Excel hyperlinks.

A normal browser cannot safely reproduce local filesystem operations. Version 1 therefore:

- preserves the existing project GUID and folder link;
- can display normal web folder links;
- exposes `/api/folders/sync` as an explicit stub;
- leaves create/move/rename for a later Microsoft Graph/SharePoint/OneDrive integration.

This boundary avoids pretending that a browser can manipulate a user's OneDrive filesystem directly.

## Outlook / email

`modMail` builds Outlook messages for project update workflows. Per the migration scope, email is disabled for now. The UI keeps **Request update** and calls `/api/mail/project-update-request`, which returns an intentional stub response. That API boundary can later be replaced with Microsoft Graph/Outlook without changing the project UI or domain model.

## Data architecture

`project-register` (public): HTML/CSS/JavaScript UI only; no operational seed data and no credentials.

`project-register-be` (private): Node.js API, business rules, editable projects/customers/lookups/audit data and salted authentication hashes. It supports local-file persistence and an optional GitHub persistence mode that commits each mutation back to the private repository through GitHub's Contents API.