package in.petrolflow;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Fuel purchases: draft -> received -> fully returned. Every transition is atomic and audited. */
public final class PurchaseApi {
    private PurchaseApi() {}

    public static void register(Web web) {
        web.get("/purchases", PurchaseApi::list);
        web.get("/purchases/options", PurchaseApi::options);
        web.get("/purchases/:id", ctx -> ctx.ok(detail(ctx.requireAuth(), ctx.p("id"))));
        web.post("/purchases", PurchaseApi::create);
        web.post("/purchase-orders", ctx -> save(ctx, true));
        web.post("/purchases/:id/convert-order", PurchaseApi::convertOrder);
        web.post("/purchases/:id/edit", PurchaseApi::create);
        web.post("/purchases/:id/cancel", PurchaseApi::cancel);
        web.post("/purchases/:id/receive", ctx -> transition(ctx, false));
        web.post("/purchases/:id/return", ctx -> transition(ctx, true));
    }

    private static void options(Web.Ctx ctx) {
        Auth auth = ctx.requireAuth(); auth.require("deliveries.read");
        String station = ctx.q("stationId"); auth.station(station);
        ctx.ok(Web.map("suppliers", Json.shapeAll(Db.all("SELECT id,name FROM suppliers WHERE tenant_id=? AND is_active=1 ORDER BY name", auth.tenantId())),
                "tanks", Json.shapeAll(Db.all("SELECT t.id,t.code,t.name,t.product_id,t.status,p.name AS product_name FROM tanks t JOIN fuel_products p ON p.id=t.product_id WHERE t.station_id=? AND t.status='ACTIVE' ORDER BY t.code", station))));
    }

    private static void list(Web.Ctx ctx) {
        Auth auth = ctx.requireAuth();
        auth.require("deliveries.read");
        String stationId = ctx.q("stationId");
        auth.station(stationId);
        String from = ctx.q("from"), to = ctx.q("to");
        List<Object> params = new ArrayList<>(List.of(auth.tenantId(), stationId));
        String where = " WHERE p.tenant_id = ? AND p.station_id = ? AND p.document_type=?";
        params.add("ORDER".equals(ctx.q("documentType")) ? "ORDER" : "INVOICE");
        if (from != null && !from.isBlank()) { where += " AND p.invoice_date >= ?"; params.add(Domain.requireDate(from, "From date")); }
        if (to != null && !to.isBlank()) { where += " AND p.invoice_date <= ?"; params.add(Domain.requireDate(to, "To date")); }
        if (ctx.q("search") != null && !ctx.q("search").isBlank()) {
            where += " AND (p.invoice_number LIKE ? OR s.name LIKE ?)";
            params.add("%" + ctx.q("search").trim() + "%"); params.add(params.get(params.size() - 1));
        }
        String join = " FROM purchase_invoices p JOIN suppliers s ON s.id=p.supplier_id";
        int page = Domain.pageOf(ctx), size = Domain.pageSize(ctx);
        long total = Db.count("SELECT COUNT(*) AS count" + join + where, params.toArray());
        params.add(size); params.add((page - 1) * size);
        ctx.ok(Json.shapeAll(Db.all("SELECT p.*, s.name AS supplier_name" + join + where
                + " ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?", params.toArray())), Domain.page(total, page, size));
    }

    private static Map<String, Object> load(Auth auth, String id, boolean lock) {
        Map<String, Object> row = Db.one("SELECT * FROM purchase_invoices WHERE id=? AND tenant_id=?" + (lock ? " FOR UPDATE" : ""), id, auth.tenantId());
        if (row == null) throw ApiException.notFound("Purchase invoice not found");
        auth.station(Db.str(row, "station_id"));
        return row;
    }

    private static Map<String, Object> detail(Auth auth, String id) {
        auth.require("deliveries.read");
        Map<String, Object> row = Json.shape(load(auth, id, false));
        row.put("lines", Json.shapeAll(lines(id)));
        row.put("events", Json.shapeAll(Db.all("SELECT * FROM purchase_events WHERE invoice_id=? ORDER BY occurred_at,id", id)));
        Map<String,Object> converted=Db.one("SELECT id FROM purchase_invoices WHERE source_order_id=? AND tenant_id=?",id,auth.tenantId());
        if (converted!=null) row.put("convertedInvoiceId",converted.get("id"));
        return row;
    }

