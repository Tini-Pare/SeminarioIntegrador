# SCRUM-31 — Consult Request Status

- [*] Analyze existing SCRUM-30/request flow
- [*] Implement store-user request consultation
- [*] Display current request status
- [*] Enforce store-user visibility/permissions
- [*] Implement loading/empty/error states
- [*] Verify responsive UI
- [*] Test SCRUM-30 + SCRUM-31 integration
- [*] Run project checks/tests

## Technical notes

The screen reuses `listMyRequests`, which filters by the authenticated user's ID. Existing RLS policies independently restrict store users to their own requests and prevent them from changing request or work-order status.

Status comes from the existing request mapping: an unassigned request is `new`; once a work order exists, its real `assigned`, `in_progress`, or `resolved` state is displayed. No database migration or additional attended flag is required.
