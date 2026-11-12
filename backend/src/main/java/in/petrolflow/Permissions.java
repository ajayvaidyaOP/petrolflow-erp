package in.petrolflow;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class Permissions {
    public static final List<String> ALL = List.of(
            "platform.manage", "platform.audit",
            "stations.read", "stations.write", "products.read", "products.write", "prices.write",
            "tanks.read", "tanks.write", "dispensers.read", "dispensers.write",
            "employees.read", "employees.write",
            "devices.read", "devices.write", "readings.read", "readings.manual",
            "shifts.read", "shifts.open", "shifts.close", "shifts.approve",
            "sales.read", "sales.write", "stock.read", "stock.write",
            "deliveries.read", "deliveries.write",
            "customers.read", "customers.write", "suppliers.read", "suppliers.write",
            "payments.read", "payments.write", "expenses.read", "expenses.write",
            "reconciliation.read", "reconciliation.write", "reports.read",
            "density.read", "density.write", "dayclose.manage",
            "compliance.read", "compliance.write", "lubricants.read", "lubricants.write",
            "attendance.read", "attendance.write", "audit.read",
            "settings.read", "settings.write", "billing.read");

    private static final Set<String> BLOCKED = Set.of("platform.manage", "platform.audit", "employees.write");
    private static final List<String> MANAGER = List.of(
            "stations.read", "products.read", "tanks.read", "dispensers.read",
            "devices.read", "readings.read", "readings.manual",
            "shifts.read", "shifts.open", "shifts.close", "shifts.approve",
            "sales.read", "sales.write", "stock.read", "stock.write",
            "deliveries.read", "deliveries.write", "customers.read", "customers.write",
            "suppliers.read", "payments.read", "payments.write", "expenses.read", "expenses.write",
            "reconciliation.read", "reconciliation.write", "reports.read",
            "density.read", "density.write", "dayclose.manage",
            "compliance.read", "lubricants.read", "lubricants.write",
            "attendance.read", "attendance.write");

    /**
     * Reference lists that screens use to label or pick things: the nozzle on a meter reading, the tank
     * on a delivery, the product on a credit slip, today's rate on the overview. A login that holds any
     * one of the listed permissions may read the list, because the screen that permission opens cannot
     * work without it. The first entry is the list's own permission and the one named in a refusal.
     * Changing the records still needs the dedicated write permission.
     *
     * <p>The web app mirrors this table in frontend/src/shared/permissions.ts (LOOKUP_ACCESS). Keep the
     * two in step.
     */
    private static final Map<String, List<String>> LOOKUPS = Map.of(
            "products", List.of("products.read", "stock.read", "tanks.read", "deliveries.read", "density.read",
                    "dispensers.read", "sales.write"),
            "prices", List.of("products.read", "reports.read"),
            "tanks", List.of("tanks.read", "stock.read", "deliveries.read", "density.read", "dispensers.read",
                    "compliance.read"),
            "dispensers", List.of("dispensers.read", "compliance.read"),
            "nozzles", List.of("dispensers.read", "readings.read", "sales.read"));

    private Permissions() {}

    /** The permissions that open a reference list; any one is enough. */
    public static List<String> lookup(String list) {
        List<String> anyOf = LOOKUPS.get(list);
        if (anyOf == null) throw new IllegalArgumentException("Unknown reference list: " + list);
        return anyOf;
    }

    public static List<String> forRole(String role) {
        return switch (role == null ? "" : role) {
            case "OWNER" -> ALL.stream().filter(p -> !BLOCKED.contains(p) || "employees.write".equals(p)).filter(p -> !p.startsWith("platform.")).toList();
            case "MANAGER" -> MANAGER;
            case "SUPER_ADMIN" -> List.of("platform.manage", "platform.audit", "settings.read");
            default -> List.of();
        };
    }

    public static List<String> sanitize(Object raw) {
        Set<String> seen = new LinkedHashSet<>();
        for (String value : Auth.grants(raw)) {
            if (ALL.contains(value) && !BLOCKED.contains(value)) seen.add(value);
        }
        return new ArrayList<>(seen);
    }
}
