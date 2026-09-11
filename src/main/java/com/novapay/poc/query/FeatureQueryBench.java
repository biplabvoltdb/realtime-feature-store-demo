package com.novapay.poc.query;

import org.voltdb.VoltTable;
import org.voltdb.client.Client2;
import org.voltdb.client.Client2Config;
import org.voltdb.client.ClientFactory;
import org.voltdb.client.ClientResponse;

import java.util.Arrays;
import java.util.SplittableRandom;

/**
 * Feature-read latency benchmark (v4). Mixes hot-tier reads (5m/1h/24h — raw,
 * exact) with warm-tier reads (30d — daily buckets) and merchant-tier reads
 * (minute buckets), at a paced QPS, and reports client-observed round-trip
 * percentiles every 10s. Customer ids are numeric 12-digit longs (PoV §2.1).
 *
 * Usage:
 *   java -cp target/novapay-feature-store-all.jar:$VOLTDB_HOME/voltdb/voltdbclient-*.jar \
 *        com.novapay.poc.query.FeatureQueryBench [qps] [numCustomers] [server]
 *   defaults: qps=500, numCustomers=10000000, server=localhost:21212
 */
public final class FeatureQueryBench {

    private static final long CUSTOMER_BASE = 100_000_000_000L;
    private static final int[] WINDOWS_MINUTES = {5, 60, 1440, 43200}; // 5m, 1h, 24h(hot) + 30d(warm)

    public static void main(String[] args) throws Exception {
        int qps           = args.length > 0 ? Integer.parseInt(args[0]) : 500;
        long numCustomers = args.length > 1 ? Long.parseLong(args[1]) : 10_000_000L;
        String server     = args.length > 2 ? args[2] : "localhost:21212";
        String host = server.contains(":") ? server.split(":")[0] : server;
        int port = server.contains(":") ? Integer.parseInt(server.split(":")[1]) : 21212;

        Client2 client = ClientFactory.createClient(new Client2Config());
        client.connectSync(host, port);
        System.out.printf("FeatureQueryBench v4: %,d qps against %s, %,d customers, windows=%s + merchant reads%n",
                qps, server, numCustomers, Arrays.toString(WINDOWS_MINUTES));

        SplittableRandom rnd = new SplittableRandom();

        ClientResponse sample = client.callProcedureSync("GetRollingFeatures",
                CUSTOMER_BASE + rnd.nextLong(numCustomers), 1440);
        for (VoltTable t : sample.getResults()) System.out.println(t.toFormattedString());

        long[] lat = new long[200_000];
        int n = 0;
        long reportStart = System.nanoTime();
        long issued = 0, errors = 0;

        while (true) {
            long t0 = System.nanoTime();
            try {
                ClientResponse r;
                if (rnd.nextInt(10) == 0) { // 10% merchant-tier reads
                    String merchantId = "M-" + String.format("%05d", rnd.nextInt(500)); // hot merchants
                    r = client.callProcedureSync("GetMerchantFeatures", merchantId,
                            new int[]{5, 60, 1440}[rnd.nextInt(3)]);
                } else {
                    long customerId = CUSTOMER_BASE + rnd.nextLong(numCustomers);
                    int window = WINDOWS_MINUTES[rnd.nextInt(WINDOWS_MINUTES.length)];
                    r = client.callProcedureSync("GetRollingFeatures", customerId, window);
                }
                if (r.getStatus() != ClientResponse.SUCCESS) errors++;
            } catch (Exception ex) {
                errors++;
            }
            long micros = (System.nanoTime() - t0) / 1000;
            if (n < lat.length) lat[n++] = micros;
            issued++;

            long expectedNanos = issued * 1_000_000_000L / qps;
            long behind = expectedNanos - (System.nanoTime() - reportStart);
            if (behind > 2_000_000) Thread.sleep(behind / 1_000_000);

            if (System.nanoTime() - reportStart > 10_000_000_000L) {
                report(lat, n, issued, errors);
                n = 0; issued = 0; errors = 0;
                reportStart = System.nanoTime();
            }
        }
    }

    private static void report(long[] lat, int n, long issued, long errors) {
        if (n == 0) return;
        long[] s = Arrays.copyOf(lat, n);
        Arrays.sort(s);
        System.out.printf(
            "queries=%,d errors=%,d | latency ms: p50=%.2f p95=%.2f p99=%.2f p99.9=%.2f max=%.2f%n",
            issued, errors,
            s[(int) (n * 0.50)] / 1000.0,
            s[(int) (n * 0.95)] / 1000.0,
            s[Math.min(n - 1, (int) (n * 0.99))] / 1000.0,
            s[Math.min(n - 1, (int) (n * 0.999))] / 1000.0,
            s[n - 1] / 1000.0);
    }
}
