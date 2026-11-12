package in.petrolflow;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public final class Main {
    public static final long STARTED_AT_MS = System.currentTimeMillis();

    private Main() {}

    public static void main(String[] args) throws Exception {
        Set<String> flags = new HashSet<>(Arrays.asList(args));
        Config config;
        try {
            config = Config.load();
        } catch (IllegalStateException invalid) {
            System.err.println("PetroFlow configuration error:");
            System.err.println(invalid.getMessage());
            System.err.println("The API did not start.");
            exitOnConfigurationError();
            return;
        }
        boolean bootstrap = flags.contains("--bootstrap-owner") || flags.contains("--bootstrap");
        boolean reset = flags.contains("--reset-db");

        // Audit finding D6: a destructive reset is refused in production *before* any database
        // connection is opened, so no statement of any kind can run against that database.
        if (reset) {
            try {
                assertResetAllowed(config);
            } catch (IllegalStateException refused) {
                System.err.println();
                System.err.println(refused.getMessage());
                System.err.println();
                System.err.println("Nothing was reset. The API did not start.");
                System.exit(1);
                return;
            }
        }
        if (bootstrap && reset) {
            System.err.println("--bootstrap-owner cannot be combined with --reset-db. Run them as two separate steps.");
            System.exit(1);
            return;
        }

        System.out.println("PetroFlow Java API — MySQL " + config.dbUser + "@" + config.dbHost + ":" + config.dbPort + "/" + config.dbName);
        System.out.println("Environment: " + config.env + " · demo tools: " + config.demoTools
                + " · demo seed: " + config.seedDemo + " · trusted proxy: " + config.trustProxy);
        try {
            Db.open(config);
        } catch (ApiException unreachable) {
            System.err.println();
            System.err.println("PetroFlow cannot open a MySQL connection: " + unreachable.getMessage());
            System.err.println("Target: " + config.dbUser + "@" + config.dbHost + ":" + config.dbPort + "/" + config.dbName);
            exitOnConfigurationError();
            return;
        }
        try {
            DemoGuard.enforceProductionStartup(config);
        } catch (IllegalStateException blocked) {
            System.err.println();
            System.err.println(blocked.getMessage());
            System.err.println();
            System.err.println("The API did not start.");
            System.exit(1);
            return;
        }
        if (reset) {
            resetDatabase(config);
        }
        apply(config.mysqlDir().resolve("schema.sql"));
        if (bootstrap) {
            // Bootstrap replaces demo seeding: on an empty database it creates the first real owner.
            // It must never run after --reset-db in the same invocation (refused above).
            try {
                Bootstrap.runCli(config, args);
                System.exit(0);
            } catch (Bootstrap.BootstrapException refused) {
                System.err.println();
                System.err.println("Bootstrap refused: " + refused.getMessage());
                System.err.println("Nothing was created.");
                System.exit(1);
            } catch (ApiException failure) {
                System.err.println();
                System.err.println("Bootstrap failed: " + failure.getMessage());
                System.err.println("Nothing was created (the transaction was rolled back).");
                System.exit(1);
            }
            return;
        }
        seedIfEmpty(config);
        if (flags.contains("--check-only") || flags.contains("--migrate-only")) {
            System.out.println("Database schema & seed check completed.");
            return;
        }
        Web web = buildWeb(config);
        web.listen();
    }

    /**
     * Explains the most common reason the API refuses to boot, then exits.
     *
     * <p>Between {@code npm run dev} starting the frontend and this process failing, the only
     * symptom a user sees is "500 /api/v1/..." on every screen. A bare stack trace gives no hint
     * that MySQL is the missing piece, so print the actionable checklist before exiting.
     */
    private static void exitOnConfigurationError() {
        System.err.println();
        System.err.println("Most likely fixes, in order:");
        System.err.println("  1. MySQL 8 must be running on the host and port in .env (default 127.0.0.1:3306).");
        System.err.println("     Windows: net start MySQL80      Linux: sudo systemctl start mysql");
        System.err.println("  2. The database name in MYSQL_DATABASE / PETROFLOW_DB_NAME must be reachable");
        System.err.println("     by MYSQL_USER; on a fresh machine use your MySQL root credentials first.");
        System.err.println("  3. Copy .env.example to .env and adjust MYSQL_USER / MYSQL_PASSWORD.");
        System.err.println("  4. This process needs JDK 21: run 'java -version' and 'gradlew.bat -v'.");
        System.err.println();
        System.err.println("The frontend alone cannot serve data; it proxies /api to this process on port "
                + "4000 by default.");
        System.exit(1);
    }

    public static Web buildWeb(Config config) {
        Web web = new Web(config);
        AuthRoutes.register(web);
        CatalogApi.register(web);
        ShiftApi.register(web);
        FinanceApi.register(web);
        PurchaseApi.register(web);
        CreditBillingApi.register(web);
        ReportApi.register(web);
        OpsApi.register(web);
        return web;
    }

    /**
     * Audit finding D6: destructive resets are a development/test tool only. Called before any
     * database connection is opened, so a refused production reset executes no SQL at all.
     */
    public static void assertResetAllowed(Config config) {
        if (config != null && config.production) {
            throw new IllegalStateException(
                    "Refusing --reset-db: NODE_ENV=production. Resetting would drop every table in "
                            + config.dbName + ", including real shifts, sales, payments and ledger history.\n"
                            + "Reset is allowed only in development/test. To recreate a production database "
                            + "deliberately, restore a backup instead.");
        }
    }

    public static void resetDatabase(Config config) {
        // Defense in depth: even if a future caller skips the CLI check, no production reset can run.
        assertResetAllowed(config);
        Db.withConnection(() -> {
            Db.exec("SET FOREIGN_KEY_CHECKS = 0");
            try {
                for (var row : Db.all("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?", config.dbName)) {
                    String t = Db.str(row, "t");
                    if (t != null && !t.isBlank()) {
                        Db.exec("DROP TABLE IF EXISTS `" + t.replace("`", "``") + "`");
                    }
                }
            } finally {
                Db.exec("SET FOREIGN_KEY_CHECKS = 1");
            }
            return null;
        });
    }

    public static void apply(Path file) throws Exception {
        if (!Files.isRegularFile(file)) throw new IllegalStateException("Missing schema: " + file);
        String content = Files.readString(file);
        try {
            Db.withConnectionVoid(() -> {
                int applied = 0;
                for (String statement : Mysql.split(content)) {
                    String sql = statement.trim();
                    if (sql.isEmpty()) continue;
                    try {
                        Db.exec(sql);
                        applied++;
                    } catch (RuntimeException error) {
                        throw new IllegalStateException("Schema failed near: " + sql.substring(0, Math.min(160, sql.length())), error);
                    }
                }
                System.out.println("Schema applied (" + applied + " statements) from " + file);
            });
        } catch (Db.CheckedWrapper cw) {
            throw cw.causeException;
        }
    }

    public static void seedIfEmpty(Config config) throws Exception {
        // Defense in depth: Config already rejects SEED_DEMO_DATA=true in production, and this second
        // guard means no future caller can ever load demo rows into a production database.
        if (config.production) {
            System.out.println("Seed skipped — production environment never loads demo data");
            return;
        }
        if (!config.seedDemo) return;
        if (Db.count("SELECT COUNT(*) AS count FROM users") > 0) {
            System.out.println("Seed skipped — users already exist");
            return;
        }
        Path seed = config.mysqlDir().resolve("seed.sql");
        if (!Files.isRegularFile(seed)) {
            System.out.println("Seed skipped — " + seed + " is missing");
            return;
        }
        String sql = Files.readString(seed).replaceAll("(?m)^SET\\s+.*$", "");
        Db.withConnection(() -> {
            Db.exec("SET FOREIGN_KEY_CHECKS = 0");
            int applied = 0;
            try {
                for (String statement : Mysql.split(sql)) {
                    String trimmed = statement.trim();
                    if (trimmed.isEmpty()) continue;
                    Db.exec(trimmed);
                    applied++;
                }
            } finally {
                Db.exec("SET FOREIGN_KEY_CHECKS = 1");
            }
            String now = Clock.nowIso();
            Db.exec("UPDATE hardware_devices SET last_heartbeat_at = ?, last_sync_at = ? WHERE status = 'ONLINE'", now, now);
            System.out.println("Demo seed loaded (" + applied + " statements) into a non-production database.");
            return null;
        });
    }
}
