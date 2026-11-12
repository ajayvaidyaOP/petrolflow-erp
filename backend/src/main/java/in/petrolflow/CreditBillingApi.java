package in.petrolflow;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/** Consolidates existing credit slips into immutable bills. Never posts sales, stock or credit twice. */
public final class CreditBillingApi {
    private CreditBillingApi() {}

    public static void register(Web web) {
        web.get("/credit-billing/unbilled", CreditBillingApi::unbilled);
        web.get("/credit-billing/bills", CreditBillingApi::list);
        web.get("/credit-billing/bills/:id", CreditBillingApi::detail);
        web.post("/credit-billing/bills", CreditBillingApi::issue);
        web.post("/credit-billing/bills/:id/void", CreditBillingApi::voidBill);
    }

    private static String require(String value, String field, int max) {
        if (value == null || value.trim().isEmpty() || value.trim().length() > max) throw ApiException.validation(field,"Required, maximum " + max + " characters");
        return value.trim();
    }

    private static String station(Auth auth, Web.Ctx ctx) {
        String id = ctx.q("stationId"); auth.station(id); return id;
    }

    private static void unbilled(Web.Ctx ctx) {
        Auth auth = ctx.requireAuth(); auth.require("customers.read");
        String station = station(auth,ctx);
        String customer = require(ctx.q("customerId"),"customerId",64);
        if (Db.one("SELECT id FROM customers WHERE id=? AND tenant_id=?",customer,auth.tenantId())==null) throw ApiException.notFound("Customer not found");
        List<Object> params = new ArrayList<>(List.of(auth.tenantId(),station,customer));
        String where = " WHERE ce.tenant_id=? AND ce.station_id=? AND ce.customer_id=? AND ce.type='CREDIT_SALE' AND ce.status='POSTED' AND CAST(ce.amount AS DECIMAL(20,2))>0 AND NOT EXISTS (SELECT 1 FROM credit_bill_items bi WHERE bi.active_credit_entry_id=ce.id)";
        if (ctx.q("from")!=null && !ctx.q("from").isBlank()) { where+=" AND ce.occurred_at>=?"; params.add(Clock.istDayStart(Domain.requireDate(ctx.q("from"),"From date"))); }
        if (ctx.q("to")!=null && !ctx.q("to").isBlank()) { where+=" AND ce.occurred_at<=?"; params.add(Clock.istDayEnd(Domain.requireDate(ctx.q("to"),"To date"))); }
        int page=Domain.pageOf(ctx),size=Domain.pageSize(ctx);
        long total=Db.count("SELECT COUNT(*) AS count FROM credit_entries ce"+where,params.toArray());
        params.add(size);params.add((page-1)*size);
        ctx.ok(Json.shapeAll(Db.all("SELECT ce.*,p.name AS product_name FROM credit_entries ce LEFT JOIN fuel_products p ON p.id=ce.product_id"+where+" ORDER BY ce.occurred_at,ce.id LIMIT ? OFFSET ?",params.toArray())),Domain.page(total,page,size));
    }

    private static void list(Web.Ctx ctx) {
        Auth auth=ctx.requireAuth();auth.require("customers.read");
        String station=station(auth,ctx);
        List<Object> params=new ArrayList<>(List.of(auth.tenantId(),station));
        String where=" WHERE b.tenant_id=? AND b.station_id=?";
        if (ctx.q("customerId")!=null && !ctx.q("customerId").isBlank()) {where+=" AND b.customer_id=?";params.add(ctx.q("customerId"));}
        int page=Domain.pageOf(ctx),size=Domain.pageSize(ctx);
        long total=Db.count("SELECT COUNT(*) AS count FROM credit_bills b"+where,params.toArray());
        params.add(size);params.add((page-1)*size);
        ctx.ok(Json.shapeAll(Db.all("SELECT b.*,c.name AS customer_name FROM credit_bills b JOIN customers c ON c.id=b.customer_id"+where+" ORDER BY b.created_at DESC,b.id DESC LIMIT ? OFFSET ?",params.toArray())),Domain.page(total,page,size));
    }

    private static Map<String,Object> load(Auth auth,String id,boolean lock) {
        Map<String,Object> bill=Db.one("SELECT * FROM credit_bills WHERE id=? AND tenant_id=?"+(lock ? " FOR UPDATE" : ""),id,auth.tenantId());
        if (bill==null) throw ApiException.notFound("Credit bill not found");
        auth.station(Db.str(bill,"station_id"));return bill;
    }

    private static void detail(Web.Ctx ctx) {
        Auth auth=ctx.requireAuth();auth.require("customers.read");
        Map<String,Object> bill=Json.shape(load(auth,ctx.p("id"),false),List.of("customer_snapshot"));
        bill.put("items",Json.shapeAll(Db.all("SELECT * FROM credit_bill_items WHERE bill_id=? ORDER BY id",ctx.p("id")),List.of("entry_snapshot")));
        ctx.ok(bill);
    }

