# PetroFlow — kya verified hai, kya nahi

Date: 2026-11-07
Branch: `arena/c1ef1602-petrolflow-erp` (PR #26)
Last green run: **42187004591** — `verify` ✓ + `e2e` ✓

Ye file seedha jawab deti hai: *"sab kuch chal raha hai?"*
Teen hisse hain — jo proven hai, jo aapke environment mein verify karna baaki hai, aur jo
jaan-bujh kar nahi banaya.

---

## A. Proven — har baar CI mein chal ke pass hota hai

CI har push pe asli MySQL 8 + asli Java 21 API + asli Chromium uthata hai. Mock nahi.

### `verify` job

| Kya | Result |
| --- | --- |
| MySQL schema + seed smoke test | ✓ |
| Frontend typecheck (TypeScript, zero errors) | ✓ |
| Java 21 backend compile | ✓ |
| Backend test suite — **37 test methods, 447 assertions** | ✓ |
| MySQL HTTP integration (real DB, real queries) | ✓ |
| Frontend production build | ✓ |
| Java API jar packaging | ✓ |
| `mysqldump` backup smoke test | ✓ |

Backend suite mein multi-JVM idempotency, connection-pooling, login throttle precision,
tenant/station isolation, supplier opening-balance precision, density compliance — sab asli
assertions ke saath.

### `e2e` job — 25 browser tests

| Test | Kya prove karta hai |
| --- | --- |
| owner / manager / platform admin: **har nav screen** | 30+ screens band nahi hotin, koi browser error ya API 4xx/5xx nahi |
| 360px phone, light + dark | mobile layout tootta nahi |
| login reject / accept / sign-out | auth cycle sahi |
| embedded HTTPS preview + third-party cookies blocked | session tikta hai |
| shift preview → manual edit → close | reading preserve hoti hai |
| customer create + paginated totals | server totals galat nahi |
| credit slip → customer ledger | credit flow + ₹250.00 ledger entry |
| DSR switch + dono pump register export | report + export |
| expense record | expenses list mein aata hai |
| simulator + device registration | device flow |
| **attendance Present day + in-time gate** | regression test (bug #4) |
| **fresh tank opening stock → ledger** | regression test (bug #3) |
| **API down → actionable message** | regression test (bug #6) |
| theme persistence, password visibility, dialog focus, permissions | UI details |
| **API↔frontend contract** | 164 routes vs 171 call sites — 0 missing, 0 method mismatch |

---

## B. Fixed — 6 bugs jo app ko chalne se rokte the

| # | Bug | Asar | Fix | Test |
| --- | --- | --- | --- | --- |
| 1 | `ci.yml` mein duplicate YAML keys | workflow hi invalid | rebuild | run green |
| 2 | `testConfig()` ambient env pe depend | local pass, CI fail | explicit config | `verify` |
| 3 | `Domain.movement()` → `tanks.tenant_id` (column nahi hai) | **har** stock movement 400 | stations se join | e2e #24 |
| 4 | Attendance panel mein In/Out time inputs hi nahi | Present day kabhi save nahi | time inputs + gate | e2e #23 |
| 5 | `isDemoAccount` sirf flag pe bharosa | demo login `is_demo=0` pe mara | email match | backend test |
| 6 | API down pe chupchaap fail | "kuch nahi hota" | startup checklist + login banner | e2e #25 |

---

## C. Aapko khud verify karna hoga (main nahi kar sakta)

Sandbox mein JDK, MySQL aur Docker nahi hain. Isliye **maine aapki machine pe app nahi chalaya** —
CI mein chalaya hai. Ye cheezein aapke environment pe pehli baar chalengi:

1. **Fresh install** — `npm install`, `.env` copy, MySQL setup, `npm run db:seed`.
2. **Startup** — `npm run dev` se API :4000 + UI :5173. Agar DB galat ho to ab 4-step checklist
   print hogi (kaunsa host/user/db try hua), khali stack trace nahi.
3. **Login** — `owner@sunrisefuels.in` / `PetroFlow@2025`.
4. **Backup** — `mysqldump` chal raha hai CI mein, par aapka restore plan test nahi hua.

Agar inme se kuch atke, error message ab batayega *kahan* atka — us message ke saath ping karo.

---

## D. Jaan-bujh kar nahi banaya (README "Kya nahi hai" se)

Ye adhoora kaam nahi hai — scope decision hai. Inke bina pump ka roz ka kaam chalta hai.

| Cheez | Status |
| --- | --- |
| Asli nozzle hardware (Gilbarco / Tokheim / ATG) | **Sirf simulator.** Settings screen "Unverified" dikhayega — ye jaan-bujh kar honest hai |
| GST / VAT / GSTR-1 / e-invoice filing | Nahi. Lubricant GST CSV hai, filing portal nahi |
| P&L / dealer margin per litre | Nahi. Sales estimate hai, munafa nahi |
| Payroll / PF / ESI / payslip | Nahi. Attendance + payable days hain |
| Email / SMS / WhatsApp auto alerts | Nahi. Share button manual hai |
| Forgot password / 2FA | Nahi. Owner password reset karta hai |
| Bank/UPI auto-settlement, MDR | Nahi. Manual reconciliation hai |
| Hindi UI | Nahi. Labels English |
| Shop POS / car wash / rent income | Nahi |

### Aur 4 design-level limitations (purane audit se, abhi bhi valid)

1. **Fuel credit sales** ledger-first hain — nozzle/shift se stock post nahi hota. Blind deduction
   shift totalizer double-count kar deta, isliye chhoda gaya.
2. **Delivery invoice-level payment allocation** nahi — payment station/supplier level pe hai.
3. **Expense delete** hard-delete hai (strict audit log ke saath, soft-delete migrate nahi kiya).
4. **Multi-browser** test nahi — sirf Chromium. Firefox/Safari pe verify nahi hua.

---

## E. Ek line mein

Jo code hai wo **chal raha hai aur test se proven hai** (CI green, 447 backend assertions, 25 browser
tests, 0 contract mismatch). Jo nahi hai wo **jaan-bujh kar nahi banaya** — README mein listed hai.
Beech mein kuch chhupa nahi hai.
