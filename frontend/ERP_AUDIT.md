# ERP screen audit and reference comparison

## Scope and limitations

This pass opened all 25 tenant routes and seven platform routes with the demo owner, manager, attendant and platform administrator. Four additional staff accounts were created through the Team UI using the attendant, cashier, accountant and supervisor presets, and their permitted routes were opened too. Browser errors and failed API requests were recorded. Non-destructive controls and nested forms were exercised separately. Test writes used a disposable sandbox database, not customer data.

A page loading does not prove every business workflow correct. Hardware was simulated. This was MariaDB 10.2 and Java 21 compiled with ECJ, not MySQL 8 with Gradle/javac. The database portion of BackendTests is restricted to GitHub Actions and was not run here. Screenshots are reference material, not proof that the reference application's accounting works.

## Confirmed issues fixed in this patch

- Attendants could open Readings and Sales but their nozzle lookup returned 403. Meter history appeared empty. Reference-list access now accepts the operational permissions that need the list; edits still need their original write permissions and station/tenant scoping is retained.
- Stock readers could see tank cards but tank CSV export returned 403. Stock/product/tank lookups now follow the same read-access policy.
- Cashier/accountant overview requested prices without the necessary lookup access. Accountant overview also requested shift alerts without shifts.read. Price lookup explicitly supports reports.read; shift alerts are queried only with shifts.read.
- Sales offered a raw-reading export to cashiers without readings.read. It is now hidden for those logins.
- Team offered employee export to an attendance-only manager. The button now requires employees.read.
- New tank displayed the first product although the form held an empty product id. Create stayed disabled. It now saves the displayed product, handles late-loaded products and starts fresh on reopen.
- Closing-preview rows used `nozzle`, but the API returns `label`. Nozzle names now display. The detail dialog has a wider desktop size so the Edit column fits better.
- DSR Download CSV silently did nothing with no sales rows. It now explains why there is no download.
- Adjustment/transfer/dispute/reversal forms now state the minimum reason length rather than leaving an unexplained disabled button. Customer follow-up text inputs gained accessible labels.

Reference lists are read-only dependencies, not extra screen permissions. The frontend and Java tables documenting that policy must stay in sync.

## What the reference screenshots show, compared with this repository

| Reference feature | PetroFlow status |
| --- | --- |
| Dashboard sales summaries and tank gauges | Present, with book-stock/physical-dip distinction. No claim of live physical level without telemetry. |
| Collapsible navigation and grouped sections | Present. Different branding/layout intentionally retained. |
| Purchase register and supplier invoice | Partial: Supplier deliveries records a single fuel/tank invoice, draft/receive/dispute, tax, vehicle/driver and decantation details. |
| Multi-line purchase invoice, pending purchase order, requisition and purchase return | No equivalent complete workflow found. Needs schema/API/accounting work, not just UI fields. |
| Opening stock, stock adjustment, transfer and tank ledger | Present. Transfers require same-product tanks; opening stock is rejected after movements exist. These rejections are business rules, not broken buttons. |
| Nozzle opening/closing/testing readings by shift | Present under Shifts; closing creates aggregate volume/value, not individual vehicle invoices. |
| Lubricant sale and receipt | Present, including stock checks, payment mode and credit customer selection. |
| Separate bulk-sale invoice and sale-order workflow | No complete equivalent found. |
| Customer credit sale with vehicle/slip/due date | Present under Customer ledger. Receipts and printable monthly statements also present. |
| Multi-row credit-sale entry and unbilled/billed batch billing | No equivalent full batch-invoicing workflow found. Monthly statements are not tax invoices. |
| Supplier/customer payments, cash/digital settlement, expenses, reconciliation | Present. Several save/settle/reverse/approve flows were exercised successfully in the sandbox. |
| General cash book, journals, chart of accounts, debit/credit notes, trial balance, balance sheet, P&L | Not a complete double-entry accounting system in this repository. Operational ledgers/DSR must not be presented as audited financial statements. |
| Staff rights, branch/station assignment, attendance, day lock | Present. A denied route can be deliberate access control, not a defect. |
| Financial-year management and spreadsheet import/map/preview/history wizard | No complete equivalent found. |
| WhatsApp invoice PDF automation | Not present. Existing report sharing opens device sharing/WhatsApp summary; it is not automated PDF delivery. |
| Backup button | No equivalent end-to-end backup/restore product workflow verified. Database backup and recovery need an explicit deployment plan. |

## Important observations

- The demo seed contains fixed October 2026 dates. Today's sales/payment/report views can legitimately be empty. Existing historical records remain accessible with a matching date. This patch does not rewrite historical dates or fabricate today's sales.
- Loyalty, Vehicle history and Pump tablet are prototypes with sample data; their permission keys are not grantable in the real permission catalog. They are not finished operational modules.
- A manager deliberately cannot administer owner-only setup/access. Custom staff with only a child-section permission may still have navigation discoverability issues; the present grouped menu is not a complete permission-dependency solver.
- Form crawl timeouts caused by selecting hidden Attendance controls, resetting the tester's password, choosing incompatible tanks or not selecting the required nozzle tank were inspected separately; they were not counted as application crashes.
- Annual subscription default-price mismatch, trial enforcement and dispenser-plan enforcement remain outside this patch.

## Recommended next implementation phases

