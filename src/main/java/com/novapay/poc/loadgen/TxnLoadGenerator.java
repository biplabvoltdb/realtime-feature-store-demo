package com.novapay.poc.loadgen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Properties;
import java.util.SplittableRandom;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Kafka load generator (v4) — aligned to PoV §2.1 / §2.2 / §8 / §10:
 *
 *  - customer_id is a NUMERIC 12-digit long (§2.1 contract), default
 *    cardinality 10 million subjects (§8)
 *  - multiple event types: TXN (85%), MANDATE (12%), REFUND (3%) — §4.1's
 *    filters are cross-type (event_type = A; event_type = B AND txn_type = C)
 *  - merchant traffic is skewed: 10% "hot" merchants receive 80% of events,
 *    matching real merchant behaviour (~50 events/min at busy merchants)
 *  - §7 edge cases injected: 0.2% unparseable created_at, 0.2% missing
 *    subject key, 0.3% events beyond the lateness bound, ~2% payment retries
 *    (duplicate txn_id) — all exercised against the dead-letter path and
 *    dedupe (§2.2, T16, C5)
 *  - 48 flat fields, ~1.5 KB average (§8)
 *
 * Usage:
 *   java -cp target/novapay-feature-store-all.jar com.novapay.poc.loadgen.TxnLoadGenerator \
 *        [eps] [numCustomers] [bootstrap] [topic]
 *   defaults: eps=2000, numCustomers=10000000, bootstrap=localhost:9092, topic=novapay-txn-events
 */
public final class TxnLoadGenerator {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final long CUSTOMER_BASE = 100_000_000_000L; // 12-digit ids

    private static final String[] TXN_TYPES     = {"UPI_P2M", "UPI_P2P", "CARD_PAY", "WALLET_PAY", "NET_BANKING"};
    private static final String[] MANDATE_TYPES = {"AUTO_DEBIT", "AUTO_DEBIT", "AUTO_DEBIT", "SI_REGISTER"};
    private static final String[] RESULTS       = {"SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "INITIATED", "FAILED"};
    private static final String[] BANKS         = {"HDFC", "ICICI", "SBI", "AXIS", "KOTAK", "YES", "PNB", "BOB"};
    private static final String[] CHANNELS      = {"APP_ANDROID", "APP_IOS", "WEB", "MWEB", "POS"};
    private static final String[] OS            = {"ANDROID_14", "ANDROID_13", "IOS_17", "IOS_16"};
    private static final String[] MODELS        = {"RedmiNote12", "GalaxyM34", "iPhone13", "iPhone15", "OnePlusNordCE", "VivoY200", "RealmeNarzo60"};
    private static final String[] CITIES        = {"Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Noida", "Jaipur", "Lucknow"};
    private static final String[] STATES        = {"MH", "DL", "KA", "TG", "TN", "WB", "MH", "UP", "RJ", "UP"};
    private static final String[] SETTLEMENT    = {"T0", "T1", "INSTANT"};
    private static final String[] CATEGORIES    = {"GROCERY", "FUEL", "FOOD", "TRAVEL", "RECHARGE", "BILLPAY", "ECOM", "ENTERTAINMENT"};
    private static final String[] INIT_MODES    = {"QR_SCAN", "INTENT", "COLLECT", "SAVED_CARD", "ONE_TAP"};
    private static final String[] AUTH_TYPES    = {"UPI_PIN", "OTP", "3DS", "BIOMETRIC", "DEVICE_BINDING"};
    private static final String[] CARD_NETWORKS = {"RUPAY", "VISA", "MASTERCARD", "AMEX"};
    private static final String[] KYC           = {"FULL", "FULL", "FULL", "MIN"};
    private static final String[] PURPOSE_CODES = {"P2M_RETAIL", "P2P_TRANSFER", "BILL_PAYMENT", "SUBSCRIPTION", "EMI_COLLECTION"};

    public static void main(String[] args) throws Exception {
        int eps          = args.length > 0 ? Integer.parseInt(args[0]) : 2000;
        long numCustomers = args.length > 1 ? Long.parseLong(args[1]) : 10_000_000L;
        String bootstrap = args.length > 2 ? args[2] : "localhost:9092";
        String topic     = args.length > 3 ? args[3] : "novapay-txn-events";
        int numMerchants = 5000;
        int hotMerchants = numMerchants / 10;   // 10% of merchants get 80% of traffic
        double retryPct = 0.02, badTsPct = 0.002, noKeyPct = 0.002, latePct = 0.003;

        Properties p = new Properties();
        p.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrap);
        p.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        p.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        p.put(ProducerConfig.ACKS_CONFIG, "1");
        p.put(ProducerConfig.LINGER_MS_CONFIG, "5");
        p.put(ProducerConfig.BATCH_SIZE_CONFIG, "131072");
        p.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "lz4");