    private static void issue(Web.Ctx ctx) {
        Auth auth=ctx.requireAuth();auth.require("sales.write");auth.require("customers.read");
        String station=require(ctx.str("stationId"),"stationId",64);
        String customer=require(ctx.str("customerId"),"customerId",64);
        String date=Domain.requireDate(ctx.str("billDate"),"Bill date");
        String due=Domain.requireDate(ctx.str("dueDate"),"Due date");
        if (due.compareTo(date)<0) throw ApiException.validation("dueDate","Due date cannot precede bill date");
        Object raw=ctx.body().get("entryIds");
        if (!(raw instanceof List<?> list) || list.isEmpty() || list.size()>200) throw ApiException.validation("entryIds","Select between 1 and 200 slips");
        TreeSet<String> ids=new TreeSet<>();
        for (Object id : (List<?>)raw) if (!(id instanceof String s) || !ids.add(require(s,"entryId",64))) throw ApiException.validation("entryIds","Invalid or duplicate slip id");
        String notes=ctx.str("notes")==null ? "" : ctx.str("notes");
        if (notes.length()>4000) throw ApiException.validation("notes","Maximum 4000 characters");
        String id=Db.tx(() -> {
            auth.station(station);Domain.assertDayOpen(station,date);
            Map<String,Object> cust=Db.one("SELECT id,code,name,phone,gstin,address,status FROM customers WHERE id=? AND tenant_id=? FOR UPDATE",customer,auth.tenantId());
            if (cust==null) throw ApiException.notFound("Customer not found");
            if (!"ACTIVE".equals(cust.get("status"))) throw ApiException.conflict("Customer is blocked");
            List<Map<String,Object>> entries=new ArrayList<>();BigDecimal total=BigDecimal.ZERO;
            for (String key : ids) {
                Map<String,Object> entry=Db.one("SELECT * FROM credit_entries WHERE id=? AND tenant_id=? AND station_id=? AND customer_id=? FOR UPDATE",key,auth.tenantId(),station,customer);
                if (entry==null || !"CREDIT_SALE".equals(entry.get("type")) || !"POSTED".equals(entry.get("status")) || Money.d(entry.get("amount")).signum()<=0) throw ApiException.validation("entryIds","Select posted credit-sale slips for this customer and station only");
                if (Clock.businessDateOf(Db.str(entry,"occurred_at")).compareTo(date)>0) throw ApiException.validation("billDate","Bill date cannot precede a selected credit sale");
                if (Db.one("SELECT id FROM credit_bill_items WHERE active_credit_entry_id=?",key)!=null) throw ApiException.conflict("One or more slips are already billed; refresh the list");
                entries.add(entry);total=total.add(Money.d(entry.get("amount")));
            }
            if (total.precision()>18) throw ApiException.validation("amount","Bill total is too large");
            String key=Clock.newId("cbl"),number=ctx.str("billNumber");
            if (number==null || number.isBlank()) number="CB-"+date.replace("-","")+"-"+key.substring(key.length()-12).toUpperCase();
            number=require(number,"billNumber",120);
            if (Db.one("SELECT id FROM credit_bills WHERE tenant_id=? AND bill_number=?",auth.tenantId(),number)!=null) throw ApiException.conflict("Bill number already exists");
            Db.exec("INSERT INTO credit_bills(id,tenant_id,station_id,customer_id,bill_number,bill_date,due_date,total_amount,customer_snapshot,notes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",key,auth.tenantId(),station,customer,number,date,due,Money.money(total),Json.stringify(Web.map("customer",Json.shape(cust),"issuer",Json.shape(Db.one("SELECT name,legal_name,gstin,address FROM tenants WHERE id=?",auth.tenantId())),"station",Json.shape(Db.one("SELECT name,address,city,state FROM stations WHERE id=?",station)))),notes,auth.userId,Clock.nowIso());
            for (Map<String,Object> entry : entries) Db.exec("INSERT INTO credit_bill_items(id,bill_id,credit_entry_id,active_credit_entry_id,amount,entry_snapshot) VALUES (?,?,?,?,?,?)",Clock.newId("cbi"),key,entry.get("id"),entry.get("id"),Money.money(entry.get("amount")),Json.stringify(Json.shape(entry)));
            Auth.auditRequired(auth,"CREDIT_BILL_ISSUED","CreditBill",key,station,number+" · "+entries.size()+" existing slips",null,Web.map("entryIds",ids,"totalAmount",Money.money(total)));
            return key;
        });
        ctx.created(Web.map("id",id));
    }

    private static void voidBill(Web.Ctx ctx) {
        Auth auth=ctx.requireAuth();auth.require("sales.write");auth.require("customers.read");
        String reason=require(ctx.str("reason"),"reason",1000);
        if (reason.length()<5) throw ApiException.validation("reason","Minimum 5 characters");
        Db.tx(() -> {
            Map<String,Object> bill=load(auth,ctx.p("id"),true);
            if (!"ISSUED".equals(bill.get("status"))) throw ApiException.conflict("Bill is already void");
            Domain.assertDayOpen(Db.str(bill,"station_id"),Db.str(bill,"bill_date"));
            Domain.assertDayOpen(Db.str(bill,"station_id"),Clock.todayIst());
            Db.exec("UPDATE credit_bills SET status='VOID',void_reason=?,voided_at=? WHERE id=?",reason,Clock.nowIso(),bill.get("id"));
            Db.exec("UPDATE credit_bill_items SET active_credit_entry_id=NULL WHERE bill_id=?",bill.get("id"));
            Auth.auditRequired(auth,"CREDIT_BILL_VOIDED","CreditBill",Db.str(bill,"id"),Db.str(bill,"station_id"),reason,bill,null);
            return null;
        });
        ctx.ok(Web.map("id",ctx.p("id"),"status","VOID"));
    }
}