1. Finish role-specific navigation, remaining form validation and regression coverage for unusual custom permission combinations.
2. Add multi-line purchase invoices with supplier/due/transport/receipt reconciliation and purchase returns, with transactional stock and payable tests.
3. Add bulk/customer invoicing and batch credit billing with explicit tax rules; prevent double counting against shift totals.
4. Design double-entry accounts, journals and financial-year closing before adding trial balance/P&L labels.
5. Add validated spreadsheet import with dry run, error rows, audit history and rollback strategy. Configure a messaging provider before promising automated WhatsApp PDFs.

Do not implement all these as dummy tabs. Each needs real persistence, access checks and accounting/stock reconciliation tests.

## Verification of this patch

- Frontend typecheck and production build passed.
- Backend compiled with ECJ: 51 unit assertions passed.
- Full Playwright suite: 39 passed (36 existing plus three access/form regressions).
- The separate crash-resilience configuration was not rerun in this audit.

## Purchase workflow added after the audit

`/purchases` now provides a paginated/searchable/date-filtered fuel purchase register and multi-line draft form. It supports supplier invoice number, invoice/due date, active tank/fuel lines, server-calculated rounded amounts, invoice-level discount/freight/tax amounts, vehicle, transporter and internal notes.

Drafts have no stock/payable effect. Explicit receipt posts all lines atomically; a full return offsets stock and the entire invoice payable with an audit reason. Header locking prevents duplicate receipt/return; transaction rollback prevents partial posting on a bad line or insufficient stock. Stable idempotency keys support retry. Duplicate supplier invoice numbers are checked across the new register and legacy Deliveries. Related masters cannot be deleted while referenced. Supplier ledgers, overview payables and DSR posting-date purchase/return entries include this register.

Limits: fuel tanks only (not lubricant/general-merchandise purchase lines); exact invoiced quantities on receipt; full-invoice returns only. There is no PO/requisition conversion, partial receipt/return, attachment upload, draft editing/deletion, invoice payment allocation or automatic tax determination. Use the existing Delivery decantation workflow when recording measured shortages. Do not enter one supplier invoice in both registers. Bulk sales, full accounting, imports and WhatsApp automation remain future work.

Final verification after the purchase implementation: frontend typecheck/build passed; Java 21 ECJ compilation and 58 unit assertions passed; full Playwright suite 42 passed; separate crash-resilience suite 2 passed. Purchase regression tests exercise the multi-line UI, server totals, duplicate numbers, invalid price/date, bad-line rollback, staff refusal, duplicate receipt/return refusal, stock/payable offsets and all-or-nothing return failure when one tank lacks stock. Desktop form screenshot reviewed; 390px phone check found no document-level horizontal overflow. MySQL 8/Gradle and real hardware remain unverified.

### Draft correction workflow

Drafts can now be edited (header and lines) or cancelled with a reason. Both operations are transactionally audited. Editing recalculates all amounts, preserves the invoice id/creator, checks old and new business dates, and refuses station changes. A revision token rejects stale editors rather than overwriting their changes. Cancelled invoices remain visible and reserve their supplier invoice number; they cannot be edited or received. Received/returned invoices remain immutable. This supersedes the earlier draft-editing limitation; partial receipts/returns and the other listed limitations remain.

The draft regression covers valid edit, stale edit refusal, invalid-line rollback, minimum cancellation reason, terminal cancellation and unchanged tank stock.

### Partial posting and purchase orders (current implementation)

The earlier full-only limitation is superseded. Each line now exposes ordered, received and returned litres. Partial/full receipts and returns create immutable events and event lines; stock, supplier ledger, overview payables and daily report use these events rather than deriving history from the header's latest status. Returns currently require receipt completion first. Receipt/return money is allocated proportionally by original line value, including entered discount/freight/tax; cumulative rounding makes completed allocations equal the invoice total exactly. The UI states this policy explicitly.

Purchase orders use a separate register view under Purchases & orders. Open orders can be created, edited/cancelled, and converted once into a separate draft invoice. The original order remains CONVERTED with a link to its invoice; the invoice links back to its order. Orders never post stock/payables. Partial order conversion, requisition approvals and multiple invoices per order are not implemented.

Verification: 47 full-suite Playwright tests passed; separate crash suite 2 passed; frontend typecheck/build passed; Java ECJ unit assertions 61 passed. New tests cover retry idempotency, concurrent over-receipt rejection, per-line limits, duplicate/foreign line rejection, partial return states, proportional penny reconciliation, DSR event totals, order conversion, no early posting, source links, and browser quantity/conversion dialogs. A separate disposable migration database verified legacy full receipt/return backfill repeatedly, including the subsequent PO upgrade: posting dates/amounts were preserved and no duplicate events/lines appeared. The phone form check found no document-level horizontal overflow at 390px.

See `IMPLEMENTATION_STATUS.md` for the remaining screenshot scope. Bulk/credit invoicing, double-entry accounting, financial year, spreadsheet import and backup/messaging automation are still pending; this branch must not be described as the entire reference ERP complete.

### Credit billing follow-up

Batch credit consolidation is now implemented and tested (supersedes the earlier pending credit-billing note). Bills group existing posted slips without a second stock/sales/credit posting. Immutable party/slip snapshots, reasoned void/rebill, concurrent duplicate protection, billed/unbilled registers and browser print isolation are included. Due date is a collection target only; original ageing stays unchanged. It is not a replacement GST invoice or automatic WhatsApp/PDF delivery service.

Latest verification: full Playwright 50 passed, crash suite 2 passed, Java assertions 61 passed, frontend build/typecheck passed. Preview API refreshed with the new schema and endpoints. Bulk sales and the other outstanding modules remain listed in IMPLEMENTATION_STATUS.md; full screenshot parity is not complete.