        System.out.printf("TxnLoadGenerator v4: %,d eps -> %s @ %s | %,d customers (numeric 12-digit), " +
                "%,d merchants (80%% of traffic to hot %,d), retries=%.1f%%, edge cases: badTs=%.1f%% noKey=%.1f%% late=%.1f%%%n",
                eps, topic, bootstrap, numCustomers, numMerchants, hotMerchants,
                retryPct * 100, badTsPct * 100, noKeyPct * 100, latePct * 100);

        SplittableRandom rnd = new SplittableRandom();
        AtomicLong sent = new AtomicLong();
        AtomicLong errors = new AtomicLong();
        ArrayDeque<Object[]> recentTxns = new ArrayDeque<>(512); // (customerId, txnId) for retries
        long txnSeq = System.currentTimeMillis() * 1000L;

        try (KafkaProducer<String, String> producer = new KafkaProducer<>(p)) {
            Runtime.getRuntime().addShutdownHook(new Thread(() ->
                System.out.printf("%nStopped. total sent=%,d errors=%,d%n", sent.get(), errors.get())));

            long windowStart = System.nanoTime();
            long lastReport = windowStart;
            long sentInWindow = 0;

            while (true) {
                long customerId;
                String txnId;
                boolean retry = !recentTxns.isEmpty() && rnd.nextDouble() < retryPct;
                if (retry) {
                    Object[] prev = recentTxns.pollFirst();
                    customerId = (Long) prev[0];
                    txnId = (String) prev[1];
                } else {
                    customerId = CUSTOMER_BASE + rnd.nextLong(numCustomers);
                    txnId = "txn_" + (++txnSeq);
                    if (recentTxns.size() >= 500) recentTxns.pollLast();
                    recentTxns.addFirst(new Object[]{customerId, txnId});
                }

                // §7 edge cases (skip on retries so dedupe stays clean)
                double edge = retry ? 1.0 : rnd.nextDouble();
                boolean badTs   = edge < badTsPct;
                boolean noKey   = !badTs && edge < badTsPct + noKeyPct;
                boolean late    = !badTs && !noKey && edge < badTsPct + noKeyPct + latePct;

                String payload = buildEvent(rnd, customerId, txnId, retry,
                        numMerchants, hotMerchants, badTs, noKey, late);
                producer.send(new ProducerRecord<>(topic, String.valueOf(customerId), payload), (md, ex) -> {
                    if (ex != null) errors.incrementAndGet(); else sent.incrementAndGet();
                });

                sentInWindow++;
                long sliceTarget = Math.max(1, eps / 100);
                if (sentInWindow % sliceTarget == 0) {
                    long expectedNanos = sentInWindow * 1_000_000_000L / eps;
                    long behind = expectedNanos - (System.nanoTime() - windowStart);
                    if (behind > 1_000_000) Thread.sleep(behind / 1_000_000);
                }
                if (sentInWindow >= eps * 10L) { windowStart = System.nanoTime(); sentInWindow = 0; }

                long now = System.nanoTime();
                if (now - lastReport > 10_000_000_000L) {
                    System.out.printf("sent=%,d errors=%,d (~%,d eps target)%n", sent.get(), errors.get(), eps);
                    lastReport = now;
                }
            }
        }
    }

    /** 48 flat fields per the §2.1 contract + extrapolation, ~1.5 KB. */
    static String buildEvent(SplittableRandom rnd, long customerId, String txnId, boolean retry,
                             int numMerchants, int hotMerchants,
                             boolean badTs, boolean noKey, boolean late) throws Exception {
        // event-type mix: 85% TXN, 12% MANDATE, 3% REFUND
        int typeRoll = rnd.nextInt(100);
        String eventType = typeRoll < 85 ? "TXN" : (typeRoll < 97 ? "MANDATE" : "REFUND");
        String txnType = "MANDATE".equals(eventType) ? pick(rnd, MANDATE_TYPES) : pick(rnd, TXN_TYPES);
        boolean isCard = "CARD_PAY".equals(txnType);
        double amount = Math.round(rnd.nextDouble(10.0, 25_000.0) * 100.0) / 100.0;

        // merchant skew: 80% of traffic to the hot 10% -> busy merchants
        // genuinely see tens of events per minute (the minute-bucket tier)
        String merchantId = rnd.nextInt(100) < 80
            ? "M-" + String.format("%05d", rnd.nextInt(hotMerchants))
            : "M-" + String.format("%05d", hotMerchants + rnd.nextInt(numMerchants - hotMerchants));
        int cityIdx = rnd.nextInt(CITIES.length);

        String createdAt = badTs ? "not-a-timestamp"
            : late ? Instant.now().minusSeconds(3 * 86_400L).toString()   // beyond the 1-day lateness bound
            : Instant.now().toString();

        ObjectNode e = JSON.createObjectNode();
        // --- the §2.1 contract fields ---
        e.put("event_type", eventType);
        if (!noKey) e.put("customer_id", customerId);   // numeric long, 12 digits
        e.put("txn_id", txnId);
        e.put("created_at", createdAt);
        e.put("amount", amount);
        e.put("currency", "INR");
        e.put("txn_type", txnType);
        e.put("payment_result", retry ? "SUCCESS" : pick(rnd, RESULTS));
        e.put("merchant_id", merchantId);
        e.put("city", CITIES[cityIdx]);
        // --- extrapolated flat fields to 48 total ---
        e.put("payer_vpa", "xxxxxxxx" + rnd.nextInt(10, 99) + "@novapay");
        e.put("payee_vpa", "merchant" + merchantId.substring(2) + "@ybl");
        e.put("payer_bank", pick(rnd, BANKS));
        e.put("payee_bank", pick(rnd, BANKS));
        e.put("payer_ifsc", pick(rnd, BANKS) + "000" + rnd.nextInt(1000, 9999));
        e.put("payee_ifsc", pick(rnd, BANKS) + "000" + rnd.nextInt(1000, 9999));
        e.put("mcc_code", String.valueOf(rnd.nextInt(5000, 6000)));
        e.put("channel", pick(rnd, CHANNELS));
        e.put("device_id", "dev-" + Long.toHexString(rnd.nextLong()));
        e.put("device_os", pick(rnd, OS));
        e.put("device_model", pick(rnd, MODELS));
        e.put("app_version", "10." + rnd.nextInt(0, 40) + "." + rnd.nextInt(0, 9));
        e.put("ip_address", rnd.nextInt(10, 250) + "." + rnd.nextInt(0, 255) + "." + rnd.nextInt(0, 255) + "." + rnd.nextInt(1, 254));
        e.put("geo_lat", Math.round(rnd.nextDouble(8.0, 34.0) * 10000.0) / 10000.0);
        e.put("geo_lon", Math.round(rnd.nextDouble(68.0, 92.0) * 10000.0) / 10000.0);
        e.put("state", STATES[cityIdx]);
        e.put("country", "IN");
        e.put("pincode", String.valueOf(rnd.nextInt(110001, 855118)));
        e.put("kyc_level", pick(rnd, KYC));
        e.put("account_age_days", rnd.nextInt(1, 3650));
        e.put("session_id", "sess-" + Long.toHexString(rnd.nextLong()));
        e.put("order_id", "ord_" + rnd.nextLong(1_000_000_000L, 9_999_999_999L));
        e.put("ref_id", "ref_" + Long.toHexString(rnd.nextLong()));
        e.put("settlement_type", pick(rnd, SETTLEMENT));
        e.put("txn_category", pick(rnd, CATEGORIES));
        e.put("initiation_mode", pick(rnd, INIT_MODES));
        e.put("purpose_code", pick(rnd, PURPOSE_CODES));
        e.put("auth_type", pick(rnd, AUTH_TYPES));
        e.put("card_network", isCard ? pick(rnd, CARD_NETWORKS) : "");
        e.put("card_bin", isCard ? String.valueOf(rnd.nextInt(400000, 559999)) : "");
        e.put("card_last4", isCard ? String.format("%04d", rnd.nextInt(10000)) : "");
        e.put("emi_flag", isCard && rnd.nextInt(100) < 5);
        e.put("international_flag", rnd.nextInt(1000) < 3);
        e.put("risk_score", Math.round(rnd.nextDouble() * 1000.0) / 1000.0);
        e.put("velocity_flag", rnd.nextInt(100) < 2);
        e.put("whitelist_flag", rnd.nextInt(100) < 30);
        e.put("retry_count", retry ? 1 : 0);
        e.put("npci_txn_id", "NPCI" + rnd.nextLong(100_000_000_000L, 999_999_999_999L));

        return JSON.writeValueAsString(e);
    }

    private static String pick(SplittableRandom rnd, String[] a) {
        return a[rnd.nextInt(a.length)];
    }
}