    static BigDecimal decimal(Object value, String field, int scale, boolean positive) {
        try {
            BigDecimal n = new BigDecimal(String.valueOf(value)).setScale(scale, RoundingMode.HALF_UP);
            if (n.signum() < 0 || (positive && n.signum() == 0) || n.precision() > 16) throw new NumberFormatException();
            return n;
        } catch (RuntimeException e) { throw ApiException.validation(field, "Enter a valid " + (positive ? "positive" : "non-negative") + " number (maximum 16 digits)"); }
    }

    private static String text(Object raw, String field, int max, boolean required) {
        String s = raw == null ? "" : String.valueOf(raw).trim();
        if ((required && s.isEmpty()) || s.length() > max) throw ApiException.validation(field, "Required value, maximum " + max + " characters");
        return s;
    }

    private static void create(Web.Ctx ctx) { save(ctx, false); }

    @SuppressWarnings("unchecked")
    private static void save(Web.Ctx ctx, boolean order) {
        Auth auth = ctx.requireAuth(); auth.require("deliveries.write");
        Map<String, Object> body = ctx.body();
        String station = text(body.get("stationId"), "stationId", 64, true);
        String supplier = text(body.get("supplierId"), "supplierId", 64, true);
        String number = text(body.get("invoiceNumber"), "invoiceNumber", 120, true);
        String date = Domain.requireDate(ctx.str("invoiceDate"), "Invoice date");
        String due = Domain.requireDate(ctx.str("dueDate"), "Due date");
        if (due.compareTo(date) < 0) throw ApiException.validation("dueDate", "Due date cannot precede invoice date");
        if (!(body.get("lines") instanceof List<?> raw) || raw.isEmpty() || raw.size() > 50) throw ApiException.validation("lines", "Add between 1 and 50 fuel lines");
        List<Map<String, Object>> lines = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        for (Object item : (List<?>) body.get("lines")) {
            if (!(item instanceof Map<?, ?>)) throw ApiException.validation("lines", "Invalid line item");
            Map<String, Object> l = (Map<String, Object>) item;
            BigDecimal qty = decimal(l.get("quantityLitres"), "quantityLitres", 3, true);
            BigDecimal rate = decimal(l.get("ratePerLitre"), "ratePerLitre", 3, true);
            BigDecimal amount = decimal(qty.multiply(rate), "amount", 2, true);
            lines.add(Web.map("tankId", text(l.get("tankId"), "tankId", 64, true), "quantity", qty, "rate", rate, "amount", amount));
            subtotal = subtotal.add(amount);
        }
        BigDecimal discount = decimal(body.getOrDefault("discountAmount", "0"), "discountAmount", 2, false);
        BigDecimal freight = decimal(body.getOrDefault("freightAmount", "0"), "freightAmount", 2, false);
        BigDecimal tax = decimal(body.getOrDefault("taxAmount", "0"), "taxAmount", 2, false);
        if (discount.compareTo(subtotal) > 0) throw ApiException.validation("discountAmount", "Discount cannot exceed subtotal");
        BigDecimal total = decimal(subtotal.subtract(discount).add(freight).add(tax), "totalAmount", 2, true);
        BigDecimal sub = subtotal;
        String vehicle = text(body.get("vehicleNumber"), "vehicleNumber", 80, false);
        String transporter = text(body.get("transporter"), "transporter", 160, false);
        String notes = text(body.get("notes"), "notes", 4000, false);
        String id = Db.tx(() -> {
            auth.station(station); Domain.assertDayOpen(station, date);
            Map<String, Object> before = ctx.p("id") == null ? null : load(auth, ctx.p("id"), true);
            if (before != null) {
                if (!"DRAFT".equals(Db.str(before, "status"))) throw ApiException.conflict("Only draft invoices can be edited");
                if (!station.equals(Db.str(before, "station_id"))) throw ApiException.conflict("An invoice cannot be moved to another station");
                Domain.assertDayOpen(station, Db.str(before, "invoice_date"));
                if (!String.valueOf(before.get("revision")).equals(ctx.str("revision"))) throw ApiException.conflict("This draft changed. Reload it before editing");
            }
            // Serialize invoice numbers across the new register and legacy deliveries for this supplier.
            Map<String, Object> sup = Db.one("SELECT * FROM suppliers WHERE id=? AND tenant_id=? FOR UPDATE", supplier, auth.tenantId());
            if (sup == null || Db.num(sup, "is_active") != 1) throw ApiException.validation("supplierId", "Select an active supplier");
            if (Db.one("SELECT id FROM purchase_invoices WHERE tenant_id=? AND supplier_id=? AND invoice_number=? AND id != ?", auth.tenantId(), supplier, number, before == null ? "" : before.get("id")) != null
                    || Db.one("SELECT id FROM deliveries WHERE tenant_id=? AND supplier_id=? AND invoice_number=?", auth.tenantId(), supplier, number) != null)
                throw ApiException.conflict("Invoice number already exists for this supplier");
            String key = before == null ? Clock.newId("pur") : Db.str(before, "id"), now = Clock.nowIso();
            if (before == null) Db.exec("INSERT INTO purchase_invoices (id,tenant_id,station_id,supplier_id,invoice_number,invoice_date,due_date,subtotal,discount_amount,freight_amount,tax_amount,total_amount,vehicle_number,transporter,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    key, auth.tenantId(), station, supplier, number, date, due, Money.money(sub), Money.money(discount), Money.money(freight), Money.money(tax), Money.money(total), vehicle, transporter, notes, auth.userId, now);
            else {
                Db.exec("UPDATE purchase_invoices SET supplier_id=?,invoice_number=?,invoice_date=?,due_date=?,subtotal=?,discount_amount=?,freight_amount=?,tax_amount=?,total_amount=?,vehicle_number=?,transporter=?,notes=?,revision=revision+1 WHERE id=?",
                        supplier, number, date, due, Money.money(sub), Money.money(discount), Money.money(freight), Money.money(tax), Money.money(total), vehicle, transporter, notes, key);
                Db.exec("DELETE FROM purchase_invoice_lines WHERE invoice_id=?", key);
            }
            if (before == null && order) Db.exec("UPDATE purchase_invoices SET document_type='ORDER' WHERE id=?",key);
            int index = 0;
            for (Map<String, Object> l : lines) {
                Map<String, Object> tank = Db.one("SELECT * FROM tanks WHERE id=? AND station_id=? AND status='ACTIVE'", l.get("tankId"), station);
                if (tank == null) throw ApiException.validation("tankId", "Select an active tank at this station");
                Db.exec("INSERT INTO purchase_invoice_lines (id,invoice_id,line_number,tank_id,product_id,quantity_litres,rate_per_litre,amount) VALUES (?,?,?,?,?,?,?,?)",
                        Clock.newId("pli"), key, ++index, tank.get("id"), tank.get("product_id"), l.get("quantity"), l.get("rate"), l.get("amount"));
            }
            Auth.auditRequired(auth, before == null ? (order ? "PURCHASE_ORDER_CREATED" : "PURCHASE_DRAFT_CREATED") : "PURCHASE_DRAFT_EDITED", "PurchaseInvoice", key, station, number, before, Db.one("SELECT * FROM purchase_invoices WHERE id=?", key));
            return key;
        });
        // A write-only login may save without needing read permission for the response.
        ctx.created(Web.map("id", id, "status", "DRAFT", "totalAmount", Money.money(total)));
    }

    private static void cancel(Web.Ctx ctx) {
        Auth auth = ctx.requireAuth(); auth.require("deliveries.write");
        String reason = text(ctx.body().get("reason"), "reason", 1000, true);
        if (reason.length() < 5) throw ApiException.validation("reason", "At least 5 characters required");
        Db.tx(() -> {
            Map<String, Object> row = load(auth, ctx.p("id"), true);
            if (!"DRAFT".equals(Db.str(row, "status"))) throw ApiException.conflict("Only drafts can be cancelled");
            Domain.assertDayOpen(Db.str(row, "station_id"), Db.str(row, "invoice_date"));
            Db.exec("UPDATE purchase_invoices SET status='CANCELLED',return_reason=?,revision=revision+1 WHERE id=?", reason, row.get("id"));
            Auth.auditRequired(auth, "PURCHASE_DRAFT_CANCELLED", "PurchaseInvoice", Db.str(row, "id"), Db.str(row, "station_id"), reason, row, null);
            return null;
        });
        ctx.ok(Web.map("id", ctx.p("id"), "status", "CANCELLED"));
    }

    private static void convertOrder(Web.Ctx ctx) {
        Auth auth=ctx.requireAuth(); auth.require("deliveries.write");
        String number=text(ctx.body().get("invoiceNumber"),"invoiceNumber",120,true);
        String date=Domain.requireDate(ctx.str("invoiceDate"),"Invoice date");
        String due=Domain.requireDate(ctx.str("dueDate"),"Due date");
        if (due.compareTo(date)<0) throw ApiException.validation("dueDate","Due date cannot precede invoice date");
        String id=Db.tx(() -> {
            Map<String,Object> order=load(auth,ctx.p("id"),true);
            if (!"ORDER".equals(order.get("document_type")) || !"DRAFT".equals(order.get("status"))) throw ApiException.conflict("Only an open purchase order can be converted once");
            String station=Db.str(order,"station_id");
            Domain.assertDayOpen(station,Db.str(order,"invoice_date")); Domain.assertDayOpen(station,date);
            Map<String,Object> supplier=Db.one("SELECT id FROM suppliers WHERE id=? AND is_active=1 FOR UPDATE",order.get("supplier_id"));
            if (supplier==null) throw ApiException.conflict("Supplier is inactive");
            if (Db.one("SELECT id FROM purchase_invoices WHERE tenant_id=? AND supplier_id=? AND invoice_number=?",auth.tenantId(),supplier.get("id"),number)!=null
                    || Db.one("SELECT id FROM deliveries WHERE tenant_id=? AND supplier_id=? AND invoice_number=?",auth.tenantId(),supplier.get("id"),number)!=null) throw ApiException.conflict("Invoice number already exists for supplier");
            String key=Clock.newId("pur"),now=Clock.nowIso();
            Db.exec("""
                INSERT INTO purchase_invoices (id,tenant_id,station_id,supplier_id,invoice_number,invoice_date,due_date,status,subtotal,discount_amount,freight_amount,tax_amount,total_amount,vehicle_number,transporter,notes,created_by,created_at,document_type,source_order_id)
                SELECT ?,tenant_id,station_id,supplier_id,?,?,?,'DRAFT',subtotal,discount_amount,freight_amount,tax_amount,total_amount,vehicle_number,transporter,notes,?,?,'INVOICE',id FROM purchase_invoices WHERE id=?
                """,key,number,date,due,auth.userId,now,order.get("id"));
            for (Map<String,Object> l : lines(Db.str(order,"id"))) Db.exec("INSERT INTO purchase_invoice_lines (id,invoice_id,line_number,tank_id,product_id,quantity_litres,rate_per_litre,amount) VALUES (?,?,?,?,?,?,?,?)",Clock.newId("pli"),key,l.get("line_number"),l.get("tank_id"),l.get("product_id"),l.get("quantity_litres"),l.get("rate_per_litre"),l.get("amount"));
            Db.exec("UPDATE purchase_invoices SET status='CONVERTED',revision=revision+1 WHERE id=?",order.get("id"));
            Auth.auditRequired(auth,"PURCHASE_ORDER_CONVERTED","PurchaseInvoice",key,station,order.get("invoice_number")+" -> "+number,order,Web.map("invoiceId",key));
            return key;
        });
        ctx.created(Web.map("id",id,"status","DRAFT"));
    }

    private static List<Map<String, Object>> lines(String id) {
        return Db.all("""
            SELECT l.*,t.code AS tank_code,f.name AS product_name,
              COALESCE((SELECT SUM(x.quantity_litres) FROM purchase_event_lines x JOIN purchase_events e ON e.id=x.event_id WHERE x.invoice_line_id=l.id AND e.kind='RECEIPT'),0) AS received_litres,
              COALESCE((SELECT SUM(x.quantity_litres) FROM purchase_event_lines x JOIN purchase_events e ON e.id=x.event_id WHERE x.invoice_line_id=l.id AND e.kind='RETURN'),0) AS returned_litres
            FROM purchase_invoice_lines l JOIN tanks t ON t.id=l.tank_id JOIN fuel_products f ON f.id=l.product_id
            WHERE l.invoice_id=? ORDER BY l.line_number
            """, id);
    }

    /** Cumulative allocation avoids penny drift across many partial receipts/returns. */
    static BigDecimal allocated(BigDecimal gross, BigDecimal subtotal, BigDecimal total) {
        return gross.multiply(total).divide(subtotal, 2, RoundingMode.HALF_UP);
    }

    @SuppressWarnings("unchecked")
    private static void transition(Web.Ctx ctx, boolean returning) {
        Auth auth = ctx.requireAuth(); auth.require("deliveries.write");
        String reason = returning ? text(ctx.body().get("reason"), "reason", 1000, true) : "";
        if (returning && reason.length() < 5) throw ApiException.validation("reason", "At least 5 characters are required");
        // A missing list means all remaining quantities, for backwards-compatible full actions.
        Map<String, BigDecimal> requested = new java.util.LinkedHashMap<>();
        boolean partial = ctx.body().containsKey("lines");
        if (partial) {
            Object raw = ctx.body().get("lines");
            if (!(raw instanceof List<?> list) || list.isEmpty() || list.size() > 50) throw ApiException.validation("lines", "Choose between 1 and 50 lines");
            for (Object item : (List<?>) raw) {
                if (!(item instanceof Map<?,?>)) throw ApiException.validation("lines", "Invalid line");
                Map<String,Object> l = (Map<String,Object>) item;
                String id = text(l.get("lineId"), "lineId", 64, true);
                if (requested.put(id, decimal(l.get("quantityLitres"), "quantityLitres", 3, true)) != null) throw ApiException.validation("lines", "A line cannot be selected twice");
            }
        }
        Map<String, Object> result = Db.tx(() -> {
            Map<String, Object> row = load(auth, ctx.p("id"), true);
            String status = Db.str(row, "status");
            if (!"INVOICE".equals(row.get("document_type"))) throw ApiException.conflict("Convert the purchase order to an invoice before receipt or return");
            boolean allowed = returning ? List.of("RECEIVED", "PARTIAL_RETURNED").contains(status) : List.of("DRAFT", "PARTIAL_RECEIVED").contains(status);
            if (!allowed) throw ApiException.conflict(returning ? "Complete receipt before returning fuel; only received quantities can be returned" : "Only draft or partially received invoices can receive fuel");
            String station = Db.str(row, "station_id");
            Domain.assertDayOpen(station, Db.str(row, "invoice_date"));
            Domain.assertDayOpen(station, Clock.todayIst());
            String now = Clock.nowIso(), id = Db.str(row, "id"), event = Clock.newId("pev");
            List<Map<String,Object>> invoiceLines = new ArrayList<>(lines(id));
            invoiceLines.sort(java.util.Comparator.comparing(l -> Db.str(l, "tank_id")));
            Map<String,BigDecimal> quantities = new java.util.LinkedHashMap<>();
            BigDecimal oldGross = BigDecimal.ZERO, newGross = BigDecimal.ZERO;
            boolean complete = true;
            for (Map<String,Object> l : invoiceLines) {
                String lineId = Db.str(l, "id");
                BigDecimal ordered = Money.d(l.get("quantity_litres"));
                BigDecimal received = Money.d(l.get("received_litres"));
                BigDecimal returned = Money.d(l.get("returned_litres"));
                BigDecimal prior = returning ? returned : received;
                BigDecimal limit = returning ? received.subtract(returned) : ordered.subtract(received);
                BigDecimal qty = partial ? requested.getOrDefault(lineId, BigDecimal.ZERO) : limit;
                if (qty.compareTo(limit) > 0) throw ApiException.validation("quantityLitres", "Quantity exceeds remaining litres on line " + l.get("line_number"));
                if (qty.signum() > 0) quantities.put(lineId, qty);
                oldGross = oldGross.add(Money.d(l.get("amount")).multiply(prior).divide(ordered, 12, RoundingMode.HALF_UP));
                newGross = newGross.add(Money.d(l.get("amount")).multiply(prior.add(qty)).divide(ordered, 12, RoundingMode.HALF_UP));
                if (prior.add(qty).compareTo(ordered) < 0) complete = false;
            }
            for (String key : requested.keySet()) if (invoiceLines.stream().noneMatch(l -> key.equals(Db.str(l, "id")))) throw ApiException.validation("lineId", "Line does not belong to this invoice");
            if (quantities.isEmpty()) throw ApiException.conflict("No remaining quantity selected");
            BigDecimal subtotal = Money.d(row.get("subtotal")), total = Money.d(row.get("total_amount"));
            BigDecimal amount = allocated(newGross, subtotal, total).subtract(allocated(oldGross, subtotal, total));
            Db.exec("INSERT INTO purchase_events (id,invoice_id,kind,amount,note,occurred_at,created_by) VALUES (?,?,?,?,?,?,?)", event,id,returning ? "RETURN" : "RECEIPT", Money.money(amount),reason,now,auth.userId);
            for (Map<String,Object> l : invoiceLines) {
                String lineId = Db.str(l,"id");
                BigDecimal qty = quantities.get(lineId);
                if (qty == null) continue;
                if (!returning && Db.one("SELECT id FROM tanks WHERE id=? AND status='ACTIVE' FOR UPDATE", l.get("tank_id")) == null) throw ApiException.conflict("A selected tank is inactive");
                Domain.movement(auth.tenantId(),station,Db.str(l,"tank_id"),Db.str(l,"product_id"),returning ? "ADJUSTMENT" : "DELIVERY",
                        Money.litres(returning ? qty.negate() : qty),returning ? "PURCHASE_RETURN" : "PURCHASE_INVOICE",event,
                        row.get("invoice_number") + (returning ? " · return · " + reason : " · receipt"),auth.userId,false,now);
                Db.exec("INSERT INTO purchase_event_lines (id,event_id,invoice_line_id,quantity_litres) VALUES (?,?,?,?)",Clock.newId("pel"),event,lineId,Money.litres(qty));
            }
            String next = returning ? (complete ? "RETURNED" : "PARTIAL_RETURNED") : (complete ? "RECEIVED" : "PARTIAL_RECEIVED");
            if (returning) Db.exec("UPDATE purchase_invoices SET status=?,returned_at=?,return_reason=?,revision=revision+1 WHERE id=?",next,now,reason,id);
            else Db.exec("UPDATE purchase_invoices SET status=?,posted_at=COALESCE(posted_at,?),revision=revision+1 WHERE id=?",next,now,id);
            Auth.auditRequired(auth,returning ? "PURCHASE_RETURNED" : "PURCHASE_RECEIVED","PurchaseInvoice",id,station,String.valueOf(row.get("invoice_number")),row,Web.map("eventId",event,"amount",Money.money(amount),"quantities",quantities,"status",next));
            return Web.map("id",id,"status",next,"eventId",event,"amount",Money.money(amount));
        });
        ctx.ok(result);
    }

    public static List<Map<String, Object>> ledgerEvents(String tenant, String supplier, List<String> stations) {
        List<Object> params = new ArrayList<>(List.of(tenant,supplier));
        String scope = "";
        if (stations != null) {
            if (stations.isEmpty()) return List.of();
            scope = " AND p.station_id IN (" + String.join(",",java.util.Collections.nCopies(stations.size(),"?")) + ")";
            params.addAll(stations);
        }
        List<Map<String,Object>> out = new ArrayList<>();
        for (Map<String,Object> e : Db.all("SELECT e.*,p.invoice_number FROM purchase_events e JOIN purchase_invoices p ON p.id=e.invoice_id WHERE p.tenant_id=? AND p.supplier_id=?"+scope,params.toArray())) {
            boolean ret = "RETURN".equals(e.get("kind"));
            out.add(Web.map("id",e.get("id"),"date",e.get("occurred_at"),"type",ret ? "PURCHASE_RETURN" : "PURCHASE","description",(ret ? "Fuel return · " : "Fuel receipt · ")+e.get("invoice_number"),"reference",e.get("invoice_number"),"debit",ret ? "0.00" : Money.money(e.get("amount")),"credit",ret ? Money.money(e.get("amount")) : "0.00"));
        }
        return out;
    }
}
