import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.json_voltpatches.JSONArray;
import org.json_voltpatches.JSONObject;
import org.voltdb.VoltTable;
import org.voltdb.client.Client;
import org.voltdb.client.ClientConfig;
import org.voltdb.client.ClientFactory;
import org.voltdb.client.ClientResponse;
import org.voltdb.client.ProcCallException;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Minimal JSON gateway for VoltDB clusters whose server no longer embeds the classic HTTP JSON API (V14+).
 * Speaks the classic contract so the console BFF is unchanged:
 *   GET/POST /api/1.0/?Procedure=<name>&Parameters=<json array>
 *   → {"status":1,"appstatus":-128,"statusstring":null,"appstatusstring":null,"results":[{"status":-128,"schema":[...],"data":[...]}]}
 * Binds to 127.0.0.1 only. Uses the VoltDB Java client wire protocol against the cluster.
 *
 *   javac -cp $VOLTDB_HOME/voltdb/voltdbclient-*.jar -d out VoltJsonGateway.java
 *   java  -cp $VOLTDB_HOME/voltdb/voltdbclient-*.jar:out VoltJsonGateway localhost:21212 8080
 */
public class VoltJsonGateway {
    private static Client client;

    public static void main(String[] args) throws Exception {
        String servers = args.length > 0 ? args[0] : "localhost:21212";
        int port = args.length > 1 ? Integer.parseInt(args[1]) : 8080;
        ClientConfig cfg = new ClientConfig();
        cfg.setTopologyChangeAware(true);
        cfg.setProcedureCallTimeout(30_000);
        client = ClientFactory.createClient(cfg);
        for (String s : servers.split(",")) {
            String h = s.contains(":") ? s.substring(0, s.indexOf(':')) : s.trim();
            int p = s.contains(":") ? Integer.parseInt(s.substring(s.indexOf(':') + 1).trim()) : 21212;
            client.createConnection(h.trim(), p);
        }
        HttpServer http = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        http.createContext("/api/1.0", VoltJsonGateway::handle);
        http.createContext("/api/1.0/", VoltJsonGateway::handle);
        http.createContext("/health", ex -> respond(ex, 200, "{\"ok\":true,\"connected\":" + (client.getConnectedHostList().size() > 0) + ",\"hosts\":" + client.getConnectedHostList().size() + "}"));
        http.setExecutor(Executors.newFixedThreadPool(8));
        http.start();
        System.out.println("[gateway] JSON API compatible endpoint on http://127.0.0.1:" + port + "/api/1.0/ -> VoltDB " + servers);
    }

    private static void handle(HttpExchange ex) {
        try {
            Map<String, String> params = new HashMap<>();
            if (ex.getRequestURI().getRawQuery() != null) parseForm(ex.getRequestURI().getRawQuery(), params);
            if ("POST".equalsIgnoreCase(ex.getRequestMethod())) {
                try (InputStream in = ex.getRequestBody()) { parseForm(new String(in.readAllBytes(), StandardCharsets.UTF_8), params); }
            }
            String procedure = params.get("Procedure");
            if (procedure == null || procedure.isEmpty()) { respond(ex, 400, envelope(ClientResponse.GRACEFUL_FAILURE, "Procedure parameter is required", null)); return; }
            Object[] args = toArgs(params.getOrDefault("Parameters", "[]"));
            ClientResponse r;
            try { r = client.callProcedure(procedure, args); }
            catch (ProcCallException e) { r = e.getClientResponse(); }
            respond(ex, 200, toJson(r));
        } catch (Exception e) {
            try { respond(ex, 200, envelope(ClientResponse.CONNECTION_LOST, "Gateway error: " + e.getClass().getSimpleName() + ": " + e.getMessage(), null)); } catch (Exception ignored) { }
        }
    }

    private static Object[] toArgs(String json) throws Exception {
        JSONArray arr = new JSONArray(json);
        List<Object> out = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            Object v = arr.isNull(i) ? null : arr.get(i);
            if (v == null) out.add(null);
            else if (v instanceof Integer || v instanceof Long) out.add(((Number) v).longValue());
            else if (v instanceof Number) { double d = ((Number) v).doubleValue(); out.add(d == Math.rint(d) && Math.abs(d) < 9.0e15 ? (Object) (long) d : (Object) d); }
            else if (v instanceof Boolean) out.add(((Boolean) v) ? 1L : 0L);
            else out.add(v.toString());
        }
        return out.toArray();
    }

    private static String toJson(ClientResponse r) throws Exception {
        StringBuilder sb = new StringBuilder(1024);
        sb.append("{\"status\":").append((int) r.getStatus())
          .append(",\"appstatus\":").append((int) r.getAppStatus())
          .append(",\"statusstring\":").append(JSONObject.quote(r.getStatusString()))
          .append(",\"appstatusstring\":").append(JSONObject.quote(r.getAppStatusString()))
          .append(",\"results\":[");
        VoltTable[] results = r.getResults() == null ? new VoltTable[0] : r.getResults();
        for (int i = 0; i < results.length; i++) { if (i > 0) sb.append(','); sb.append(results[i].toJSONString()); }
        sb.append("]}");
        return sb.toString();
    }

    private static String envelope(byte status, String statusstring, VoltTable[] results) {
        return "{\"status\":" + (int) status + ",\"appstatus\":-128,\"statusstring\":" + JSONObject.quote(statusstring) + ",\"appstatusstring\":null,\"results\":[]}";
    }

    private static void parseForm(String s, Map<String, String> into) throws Exception {
        for (String pair : s.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            String k = URLDecoder.decode(eq < 0 ? pair : pair.substring(0, eq), StandardCharsets.UTF_8);
            String v = eq < 0 ? "" : URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            into.put(k, v);
        }
    }

    private static void respond(HttpExchange ex, int code, String body) throws java.io.IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json;charset=utf-8");
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) { os.write(bytes); }
    }
}
