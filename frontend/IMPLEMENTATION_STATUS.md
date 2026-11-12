# Reference ERP implementation checklist

This is the continuing scope for the screenshots supplied in this session. “Implemented” means a real persisted workflow with tests, not just a new tab. No claim is made that the entire ERP or all screenshot features are complete.

## Implemented in this branch

- Role-dependent lookup and export fixes; tank-create default-product fix; labelled shift closing preview; clearer empty-export/validation feedback.
- Fuel purchase invoice register, search/date filters and pagination.
- Multi-line fuel/tank purchase form with supplier, dates, quantity/rate, invoice-level discount/freight/tax amounts, vehicle/transporter and notes.
- Versioned draft editing; reasoned cancellation; immutable posted documents.
- Partial and complete fuel receipts, per-line received/remaining tracking.
- Partial and complete returns after full receipt, bounded by received less returned litres and available book stock.
- Permanent receipt/return events; per-event proportional payable allocation and cumulative rounding.
- Supplier ledger, overview payable and posting-date DSR integration.
- Transactional posting, invoice-header locking, retry keys, negative-stock protection, audit trail, duplicate invoice checks across the new register and legacy Deliveries.
- Purchase order register, create/edit/cancel and one-time conversion into a separate draft supplier invoice. Source order and converted invoice link to each other. Orders do not post stock/payables.
- Upgrade/backfill for earlier full purchase receipts/returns, preserving dates and amounts without posting stock again.

## Existing workflows retained (not replaced with dummy screens)

Station/tank dashboard; shifts and totalizer readings; physical dip/density; single-tank delivery decantation; stock opening/adjustment/transfer/ledger; lubricant sales/receipts; customer credit slips and monthly statements; customer receipts/supplier payouts/settlement/reversal; reconciliation; employee permissions and attendance; operational reports and CSV sharing.

## Still to implement / verify

1. Procurement requisitions and approvals; multi-invoice/partial conversion against one PO; receipt variance/dip support inside multi-line invoices; lubricant/general-item purchase lines; supplier payment allocation to invoices; attachments. Current order and invoice numbers share the supplier document-number namespace and must differ.
2. Bulk-sale invoices and sale orders, with reconciliation against shift totals to prevent counting the same fuel twice.
3. Double-entry account design, cash book, bank book, journals, debit/credit notes, trial balance, P&L and balance sheet. Existing operational ledgers are not audited financial statements.
4. Financial-year setup, opening balances, closing/locking and safe reopening; existing business-day locking is retained.
5. Spreadsheet import with entity selection, column mapping, validation preview, error rows and durable import history. Avoid destructive automatic imports.
6. Backup/restore with explicit scope, integrity verification and restore testing; deployed database backup policy.
7. Invoice PDF and messaging delivery. WhatsApp automation needs a configured provider, template approval/credentials and delivery-status handling. Existing share actions are not automatic delivery.
8. Finish role-specific navigation for custom permission combinations; replace or retire sample-data Loyalty/Vehicle history/Pump tablet prototypes; verify all new workflows on MySQL 8 with Gradle/javac and actual forecourt hardware.

## Current purchasing boundaries

- Returns require the invoice to be fully received first; partial receipts cannot yet be returned while a balance remains undelivered.
- All invoice charges, including freight and entered tax, are allocated proportionally by line value. This is an explicit operational allocation rule, not automatic GST/legal-tax advice.
- Full and partial receipts post on the actual action date. Historical event amounts are not recomputed from current document status.
- An order converts once, in full, to one separate invoice. A new draft may then be corrected before receipt.
- No background promise: the remaining checklist requires further implementation turns. No deployment, push or main-branch merge is implied by local completion.

Current verification: 50 Playwright tests + 2 crash tests passed, 61 Java unit assertions passed, frontend typecheck/build passed. Tests used disposable MariaDB 10.2 and ECJ Java 21, not MySQL 8/Gradle or real hardware.

## Credit bill consolidation — verified

- Sales → Credit billing provides customer/date-filtered unbilled slips, selection, issuance, billed register/detail and isolated browser Print / Save PDF.
- Bills snapshot customer, issuer, station and source slips; issued documents cannot be edited. Reasoned void preserves the document/items and releases slips for another bill.
- Issuance/void never repost credit, sales or stock. Collection-target date does not change original slip ageing. This is a consolidated statement, not a second tax invoice.
- Customer/slip locks and a unique active-slip constraint prevent concurrent duplicate billing; tenant/station and permission checks are server-side.
- Three new API/browser tests verify concurrent exclusion, balances and tank quantities unchanged, void/rebill/history, duplicate-ID validation, attendant denial, issuing and print visibility. Full suite: 50 passed; crash suite: 2 passed; Java: 61 assertions; frontend build/typecheck passed. Immutable snapshot storage is implemented but master-edit and cross-tenant isolation scenarios still need dedicated regression tests.
