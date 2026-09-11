const NAV = [
  ["overview", "Overview", "home"],
  ["architecture", "Architecture", "network"],
  ["schema", "Schema & DDL", "database"],
  ["procedures", "Procedures", "braces"],
  ["sql", "SQL Console", "terminal"],
  ["explorer", "Feature Explorer", "search"],
  ["hygiene", "Ingest Hygiene", "shield"],
  ["benchmarks", "Benchmarks", "gauge"],
  ["sizing", "Sizing (§8)", "calculator"],
  ["runbook", "Demo Runbook", "checklist"],
  ["settings", "Settings", "settings"],
];

const TITLES = {
  overview: ["NovaPay Feature Store Console", "Real-time segmentation PoC v4 · Kafka → VoltSP → VoltDB"],
  architecture: ["Architecture", "Live event path · pipeline contract · tiered storage"],
  schema: ["Schema & DDL", "Repository definitions compared with the deployed VoltDB catalog"],
  procedures: ["Procedures", "Stored procedure source, signatures, execution, and plans"],
  sql: ["SQL Console", "Ad-hoc SQL, stored procedures, system statistics, and execution plans"],
  explorer: ["Feature Explorer", "Inspect customer and merchant features across hot and warm windows"],
  hygiene: ["Ingest Hygiene", "Rejected events, retry evidence, and physical TTL activity"],
  benchmarks: ["Benchmarks", "Server procedure performance and client benchmark evidence"],
  sizing: ["Sizing (§8)", "Measured table memory, bytes per subject, and RAM projection"],
  runbook: ["Demo Runbook", "Ten source-linked steps for a repeatable technical evaluation"],
  settings: ["Settings", "Connection, telemetry, safety, review mode, and presenter identity"],
};

const ICON_PATHS = {
  home: '<path d="M3 10.7 8 6.5l5 4.2v5.8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M6.2 17.3v-4.8h3.6v4.8"/>',
  network: '<circle cx="4" cy="5" r="1.7"/><circle cx="12" cy="4" r="1.7"/><circle cx="8" cy="14" r="1.7"/><path d="m5.6 5 4.7-.7M4.9 6.4l2.2 6M11 5.4l-2.1 6.9"/>',
  database: '<ellipse cx="8" cy="4" rx="5" ry="2.2"/><path d="M3 4v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V4M3 8v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V8"/>',
  braces: '<path d="M6 2.5H4.8A1.8 1.8 0 0 0 3 4.3v2.2c0 .8-.4 1.5-1.2 1.5.8 0 1.2.7 1.2 1.5v2.2a1.8 1.8 0 0 0 1.8 1.8H6M10 2.5h1.2A1.8 1.8 0 0 1 13 4.3v2.2c0 .8.4 1.5 1.2 1.5-.8 0-1.2.7-1.2 1.5v2.2a1.8 1.8 0 0 1-1.8 1.8H10"/>',
  terminal: '<rect x="1.8" y="2.5" width="12.4" height="11" rx="1.8"/><path d="m4.4 6 2 2-2 2M8.4 10h3"/>',
  search: '<circle cx="7" cy="7" r="4.4"/><path d="m10.4 10.4 3.3 3.3"/>',
  shield: '<path d="M8 1.7 13 3.6v3.8c0 3.1-2 5.6-5 7-3-1.4-5-3.9-5-7V3.6z"/><path d="m5.5 8 1.5 1.5 3.4-3.4"/>',
  gauge: '<path d="M2.5 12a6.2 6.2 0 1 1 11 0"/><path d="m8 8 3.2-2.2M5 12h6"/>',
  calculator: '<rect x="2.5" y="1.8" width="11" height="12.4" rx="1.5"/><path d="M5 4.5h6M5 7.5h1M8 7.5h1M11 7.5h1M5 10.5h1M8 10.5h1M11 10.5h1"/>',
  checklist: '<path d="M6.5 3h7M6.5 8h7M6.5 13h7M2.2 3l1 1 1.8-2M2.2 8l1 1L5 7M2.2 13l1 1 1.8-2"/>',
  settings: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9"/>',
  menu: '<path d="M3 5h10M3 8h7M3 11h10"/>',
  bell: '<path d="M3.5 11h9l-1-1.5V7a3.5 3.5 0 0 0-7 0v2.5zM6.7 13a1.5 1.5 0 0 0 2.6 0"/>',
  activity: '<path d="M1 8h3l1.5-4 3 8 2-5 1 1h3"/>',
  layers: '<path d="m8 2 6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.4 1.5"/>',
  users: '<circle cx="6" cy="5.5" r="2.3"/><path d="M1.8 13c.3-2.4 1.8-3.7 4.2-3.7s4 1.3 4.2 3.7M11 5.2a2 2 0 0 1 0 3.6M11.2 9.8c1.7.3 2.7 1.3 3 3"/>',
  rows: '<path d="M2 3h12v3H2zM2 8h12v3H2zM2 13h12"/>',
  alert: '<path d="M8 2 14 13H2z"/><path d="M8 6v3M8 11.5v.1"/>',
  arrow: '<path d="M2 8h11M9 4l4 4-4 4"/>',
  copy: '<rect x="5" y="4" width="8" height="9" rx="1.2"/><path d="M10 4V2.5H3v8h2"/>',
};

function icon(name, size = 16) {
  return `<svg class="nav-icon" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.activity}</svg>`;
}

function dot(color) { return `<span class="dot ${color}"></span>`; }
function badge(text, tone = "neutral") { return `<span class="badge ${tone}">${text}</span>`; }
function info() { return '<span class="info">i</span>'; }

function card(title, body, options = {}) {
  const subtitle = options.subtitle ? ` <span class="card-subtle">${options.subtitle}</span>` : "";
  const action = options.action ? `<div class="card-actions">${options.action}</div>` : "";
  const footer = options.footer ? `<div class="card-footer">${options.footer}</div>` : "";
  return `<section class="card ${options.className || ""}">
    <div class="card-header"><div class="card-heading"><span class="card-title">${title}${subtitle}</span>${options.noInfo ? "" : info()}</div>${action}</div>
    <div class="card-body ${options.bodyClass || ""}">${body}</div>${footer}</section>`;
}

function simpleTable(headers, rows, widths = []) {
  const cols = widths.length ? `<colgroup>${widths.map(w => `<col style="width:${w}">`).join("")}</colgroup>` : "";
  return `<table class="data-table">${cols}<thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function lineChart(series = ["#2563eb", "#7c3aed", "#ea580c"], height = 225) {
  const paths = [
    "M8 166 C55 161,75 139,118 143 S181 110,232 121 S305 83,356 98 S427 62,478 79 S554 41,620 52 S682 29,752 42",
    "M8 190 C60 181,84 186,128 170 S204 160,246 169 S314 137,365 147 S450 118,496 126 S565 95,619 105 S698 74,752 86",
    "M8 204 C61 203,97 193,142 197 S214 177,263 184 S337 164,385 169 S461 147,511 151 S587 128,638 133 S710 115,752 118",
  ];
  return `<div class="chart-wrap" style="height:${height}px"><svg class="chart-svg" viewBox="0 0 760 225" preserveAspectRatio="none">
    <line class="chart-grid" x1="8" y1="35" x2="752" y2="35"/><line class="chart-grid" x1="8" y1="87" x2="752" y2="87"/><line class="chart-grid" x1="8" y1="139" x2="752" y2="139"/><line class="chart-grid" x1="8" y1="191" x2="752" y2="191"/>
    <text class="axis-label" x="8" y="220">11:50</text><text class="axis-label" x="190" y="220">11:55</text><text class="axis-label" x="375" y="220">12:00</text><text class="axis-label" x="560" y="220">12:05</text><text class="axis-label" x="728" y="220">12:10</text>
    ${paths.slice(0, series.length).map((d,i)=>`<path class="chart-line" d="${d}" stroke="${series[i]}"/>`).join("")}
    <circle cx="752" cy="42" r="3" fill="${series[0]}"/><circle cx="752" cy="86" r="3" fill="${series[1] || series[0]}"/>
  </svg></div>`;
}

function spark(color = "#2563eb", variant = 0) {
  const paths = ["M1 26 C10 24,14 19,22 21 S38 10,48 16 S65 6,78 11 S95 4,112 8", "M1 20 C14 24,22 13,34 17 S53 9,66 13 S86 5,96 12 S105 7,112 6", "M1 24 L13 22 L24 25 L34 17 L48 19 L61 9 L73 15 L87 7 L99 12 L112 4"];
  return `<div class="spark"><svg viewBox="0 0 113 30" preserveAspectRatio="none"><path d="M1 27H112" stroke="#edf0f4"/><path d="${paths[variant % paths.length]}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/></svg></div>`;
}

function kpi(label, value, unit, tone, iconName, meta = "") {
  return `<section class="card kpi-card"><div class="kpi-top"><div class="icon-tile ${tone}">${icon(iconName,17)}</div><div class="kpi-label">${label}</div>${info()}</div><div class="kpi-value">${value}<span class="kpi-unit">${unit}</span></div>${meta ? `<div class="kpi-meta">${meta}</div>` : ""}</section>`;
}

function shell(page, content, footer = "Ingest 2,018 ev/s · reads 506 q/s · VoltDB 14.0.1") {
  const [title, subtitle] = TITLES[page];
  const nav = NAV.map(([id,label,ico]) => `<div class="nav-item ${id===page?"active":""}">${icon(ico)}<span>${label}</span></div>`).join("");
  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"></span><span class="brand-word">Volt</span></div>
      <nav class="nav">${nav}</nav>
      <div class="cluster-card"><div class="cluster-title">VoltDB Cluster ${dot("green")} <span style="color:var(--green);font-size:9px">Healthy</span></div><div class="cluster-host">http://localhost:8080 · updated 2s ago</div><div class="cluster-link">Open Volt Management Center ↗</div></div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="topbar-left">${icon("menu",18)}<div class="page-heading"><div class="page-title">${title}</div><div class="page-subtitle">${subtitle}</div></div></div>
        <div class="topbar-right">
          <div class="environment"><div class="environment-label">Environment</div><div class="environment-value">Local PoC <span>⌄</span></div></div>
          <div class="system-status">${dot("green")} All Systems Operational</div>
          <div class="search-box">${icon("search",14)} Search tables, procedures, subjects… <span class="keycap">⌘K</span></div>
          <div class="bell">${icon("bell",17)}</div>
          <div class="user"><div class="avatar">AM</div><div><div class="user-name">Alex Morgan</div><div class="user-role">Solutions Architect</div></div><span class="muted">⌄</span></div>
        </div>
      </header>
      <main class="content"><div class="content-scroll">${content}</div></main>
      <footer class="footer"><div>© 2026 Volt Active Data</div><div class="footer-center">Feature ingest and reads powered by VoltDB + VoltSP</div><div class="footer-right">${footer}<span class="live-pill">${dot("green")} Live</span></div></footer>
    </div>
  </div>`;
}

function overviewPage() {
  const toolbar = `<div class="toolbar"><div class="chip-list">
    <div class="chip selected">${dot("blue")} Customer hot</div><div class="chip">${dot("purple")} Customer warm</div><div class="chip">${dot("teal")} Lifetime</div><div class="chip">${dot("orange")} Merchant</div><div class="chip">${dot("red")} Hygiene</div><div class="chip">${dot("slate")} Kafka</div><div class="chip">${dot("green")} VoltSP</div>
  </div><div class="small-control">15m <span>⌄</span></div></div>`;
  const kpis = `<div class="kpi-grid">
    ${kpi("Ingest rate", "2,018", "ev/s", "blue", "activity", "+1.8%")}
    ${kpi("Feature reads", "506", "q/s", "green", "arrow", "+0.6%")}
    ${kpi("Cluster p99 latency", "2.4", "ms", "purple", "clock", "within target")}
    ${kpi("Customer subjects", "99,842", "", "orange", "users", "+482")}
    ${kpi("Hot-tier rows", "8.42", "M", "blue", "rows", "+1.2%")}
    ${kpi("Rejected + late", "1,403", "", "red", "alert", "0.69%")}
  </div>`;
  const storage = card("Tier Storage", `<div class="donut-row"><div class="donut"><div class="donut-center"><div class="donut-value">9.38 GB</div><div class="donut-label">table data memory</div></div></div><div class="storage-list">
    <div class="storage-line">${dot("blue")}<span class="name">TXN_RAW</span><span class="amount">8.42M · 7.84GB</span></div>
    <div class="storage-line">${dot("purple")}<span class="name">CUSTOMER_DAILY</span><span class="amount">2.31M · 0.92GB</span></div>
    <div class="storage-line">${dot("teal")}<span class="name">CUSTOMER_PROFILE</span><span class="amount">99.8K · 42MB</span></div>
    <div class="storage-line">${dot("orange")}<span class="name">Merchant tables</span><span class="amount">1.16M · 0.57GB</span></div>
    <div class="storage-line">${dot("red")}<span class="name">COUNTERS</span><span class="amount">4 · 0.01MB</span></div>
  </div></div><div class="notice info" style="margin-top:16px"><span>i</span><span>Memory sums tuple + string data across all hosts and partitions. Index memory is excluded.</span></div>`, { action: "View sizing ›" });
  const chart = card("Ingest & Reads Over Time", `<div class="legend"><span class="legend-item" style="color:var(--accent)"><span class="legend-line"></span>RecordTxn/s</span><span class="legend-item" style="color:var(--orange)"><span class="legend-line"></span>RecordMerchantTxn/s</span><span class="legend-item" style="color:var(--purple)"><span class="legend-line"></span>Feature reads/s</span></div>${lineChart(["#2563eb","#ea580c","#7c3aed"],245)}`, { action: '<span class="small-control">15m⌄</span><span class="small-control">Avg⌄</span>' });
  const pipeline = card("Pipeline", `<div class="pipeline"><div class="pipeline-flow"><div class="pipeline-node"><strong>Kafka</strong><span>novapay-txn-events</span></div><div class="flow-arrow"><span class="flow-rate">2,032/s</span>→</div><div class="pipeline-node"><strong>VoltSP</strong><span>parse · validate · lateness</span></div><div class="flow-arrow"><span class="flow-rate">2,018/s</span>→</div><div class="pipeline-node"><strong>VoltDB</strong><span>two subject tiers</span><div class="tier-mini"><div style="color:var(--accent);background:var(--accent-soft)">HOT</div><div style="color:var(--purple);background:var(--purple-soft)">WARM</div><div style="color:var(--orange);background:var(--orange-soft)">MERCHANT</div></div></div></div><div class="dlq-edge">${dot("red")} 14 rejected in the last 10 s → DLQ</div><div class="legend" style="justify-content:center;margin-top:16px"><span>${dot("green")} flowing</span><span>${dot("amber")} idle</span><span>${dot("red")} error</span></div></div>`, { subtitle: "(Live)", action: "View full architecture ↗" });
  const busiestRows = [
    ['<span class="cell-mono cell-strong">100000083214</span>', '<span class="cell-strong">1,284</span>', '<span class="cell-strong">₹4,832,914.20</span>', badge("WARM", "warm"), '<span class="link">Explore ›</span>'],
    ['<span class="cell-mono cell-strong">100000017842</span>', '1,119', '₹4,214,081.94', badge("WARM", "warm"), '<span class="link">Explore ›</span>'],
    ['<span class="cell-mono cell-strong">100000097116</span>', '1,073', '₹3,981,442.12', badge("WARM", "warm"), '<span class="link">Explore ›</span>'],
    ['<span class="cell-mono cell-strong">100000042590</span>', '998', '₹3,658,004.70', badge("WARM", "warm"), '<span class="link">Explore ›</span>'],
  ];
  const busiest = card("Busiest Customers", `<div class="notice warn" style="margin:0 0 7px"><span>!</span><span>Daily-bucket cutoff from query 1 · not an exact rolling 24 hours.</span></div>${simpleTable(["CUSTOMER_ID","TXNS","SPEND","SOURCE",""],busiestRows,["27%","14%","23%","18%","18%"])}`, { footer: '<span>View in SQL console ›</span><span>Export CSV ↓</span>' });
  const events = card("Recent Hygiene Events", `<div class="event-list">
    <div class="event"><span class="event-icon" style="color:var(--red);background:var(--red-soft)">!</span><div class="event-text"><strong>dropped_late +6</strong><br>Age exceeded configured 86,400 s bound</div><span class="event-time">12:10:03</span></div>
    <div class="event"><span class="event-icon" style="color:var(--amber);background:var(--amber-soft)">!</span><div class="event-text"><strong>dlq_unparseable_created_at +4</strong><br>Payloads forwarded to novapay-txn-dlq</div><span class="event-time">12:09:53</span></div>
    <div class="event"><span class="event-icon" style="color:var(--red);background:var(--red-soft)">!</span><div class="event-text"><strong>dlq_missing_subject_key +4</strong><br>Missing or invalid customer_id</div><span class="event-time">12:09:43</span></div>
  </div>`, { action: "View hygiene ›" });
  return toolbar + kpis + `<div class="grid overview-main">${storage}${chart}${pipeline}</div><div class="grid overview-bottom">${busiest}${events}</div>`;
}

function architecturePage() {
  const toolbar = `<div class="toolbar"><div class="chip-list"><div class="chip selected">${dot("green")} Live rates</div><div class="chip">${dot("slate")} Repository contract</div><div class="chip">${dot("blue")} Partition paths</div></div><div class="inline-row"><span class="muted" style="font-size:10px">Updated 2 s ago</span><div class="small-control">Open source map ↗</div></div></div>`;
  const stage = `<div class="architecture-stage" style="height:526px">
    <svg class="arch-svg" viewBox="0 0 1280 526" preserveAspectRatio="none"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8z" fill="#9fb0c7"/></marker></defs>
      <path class="arch-edge" d="M150 236H198"/><path class="arch-edge" d="M350 236H397"/>
      <path class="arch-edge red" d="M572 207 C640 185,630 89,695 89"/><path class="arch-edge red" d="M820 89H862"/>
      <path class="arch-edge green" d="M572 239H685"/><path class="arch-edge green" d="M572 270 C635 300,640 365,685 365"/>
      <path class="arch-edge" d="M805 239H852"/><path class="arch-edge" d="M970 239H1005"/><path class="arch-edge" d="M1117 239H1150"/>
      <path class="arch-edge" d="M815 365H856"/><path class="arch-edge" d="M978 365H1022"/>
      <path class="arch-edge" d="M1147 337 C1190 325,1198 279,1216 262"/><path class="arch-edge" d="M1147 393 C1190 408,1200 434,1216 449"/>
    </svg>
    <div class="arch-node" style="left:18px;top:202px"><div class="arch-node-title">TxnLoadGenerator</div><div class="arch-node-meta">2,032 events/s · 48 fields</div></div>
    <div class="arch-node" style="left:182px;top:194px;width:170px"><div class="arch-node-title">Kafka · novapay-txn-events</div><div class="arch-node-meta">50 partitions · starting at LATEST</div></div>
    <div class="arch-node selected" style="left:384px;top:178px;width:198px"><div class="arch-node-title">VoltSP · feature ingest v4</div><div class="arch-node-meta">parse → validate → lateness check</div><div style="margin-top:7px">${badge("FLOWING", "good")}</div></div>
    <div class="arch-node" style="left:686px;top:52px;width:148px"><div class="arch-node-title">novapay-txn-dlq</div><div class="arch-node-meta">4 partitions · raw payload</div></div>
    <div class="arch-node" style="left:865px;top:52px;width:128px"><div class="arch-node-title">BumpCounter</div><div class="arch-node-meta">COUNTERS.NAME</div></div>
    <div class="arch-node" style="left:686px;top:203px;width:128px"><div class="arch-node-title">RecordTxn</div><div class="arch-node-meta">2,018/s · customer key</div></div>
    <div class="arch-node" style="left:852px;top:203px;width:120px"><div class="arch-node-title">TXN_RAW</div><div class="arch-node-meta">HOT · 7 d · 8.42 M</div></div>
    <div class="arch-node" style="left:1005px;top:203px;width:127px"><div class="arch-node-title">CUSTOMER_DAILY</div><div class="arch-node-meta">WARM · 90 d · 2.31 M</div></div>
    <div class="arch-node" style="left:1150px;top:203px;width:119px"><div class="arch-node-title">CUSTOMER_PROFILE</div><div class="arch-node-meta">LIFE · ∞ · 99,842</div></div>
    <div class="arch-node" style="left:686px;top:330px;width:140px"><div class="arch-node-title">RecordMerchantTxn</div><div class="arch-node-meta">with merchant_id · 2,018/s</div></div>
    <div class="arch-node" style="left:856px;top:330px;width:126px"><div class="arch-node-title">MERCHANT_TXN_SEEN</div><div class="arch-node-meta">MERCHANT · 48 h</div></div>
    <div class="arch-node" style="left:1022px;top:330px;width:126px"><div class="arch-node-title">MERCHANT_MINUTE</div><div class="arch-node-meta">MERCHANT · 7 d</div></div>
    <div class="arch-node" style="left:1162px;top:310px;width:108px"><div class="arch-node-title">Merchant reads</div><div class="arch-node-meta">GetMerchantFeatures</div></div>
    <div class="arch-node" style="left:1162px;top:423px;width:108px"><div class="arch-node-title">Customer reads</div><div class="arch-node-meta">Rolling · Profile · Daily</div></div>
    <span class="arch-rate" style="left:209px;top:170px">2,032/s</span><span class="arch-rate" style="left:612px;top:210px">2,018/s</span><span class="arch-rate" style="left:633px;top:112px;color:var(--red)">14.1/s rejected</span>
    <div class="notice info" style="position:absolute;left:385px;bottom:19px;width:438px"><span>i</span><span><strong>Independent atomic calls.</strong> Valid events call RecordTxn; events with merchant_id also call RecordMerchantTxn.</span></div>
  </div>`;
  const diagram = card("Kafka → VoltSP → VoltDB", stage, { action: '<span class="small-control">Fit view</span><span class="small-control">100%</span>', bodyClass: "" });
  const drawer = card("novapay-txn-feature-ingest-v4", `<div class="tabs" style="margin:0 -16px 4px"><div class="tab active">Runtime</div><div class="tab">Contract</div><div class="tab">Source</div><div class="tab">Trace</div></div>
    <div class="drawer-section" style="margin:0 -16px"><div class="drawer-label">Runtime</div><div class="kv"><span>Status</span><span>${badge("FLOWING", "good")}</span></div><div class="kv"><span>Accepted</span><span>2,018 events/s</span></div><div class="kv"><span>Rejected</span><span>14.1 events/s</span></div><div class="kv"><span>Last sample</span><span>12:04:18 CEST</span></div></div>
    <div class="drawer-section" style="margin:0 -16px"><div class="drawer-label">Pipeline contract</div><div class="kv"><span>groupId</span><span class="mono">novapay-feature-agg</span></div><div class="kv"><span>startingOffset</span><span class="mono">LATEST</span></div><div class="kv"><span>latenessSeconds</span><span class="mono">86400</span></div><div class="kv"><span>sourceTopic</span><span class="mono">novapay-txn-events</span></div><div class="kv"><span>dlqTopic</span><span class="mono">novapay-txn-dlq</span></div></div>
    <div class="drawer-section" style="margin:0 -16px"><div class="drawer-label">Source</div><div class="code-shell" style="border:1px solid var(--border);border-radius:8px"><div class="code-toolbar">TxnFeaturePipeline.java <span>Open ↗</span></div><div class="code-body"><span class="ln">87</span><span class="kw">if</span> (ageSeconds &gt; latenessSeconds) {<br><span class="ln">88</span>  deadLetter(raw, <span class="str">"dropped_late"</span>);<br><span class="ln">89</span>  <span class="kw">return</span>;<br><span class="ln">90</span>}</div></div></div>`, { action: badge("SELECTED", "hot"), bodyClass: "" });
  const tiers = card("Tier design", simpleTable(["TIER","STORAGE","RETENTION","SERVES"],[
    [`${badge("HOT", "hot")} Customer hot`,'<span class="mono">TXN_RAW</span>','7 d','Exact aggregates from raw events; minute-aligned procedure cutoff'],
    [`${badge("WARM", "warm")} Customer warm`,'<span class="mono">CUSTOMER_DAILY</span>','90 d','Long windows; live leading edge, day-granular trailing edge'],
    [`${badge("LIFE", "life")} Lifetime`,'<span class="mono">CUSTOMER_PROFILE</span>','∞','Last accepted write, lifetime totals, materialized AVG_TICKET'],
    [`${badge("MERCHANT", "merchant")} Merchant`,'<span class="mono">MERCHANT_MINUTE + MERCHANT_TXN_SEEN</span>','7 d / 48 h','Minute-exact merchant windows'],
  ],["20%","33%","12%","35%"]));
  const precision = card("Precision & why tiers", `<div class="notice warn"><span>!</span><span><strong>Exact aggregates from raw events · minute-aligned cutoff.</strong><br>README says “exact to the second”; GetRollingFeatures floors the cutoff to the minute.</span></div><div class="grid two-col" style="gap:10px;margin-top:12px"><div style="border:1px solid var(--border);border-radius:8px;padding:11px"><div class="muted" style="font-size:9px">CUSTOMERS</div><div style="font-size:20px;font-weight:760;margin:4px 0">0.94</div><div class="muted" style="font-size:9px">bucket / event</div></div><div style="border:1px solid var(--border);border-radius:8px;padding:11px"><div class="muted" style="font-size:9px">MERCHANTS</div><div style="font-size:20px;font-weight:760;margin:4px 0">~50:1</div><div class="muted" style="font-size:9px">bucket compression</div></div></div><div class="muted" style="font-size:9px;margin-top:10px">Partition counts traced to scripts/01_create_topic.sh · names and lateness traced to pipeline-config.yaml</div>`, { action: "Open source ↗" });
  return toolbar + `<div class="architecture-layout">${diagram}${drawer}</div><div class="grid" style="grid-template-columns:minmax(0,1.7fr) 420px;height:238px">${tiers}${precision}</div>`;
}

function schemaPage() {
  const tableRows = [
    ["TXN_RAW","HOT · 7 d","8.42 M","1,000 B"],
    ["CUSTOMER_DAILY","WARM · 90 d","2.31 M","417 B"],
    ["CUSTOMER_PROFILE","LIFE · ∞","99,842","421 B"],
    ["MERCHANT_TXN_SEEN","MERCHANT · 48 h","4.18 M","174 B"],
    ["MERCHANT_MINUTE","MERCHANT · 7 d","2.53 M","296 B"],
    ["COUNTERS","HYGIENE · —","3","128 B"],
  ];
  const list = card("Tables", `<div class="panel-search">${icon("search",13)} Find a table…</div>${tableRows.map((r,i)=>`<div class="list-row ${i===1?"active":""}"><div><div class="list-row-title mono">${r[0]}</div><div class="list-row-meta">${r[1]}</div></div><div class="list-row-stat"><strong>${r[2]}</strong><br>${r[3]}/row</div></div>`).join("")}`, { action: badge("6", "neutral"), bodyClass: "", footer: '<span>Catalog updated 2s ago</span><span>Trace ›</span>' });
  const cols = [
    ['<span class="cell-mono cell-strong">CUSTOMER_ID</span>','BIGINT','NO','—','Partition key'],
    ['<span class="cell-mono cell-strong">DAY_START</span>','TIMESTAMP','NO','—','Primary key · TTL column'],
    ['<span class="cell-mono">ATTEMPT_COUNT</span>','BIGINT','NO','0','All events incl. retries'],
    ['<span class="cell-mono">TXN_COUNT</span>','BIGINT','NO','0','TXN events, deduplicated'],
    ['<span class="cell-mono">TXN_AMOUNT_SUM</span>','DECIMAL','NO','0','Deduplicated TXN amount'],
    ['<span class="cell-mono">AMOUNT_MIN</span>','DECIMAL','YES','NULL','Minimum TXN amount'],
    ['<span class="cell-mono">AMOUNT_MAX</span>','DECIMAL','YES','NULL','Maximum TXN amount'],
    ['<span class="cell-mono">▸ F01…F38</span>','38 × BIGINT','NO','0','Width fillers · not business features'],
  ];
  const selected = card("CUSTOMER_DAILY", `<div style="display:flex;align-items:center;gap:8px;margin-bottom:11px">${badge("WARM", "warm")}${badge("Verified fields match · 2 unverified", "warn")}</div>${simpleTable(["COLUMN","TYPE","NULL","DEFAULT","REPOSITORY COMMENT"],cols,["23%","14%","9%","11%","43%"])}`, { subtitle: "51 physical columns", action: '<span class="small-control">Refresh catalog</span>', footer: '<span>Primary key (CUSTOMER_ID, DAY_START) · index IDX_CUSTOMER_DAILY_TTL</span><span>Open procedures ↗</span>' });
  const summary = `<aside class="summary-panel"><div class="drawer-label">Storage contract</div><div class="kv"><span>Partition</span><span class="mono">CUSTOMER_ID</span></div><div class="kv"><span>TTL</span><span>90 DAYS</span></div><div class="kv"><span>TTL column</span><span class="mono">DAY_START</span></div><div class="kv"><span>BATCH_SIZE</span><span class="mono">5000</span></div><div class="kv"><span>Live rows</span><span>2,310,442</span></div><div class="kv"><span>Measured</span><span>417 B/row</span></div><div class="drawer-label" style="margin-top:15px">Verification scope</div><div class="notice warn"><span>!</span><span>TTL definition and deployed Java class identity are not exposed by the selected catalog calls.</span></div></aside>`;
  const top = `<div class="card schema-top"><div>${selected.replace(/^<section class="card [^"]*">|<\/section>$/g,"")}</div>${summary}</div>`;
  const ddlCode = `<div class="code-shell" style="height:100%"><div class="code-toolbar"><span>src/main/resources/ddl.sql</span><span>Copy · Open full source ↗</span></div><div class="code-body"><span class="ln">48</span><span class="kw">CREATE TABLE</span> <span class="fn">CUSTOMER_DAILY</span> (<br><span class="ln">49</span>    CUSTOMER_ID         BIGINT    <span class="kw">NOT NULL</span>,<br><span class="ln">50</span>    DAY_START           TIMESTAMP <span class="kw">NOT NULL</span>,<br><span class="ln">51</span>    ATTEMPT_COUNT       BIGINT    <span class="kw">DEFAULT</span> 0 <span class="kw">NOT NULL</span>,<br><span class="ln">52</span>    TXN_COUNT           BIGINT    <span class="kw">DEFAULT</span> 0 <span class="kw">NOT NULL</span>,<br><span class="ln">53</span>    TXN_AMOUNT_SUM      DECIMAL   <span class="kw">DEFAULT</span> 0 <span class="kw">NOT NULL</span>,<br><span class="ln">82</span>    <span class="kw">PRIMARY KEY</span> (CUSTOMER_ID, DAY_START)<br><span class="ln">83</span>) <span class="kw">USING TTL</span> 90 DAYS <span class="kw">ON COLUMN</span> DAY_START BATCH_SIZE 5000;<br><span class="ln">84</span><span class="kw">PARTITION TABLE</span> CUSTOMER_DAILY <span class="kw">ON COLUMN</span> CUSTOMER_ID;<br><span class="ln">85</span><span class="kw">CREATE INDEX</span> IDX_CUSTOMER_DAILY_TTL <span class="kw">ON</span> CUSTOMER_DAILY (DAY_START);</div></div>`;
  const source = `<section class="card"><div class="tabs"><div class="tab active">ddl.sql</div><div class="tab">remove_db.sql ${badge("DESTRUCTIVE", "hygiene")}</div><div class="tab">Deployed diff</div><span class="spacer"></span><div class="tab" style="color:var(--accent)">Copy</div></div><div style="height:calc(100% - 38px)">${ddlCode}</div></section>`;
  return `<div class="schema-page">${list}<div class="schema-detail">${top}${source}</div></div>`;
}

function proceduresPage() {
  const procedures = [
    ["GetRollingFeatures","Java · read","506/s","182 µs"],
    ["GetMerchantFeatures","Java · read","51/s","104 µs"],
    ["GetProfile","SQL · read","24/s","38 µs"],
    ["GetRecentTxns","SQL · read","8/s","67 µs"],
    ["GetDailyBuckets","SQL · read","4/s","83 µs"],
    ["GetCounters","SQL · read","0.3/s","29 µs"],
    ["RecordTxn","Java · mutating","2,018/s","146 µs"],
    ["RecordMerchantTxn","Java · mutating","2,018/s","91 µs"],
    ["BumpCounter","Java · mutating","14.1/s","42 µs"],
  ];
  const list = card("Procedures", `<div class="panel-search">${icon("search",13)} Search procedures…</div>${procedures.map((p,i)=>`<div class="list-row ${i===0?"active":""}" style="min-height:61px"><div><div class="list-row-title mono">${p[0]}</div><div class="list-row-meta">${p[1]} ${i>5?badge("LOCKED","hygiene"):""}</div></div><div class="list-row-stat"><strong>${p[2]}</strong><br>${p[3]}</div></div>`).join("")}`, { action: badge("9", "neutral"), bodyClass: "", footer: '<span>Read-only guard</span><span style="color:var(--green)">● Locked ✓</span>' });
  const form = card("GetRollingFeatures", `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">${badge("JAVA", "neutral")}${badge("READ", "good")}<span class="muted">Partition <span class="mono">TXN_RAW.CUSTOMER_ID</span> · parameter 0</span><span class="spacer"></span><span class="muted" style="font-size:9px">Signature verified against deployed catalog</span></div><div class="form-row"><div class="field"><label>customerId · BIGINT</label><div class="input mono">100000012345</div></div><div class="field"><label>windowMinutes · INTEGER</label><div class="input mono">1440</div></div><div class="field"><label>Computed tier</label><div class="input">${badge("HOT · TXN_RAW", "hot")}<span class="muted">≤ 10080 min</span></div></div></div><div class="notice info" style="margin-top:11px"><span>i</span><span>Exact aggregates from raw events · minute-aligned cutoff. Windows above 10080 minutes use CUSTOMER_DAILY.</span></div>`, { action: '<span class="ghost-button">Show request</span><span class="ghost-button">Explain</span><span class="primary-button">Execute ⌘↵</span>' });
  const aggregateRows = [
    ['<span class="cell-mono">RAW_EVENTS</span>','BIGINT','1,284'],
    ['<span class="cell-mono">TXN_COUNT</span>','BIGINT','1,090'],
    ['<span class="cell-mono">TXN_AMOUNT_SUM</span>','DECIMAL','4,832,914.20'],
    ['<span class="cell-mono">AMOUNT_MIN</span>','DECIMAL','12.00'],
    ['<span class="cell-mono">AMOUNT_MAX</span>','DECIMAL','49,900.00'],
    ['<span class="cell-mono">SUCCESS_COUNT</span>','BIGINT','1,031'],
    ['<span class="cell-mono">CARD_COUNT</span>','BIGINT','763'],
    ['<span class="cell-mono">MANDATE_COUNT</span>','BIGINT','154'],
  ];
  const sourceCode = `<div class="code-shell" style="height:100%;border-left:1px solid var(--border)"><div class="code-toolbar"><span>GetRollingFeatures.java</span><span>Open full source ↗</span></div><div class="code-body"><span class="ln">69</span><span class="kw">public</span> VoltTable[] <span class="fn">run</span>(<span class="kw">long</span> customerId, <span class="kw">int</span> windowMinutes) {<br><span class="ln">70</span>  <span class="kw">long</span> nowMs = getTransactionTime().getTime();<br><span class="ln">71</span>  <span class="kw">long</span> floorMs = nowMs - (nowMs % 60_000L);<br><span class="ln">72</span>  TimestampType cutoff = <span class="kw">new</span> TimestampType(...);<br><span class="ln">74</span>  <span class="kw">if</span> (windowMinutes &lt;= HOT_TIER_MINUTES) {<br><span class="ln">75</span>    voltQueueSQL(hotAgg, customerId, cutoff);<br><span class="ln">76</span>    voltQueueSQL(hotDistinctAmount, customerId, cutoff);<br><span class="ln">77</span>    voltQueueSQL(hotDistinctMerchant, customerId, cutoff);<br><span class="ln">78</span>  } <span class="kw">else</span> {<br><span class="ln">82</span>    voltQueueSQL(warmAgg, customerId, dayCutoff);<br><span class="ln">85</span>  voltQueueSQL(profile, customerId);<br><span class="ln">86</span>  <span class="kw">return</span> voltExecuteSQL(<span class="kw">true</span>);<br><span class="ln">87</span>}</div></div>`;
  const results = `<section class="card" style="height:100%"><div class="tabs"><div class="tab active">Aggregate</div><div class="tab">Distinct amount <span class="badge hot" style="margin-left:5px">612</span></div><div class="tab">Distinct merchants <span class="badge hot" style="margin-left:5px">428</span></div><div class="tab">Profile</div><div class="tab">Plan</div><div class="tab">Source</div><span class="spacer"></span><div class="tab" style="color:var(--accent)">Export ↓</div></div><div style="display:grid;grid-template-columns:minmax(0,1fr) 520px;height:calc(100% - 77px)"><div style="padding:10px 14px">${simpleTable(["FIELD","VOLT TYPE","VALUE"],aggregateRows,["44%","24%","32%"])}</div>${sourceCode}</div><div class="card-footer"><span>4 result sets · 4 rows · BFF round trip 4.8 ms · upstream 4.1 ms</span><span>Procedure avg 182 µs · 15m statistic · Show trace ›</span></div></section>`;
  return `<div class="split-page wide-left">${list}<div class="detail-grid" style="grid-template-rows:236px minmax(0,1fr)">${form}${results}</div></div>`;
}

function sqlPage() {
  const snippets = ["Busy customers","Hot-tier read","Rolling-window shrink proof","Warm-tier read","Customer profile","Merchant read","Counters","Dedupe proof","Daily buckets","Sizing inputs"];
  const systems = ["@Statistics TABLE","@Statistics TTL","@Statistics PROCEDURE","@Statistics LATENCY","@Statistics MEMORY","@SystemInformation OVERVIEW"];
  const side = card("Snippet library", `<div class="panel-search">${icon("search",13)} Filter snippets…</div><div class="snippet-group">Demo queries</div>${snippets.map((s,i)=>`<div class="snippet ${i===1?"active":""}"><span class="snippet-num">${String(i+1).padStart(2,"0")}</span><span>${s}</span></div>`).join("")}<div class="snippet-group">System</div>${systems.map(s=>`<div class="snippet"><span class="snippet-num">@</span><span class="mono">${s}</span></div>`).join("")}`, { action: badge("16", "neutral"), bodyClass: "", footer: '<span>queries.sql</span><span>Reload ↻</span>' });
  const editor = `<section class="card"><div class="code-toolbar" style="height:42px;background:white"><div class="inline-row"><span class="primary-button">▶ Run ⌘↵</span><span class="ghost-button">Explain</span><span class="badge good">READ-ONLY LOCKED</span></div><div class="inline-row"><span class="link">History</span><span class="link">Show request</span><span class="muted">SQL · VoltDB</span></div></div><div class="editor"><div class="editor-lines">1<br>2</div><div class="editor-code"><span class="kw">exec</span> <span class="fn">GetRollingFeatures</span> <span style="color:#b45309">100000012345</span> <span style="color:#b45309">1440</span>;<br><span class="comment">-- HOT branch · exact aggregates from TXN_RAW · minute-aligned cutoff</span></div></div></section>`;
  const resultRows = [
    ['<span class="cell-mono">1,284</span>','<span class="cell-mono">1,090</span>','<span class="cell-mono">4,832,914.20</span>','<span class="cell-mono">12.00</span>','<span class="cell-mono">49,900.00</span>','<span class="cell-mono">1,031</span>'],
  ];
  const results = `<section class="card"><div class="tabs"><div class="tab active">Aggregate</div><div class="tab">Distinct amount</div><div class="tab">Distinct merchants</div><div class="tab">Profile</div><span class="spacer"></span><div class="tab muted">4 sets · 4 rows · BFF 4.8 ms</div></div><div style="padding:10px 14px 0">${simpleTable(["RAW_EVENTS<div class='muted'>BIGINT</div>","TXN_COUNT<div class='muted'>BIGINT</div>","TXN_AMOUNT_SUM<div class='muted'>DECIMAL</div>","AMOUNT_MIN<div class='muted'>DECIMAL</div>","AMOUNT_MAX<div class='muted'>DECIMAL</div>","SUCCESS_COUNT<div class='muted'>BIGINT</div>"],resultRows,["15%","15%","22%","16%","16%","16%"])}</div><div class="notice info" style="margin:14px"><span>i</span><span>DECIMAL values remain strings end-to-end. BFF 4.8 ms is round-trip time, not per-call server elapsed.</span></div><div class="tabs" style="margin-top:8px"><div class="tab active">Plan</div><div class="tab">History</div><div class="tab">Request & response</div></div><div class="code-shell" style="height:250px"><div class="code-toolbar"><span>Execution summary</span><span>Copy</span></div><div class="code-body"><span class="comment">-- Result shape: HOT branch · 4 VoltTables</span><br>1  Aggregate           1 row<br>2  Distinct amount     1 row<br>3  Distinct merchants  1 row<br>4  Profile             1 row<br><br><span class="comment">-- Explain is available through @ExplainProc</span><br><span class="fn">GetRollingFeatures</span><br>  partition key: <span class="str">TXN_RAW.CUSTOMER_ID</span><br>  route parameter: <span style="color:#b45309">0</span></div></div><div class="card-footer"><span>Result schema preserved · TIMESTAMP ISO + raw µs · DECIMAL string</span><span>Export CSV · Copy Markdown</span></div></section>`;
  return `<div class="sql-page">${side}<div class="sql-main">${editor}${results}</div></div>`;
}

function explorerPage() {
  const toolbar = `<div class="toolbar"><div class="inline-row"><div class="chip selected">Customer</div><div class="chip">Merchant</div><div class="input mono" style="width:225px">100000012345</div><div class="ghost-button">Pick a busy customer</div><div class="primary-button">Load</div></div><div class="inline-row"><span class="muted" style="font-size:10px">Selected from query 1 · updated 12:04:18</span><div class="ghost-button">Show all traces</div></div></div>`;
  const profile = card("Customer Profile", `<div class="profile-strip" style="margin:-5px -16px -15px"><div class="profile-cell"><div class="profile-label">CUSTOMER_ID</div><div class="profile-value mono">100000012345</div><div style="margin-top:8px">${badge("LIFETIME", "life")}</div></div><div class="profile-cell"><div class="profile-label">FIRST_SEEN</div><div class="profile-value small">14 Jul 2026</div></div><div class="profile-cell"><div class="profile-label">LAST_TXN_AT</div><div class="profile-value small">12:03:41</div><div class="muted" style="font-size:8px;margin-top:4px">last accepted write ⓘ</div></div><div class="profile-cell"><div class="profile-label">LAST_CITY</div><div class="profile-value">Mumbai</div></div><div class="profile-cell"><div class="profile-label">LIFETIME TXNS</div><div class="profile-value">48,620</div></div><div class="profile-cell"><div class="profile-label">LIFETIME AMOUNT</div><div class="profile-value small">₹218,445,670.21</div></div><div class="profile-cell"><div class="profile-label">24H COUNT / SUM</div><div class="profile-value small">1,090 · ₹4.83M</div></div><div class="profile-cell" style="background:var(--teal-soft)"><div class="profile-label">AVG_TICKET</div><div class="profile-value">₹4,433.87</div><div class="muted" style="font-size:8px;margin-top:4px">materialized in ingest txn</div></div></div>`, { action: "GetProfile · Show request" });
  const windows = [
    ["5 min","HOT","hot",[["RAW_EVENTS","5"],["TXN_COUNT","4"],["TXN_AMOUNT_SUM","₹18,490.00"],["DISTINCT MERCHANTS","4"]]],
    ["1 hour","HOT","hot",[["RAW_EVENTS","61"],["TXN_COUNT","53"],["TXN_AMOUNT_SUM","₹238,904.11"],["SUCCESS_COUNT","50"]]],
    ["24 hours","HOT","hot",[["RAW_EVENTS","1,284"],["TXN_COUNT","1,090"],["TXN_AMOUNT_SUM","₹4,832,914.20"],["AMOUNT_DISTINCT","612"]]],
    ["30 days","WARM","warm",[["DAYS","30"],["TXN_COUNT","32,741"],["ATTEMPT_COUNT","33,418"],["TXN_AMOUNT_SUM","₹144,232,221.65"]]],
    ["Custom · 10081 min","WARM","warm",[["DAYS","8"],["TXN_COUNT","8,736"],["ATTEMPT_COUNT","8,901"],["TXN_AMOUNT_SUM","₹38,691,222.18"]]],
  ];
  const windowCards = `<div class="window-grid">${windows.map((w,i)=>`<section class="card window-card"><div class="window-title"><span>${w[0]}</span>${badge(w[1],w[2])}</div>${w[3].map(m=>`<div class="metric-line"><span class="mono">${m[0]}</span><strong>${m[1]}</strong></div>`).join("")}<div style="font-size:8px;color:${w[1]==="HOT"?"var(--accent)":"var(--purple)"};margin-top:7px">${w[1]==="HOT"?"TXN_RAW · minute-aligned cutoff":"CUSTOMER_DAILY · day trailing edge"}</div></section>`).join("")}</div>`;
  const snapshot = card("Rolling-window shrink proof", `<div style="display:grid;grid-template-columns:1fr 42px 1fr;gap:10px;align-items:center"><div style="border:1px solid var(--border);border-radius:8px;padding:11px"><div class="muted" style="font-size:9px">BASELINE · 12:00:16</div><div style="font-size:24px;font-weight:760;margin:6px 0">7 <span class="kpi-unit">RAW_EVENTS</span></div><div class="muted" style="font-size:9px">TXN_COUNT 6 · ₹27,910.00</div></div><div style="text-align:center;color:var(--accent);font-size:20px">→</div><div style="border:1px solid #bfdbfe;background:#f7faff;border-radius:8px;padding:11px"><div class="muted" style="font-size:9px">FOLLOW-UP · 12:04:18</div><div style="font-size:24px;font-weight:760;margin:6px 0;color:var(--accent)">5 <span class="kpi-unit">RAW_EVENTS</span></div><div class="muted" style="font-size:9px">TXN_COUNT 4 · ₹18,490.00</div></div></div><div class="notice good" style="margin-top:10px"><span>✓</span><span>Elapsed 4m 02s · accepted-ingest delta 0 · totals shrank without a batch job.</span></div>`, { action: '<span class="ghost-button">Capture again</span>' });
  const bars = `<svg viewBox="0 0 660 150" style="width:100%;height:145px"><line x1="26" y1="126" x2="650" y2="126" stroke="#e4e9f1"/>${[64,88,52,103,72,115,91,121,80,96,67,110,84,119,100].map((h,i)=>`<rect x="${34+i*40}" y="${126-h}" width="19" height="${h}" rx="3" fill="${i===14?"#7c3aed":"#d8c8fa"}"/>`).join("")}<text x="30" y="145" class="axis-label">Aug 19</text><text x="272" y="145" class="axis-label">Aug 25</text><text x="558" y="145" class="axis-label">Sep 02</text></svg>`;
  const daily = card("Daily buckets", `${bars}`, { action: '<span class="small-control">TXN_COUNT⌄</span><span class="link">GetDailyBuckets</span>' });
  const recentRows = [
    ['12:03:41','<span class="cell-mono">2f3c…91a7</span>','TXN','CARD_PAY','₹6,840.00','SUCCESS','M-00042','Mumbai',`2 ${badge("retry deduplicated","warn")}`],
    ['12:02:58','<span class="cell-mono">84d1…c820</span>','TXN','UPI','₹2,140.00','SUCCESS','M-00112','Pune','1'],
    ['12:02:11','<span class="cell-mono">e21b…aa17</span>','MANDATE','AUTO_DEBIT','₹4,800.00','SUCCESS','M-00042','Mumbai','1'],
    ['12:00:49','<span class="cell-mono">56c2…8891</span>','TXN','CARD_PAY','₹4,710.00','FAILED','M-00308','Delhi','1'],
  ];
  const recent = card("Recent Transactions", simpleTable(["CREATED_AT","TXN_ID","EVENT_TYPE","TXN_TYPE","AMOUNT","RESULT","MERCHANT_ID","CITY","ATTEMPT_COUNT"],recentRows,["10%","13%","10%","12%","12%","10%","12%","9%","12%"]), { action: "GetRecentTxns · Show request", footer: '<span>Rows with ATTEMPT_COUNT > 1 are supporting dedupe evidence.</span><span>Open procedure source ↗</span>' });
  return toolbar + profile + windowCards + `<div class="explorer-bottom">${snapshot}${daily}</div><div style="height:255px">${recent}</div>`;
}

function hygienePage() {
  const toolbar = `<div class="toolbar"><div class="chip-list"><div class="chip selected">All counters</div><div class="chip">${dot("red")} Rejected</div><div class="chip">${dot("orange")} Retries</div><div class="chip">${dot("purple")} TTL</div></div><div class="inline-row"><div class="small-control">15m⌄</div><div class="chip selected">${dot("green")} Auto refresh</div><div class="chip">${dot("slate")} Kafka tail disabled</div></div></div>`;
  const counters = [
    ["dlq_unparseable_json","0","not injected", "#64748b",0],
    ["dlq_unparseable_created_at","394","0.196%", "#dc2626",1],
    ["dlq_missing_subject_key","391","0.194%", "#ea580c",2],
    ["dropped_late","588","0.293%", "#7c3aed",0],
  ];
  const cards = `<div class="counter-grid">${counters.map((c,i)=>`<section class="card counter-card"><div class="counter-name">${c[0]} ${info()}</div><div class="counter-main"><span class="counter-value">${c[1]}</span><span class="counter-ratio" style="color:${i===0?"var(--slate)":"var(--green)"}">${c[2]}</span></div>${spark(c[3],c[4])}</section>`).join("")}</div>`;
  const expectedRows = [
    ['Malformed JSON',badge("NOT INJECTED","neutral"),'0','—','Standard loadgen always serializes valid JSON'],
    ['Invalid created_at','~0.196%','0.196%',badge("ALIGNED","good"),'Injected only on non-retries'],
    ['Missing subject key','~0.196%','0.194%',badge("ALIGNED","good"),'customer_id absent from payload'],
    ['Beyond lateness','~0.294%','0.293%',badge("ALIGNED","good"),'Three days old vs 1-day bound'],
  ];
  const expected = card("Expected vs observed", `<div class="notice info" style="margin-bottom:8px"><span>ƒ</span><span>Ratio = rejected delta ÷ (accepted RecordTxn delta + rejection deltas)</span></div>${simpleTable(["CASE","EXPECTED","OBSERVED","STATE","NOTES"],expectedRows,["20%","15%","15%","15%","35%"])}`, { action: "Loadgen source ↗" });
  const dlq = card("Recent rejected input", `<div style="display:grid;place-items:center;height:165px;text-align:center"><div><div style="width:36px;height:36px;border-radius:50%;background:var(--slate-soft);color:var(--slate);display:grid;place-items:center;margin:0 auto 10px">${icon("database",17)}</div><strong>Kafka tail not enabled</strong><div class="muted" style="font-size:10px;margin-top:5px;max-width:260px">Enable the isolated console tail in Settings. The pipeline emits raw payloads without a reason envelope.</div><div class="ghost-button" style="margin-top:12px">Open Settings</div></div></div><div class="notice warn"><span>!</span><span>Any displayed rejection reason is inferred. COUNTERS is authoritative for classification.</span></div>`, { subtitle: "(Optional)", action: badge("PARTIAL", "warn") });
  const dedupeRows = [
    ['<span class="cell-mono">100000012345</span>','<span class="cell-mono">2f3c…91a7</span>','₹6,840.00',`3 ${badge("retry deduplicated","warn")}`,'SUCCESS'],
    ['<span class="cell-mono">100000018927</span>','<span class="cell-mono">8aa2…001c</span>','₹2,240.50',`2 ${badge("retry deduplicated","warn")}`,'SUCCESS'],
    ['<span class="cell-mono">100000007451</span>','<span class="cell-mono">c76a…72b1</span>','₹18,449.00',`2 ${badge("retry deduplicated","warn")}`,'FAILED'],
  ];
  const dedupe = card("Retry / dedupe evidence", simpleTable(["CUSTOMER_ID","TXN_ID","AMOUNT","ATTEMPT_COUNT","PAYMENT_RESULT"],dedupeRows,["23%","22%","18%","23%","14%"]), { action: "Query 8 · Open SQL ↗", footer: '<span>One raw row per (CUSTOMER_ID, TXN_ID); procedure source proves aggregate behavior.</span><span>Show trace ›</span>' });
  const ttlRows = [
    ['<span class="cell-mono">TXN_RAW</span>',badge("HOT","hot"),'84,210','5,000','8,420,118','12:03:58'],
    ['<span class="cell-mono">CUSTOMER_DAILY</span>',badge("WARM","warm"),'12,304','2,118','2,310,442','12:03:54'],
    ['<span class="cell-mono">MERCHANT_TXN_SEEN</span>',badge("MERCHANT","merchant"),'201,806','5,000','4,180,011','12:03:59'],
    ['<span class="cell-mono">MERCHANT_MINUTE</span>',badge("MERCHANT","merchant"),'31,442','3,802','2,532,080','12:03:55'],
  ];
  const ttl = card("Physical TTL activity", simpleTable(["TABLE","TIER","ROWS DELETED","LAST ROUND","REMAINING","LAST DELETE"],ttlRows,["26%","12%","17%","15%","17%","13%"]), { action: "@Statistics TTL · Show request", footer: '<span>Physical row deletion · distinct from rolling-window shrinkage.</span><span>Export ↓</span>' });
  return toolbar + cards + `<div class="hygiene-main" style="height:310px">${expected}${dlq}</div><div class="hygiene-bottom" style="height:295px">${dedupe}${ttl}</div>`;
}

function benchmarksPage() {
  const toolbar = `<div class="toolbar"><div class="chip-list"><div class="chip selected">Server statistics</div><div class="chip">Client evidence</div><div class="chip">Kafka lag</div></div><div class="inline-row"><div class="small-control">15m⌄</div><div class="small-control">Avg⌄</div><span class="muted" style="font-size:10px">Updated 2s ago</span></div></div>`;
  const perfRows = [
    ['<span class="cell-mono cell-strong">GetRollingFeatures</span>','506','182','61','418','7.59 M'],
    ['<span class="cell-mono cell-strong">GetMerchantFeatures</span>','51','104','42','266','764 K'],
    ['<span class="cell-mono">GetProfile</span>','24','38','18','91','360 K'],
    ['<span class="cell-mono">GetRecentTxns</span>','8','67','27','144','120 K'],
    ['<span class="cell-mono">RecordTxn</span>','2,018','146','52','480','30.3 M'],
    ['<span class="cell-mono">RecordMerchantTxn</span>','2,018','91','36','312','30.3 M'],
  ];
  const perf = card("Server procedure performance", simpleTable(["PROCEDURE","INV/S","AVG µS","MIN µS","MAX µS","CALLS"],perfRows,["35%","11%","12%","12%","12%","18%"]), { action: "@Statistics PROCEDURE · Show request", footer: '<span>Nanoseconds converted to microseconds in the BFF.</span><span>View all 9 procedures ›</span>' });
  const latency = card("Cluster latency percentiles", `<div class="grid four-col" style="gap:8px;margin-bottom:8px">${[["p50","0.7"],["p95","1.6"],["p99","2.4"],["p99.9","4.8"]].map(m=>`<div style="border:1px solid var(--border);border-radius:8px;padding:9px"><div class="muted" style="font-size:9px">${m[0]}</div><div style="font-size:18px;font-weight:760">${m[1]}<span class="kpi-unit">ms</span></div></div>`).join("")}</div><div class="legend"><span class="legend-item" style="color:var(--purple)"><span class="legend-line"></span>p99</span><span class="legend-item" style="color:var(--accent)"><span class="legend-line"></span>p95</span></div>${lineChart(["#7c3aed","#2563eb"],190)}<div class="notice info"><span>i</span><span>Scope: @Statistics LATENCY · cluster. Not labeled feature-read-only.</span></div>`, { action: '<span class="small-control">Percentiles⌄</span>' });
  const loadgen = card("Load generation", `<div class="muted" style="font-size:10px">Steady demo load</div><div class="command-box"><span>./scripts/05_run_loadgen.sh 2000 100000</span><span class="link">Copy</span></div><div class="muted" style="font-size:10px;margin-top:12px">§8 peak · 10M customers</div><div class="command-box"><span>./scripts/05_run_loadgen.sh 15000 10000000</span><span class="link">Copy</span></div><div class="notice warn" style="margin-top:12px"><span>!</span><span>Script comment says 100k; Java default is 10M. Explicit arguments are shown.</span></div>`, { action: "View source ↗", footer: '<span>View / copy only</span><span>Not launched by console</span>' });
  const querybench = card("Query benchmark", `<div class="muted" style="font-size:10px">500 target qps · 10M customers</div><div class="command-box"><span>./scripts/06_run_querybench.sh 500 10000000</span><span class="link">Copy</span></div><div style="display:grid;place-items:center;height:135px;text-align:center"><div><strong>No live client feed configured</strong><div class="muted" style="font-size:10px;margin-top:5px">The Java process prints client round-trip percentiles to stdout every ~10 seconds.</div><div class="mono" style="font-size:9px;margin-top:12px;color:var(--accent)">p50 / p95 / p99 / p99.9 / max</div></div></div>`, { action: "FeatureQueryBench.java ↗", footer: '<span>TODO adapter hook</span><span>No fabricated live percentiles</span>' });
  const lag = card("Kafka consumer lag", `<div style="display:grid;place-items:center;height:235px;text-align:center"><div><div style="width:42px;height:42px;border-radius:50%;background:var(--slate-soft);color:var(--slate);display:grid;place-items:center;margin:0 auto 12px">${icon("activity",19)}</div><strong>Lag inspection disabled</strong><div class="muted" style="font-size:10px;margin:5px 0 13px">Group <span class="mono">novapay-feature-agg</span><br>Enable the optional Kafka admin client.</div><span class="ghost-button">Open Settings</span></div></div>`, { action: badge("OPTIONAL","neutral"), footer: '<span>No offsets changed</span><span>Trace ›</span>' });
  return toolbar + `<div class="benchmark-top" style="height:405px">${perf}${latency}</div><div class="benchmark-bottom" style="height:400px">${loadgen}${querybench}${lag}</div>`;
}

function sizingPage() {
  const toolbar = `<div class="toolbar"><div class="chip-list"><div class="chip selected">${dot("green")} Live measurement</div><div class="chip">Customer subject tier</div><div class="chip">Repository formula</div></div><div class="inline-row"><span class="muted" style="font-size:10px">@Statistics TABLE 0 · 3 hosts · 48 partitions · collected 12:04:18</span><div class="primary-button">Refresh statistics</div></div></div>`;
  const rows = [
    ['<span class="cell-mono cell-strong">TXN_RAW</span>',badge("HOT","hot"),'8.42 M','7,404.2 MB','820.4 MB','1,000 B'],
    ['<span class="cell-mono cell-strong">CUSTOMER_DAILY</span>',badge("WARM","warm"),'2.31 M','860.1 MB','80.2 MB','417 B'],
    ['<span class="cell-mono cell-strong">CUSTOMER_PROFILE</span>',badge("LIFE","life"),'99,842','28.0 MB','12.1 MB','421 B'],
    ['<span class="cell-mono">MERCHANT_TXN_SEEN</span>',badge("MERCHANT","merchant"),'4.18 M','524.3 MB','152.8 MB','166 B'],
    ['<span class="cell-mono">MERCHANT_MINUTE</span>',badge("MERCHANT","merchant"),'2.53 M','644.6 MB','87.5 MB','296 B'],
    ['<span class="cell-mono">COUNTERS</span>',badge("HYGIENE","hygiene"),'3','0.01 MB','0.00 MB','128 B'],
  ];
  const table = card("Measured table data memory", `${simpleTable(["TABLE","TIER","ROWS","TUPLE MEMORY","STRING MEMORY","BYTES / ROW"],rows,["28%","13%","14%","17%","17%","11%"]) }<div class="notice info" style="margin-top:12px"><span>i</span><span>Bytes/row = (tuple KB + string KB) × 1024 ÷ rows. Values are summed across hosts and partitions. Zero rows render —.</span></div>`, { action: "@Statistics TABLE · Show request", footer: '<span>Persistent tables only · table data memory</span><span>Export ↓</span>' });
  const projection = card("Projection", `<div class="drawer-label">Projected subject-tier data memory</div><div class="projection-number">944.0 <span style="font-size:15px;color:var(--text-secondary)">GB</span></div><div class="muted" style="font-size:10px;margin-bottom:14px">10,000,000 customer subjects · measured row sizes</div>
    <div class="slider-row"><span>Subjects</span><div class="slider" style="--fill:72%"></div><strong class="right">10.0 M</strong></div>
    <div class="slider-row"><span>Events / s</span><div class="slider" style="--fill:28%"></div><strong class="right">2,000</strong></div>
    <div class="slider-row"><span>Raw retention</span><div class="slider" style="--fill:35%"></div><strong class="right">7 d</strong></div>
    <div class="slider-row"><span>Daily retention</span><div class="slider" style="--fill:62%"></div><strong class="right">90 d</strong></div>
    <div class="formula" style="margin-top:13px"><strong>84.33</strong> raw rows/subject × 1,000 B<br>+ <strong>23.14</strong> daily rows/subject × 417 B<br>+ <strong>1</strong> profile row × 421 B<br><span style="color:var(--accent)">= 94,402 B / customer subject</span></div>`, { action: '<span class="small-control">Reset defaults</span>' });
  const awk = card("README measurement command", `<div class="code-shell" style="border:1px solid var(--border);border-radius:8px"><div class="code-toolbar"><span>README.md · Measuring bytes/subject (§8)</span><span>Copy</span></div><div class="code-body"><span class="str">"$VOLTDB_HOME"</span>/bin/sqlcmd --query=<span class="str">"exec @Statistics TABLE 0"</span> | \\<br>  awk <span class="str">'/PersistentTable/ {cnt[$6]+=$8; data[$6]+=$10; str[$6]+=$11}<br>       END {for (t in cnt) printf "%s rows=%d bytes/row=%.0f\\n",<br>       t, cnt[t], (data[t]+str[t])*1024/cnt[t]}'</span></div></div><div class="grid two-col" style="gap:10px;margin-top:12px"><div class="notice good"><span>✓</span><span>Console aggregation matches this contract for the same raw response.</span></div><div class="notice info"><span>i</span><span>Numeric BIGINT keys reduce table and index width versus VARCHAR.</span></div></div>`, { action: "Open README ↗" });
  const exclusions = card("Assumptions & exclusions", `<div class="notice warn"><span>!</span><span><strong>Not a complete production capacity model.</strong> The headline covers measured customer subject-tier table data only.</span></div><div class="grid two-col" style="gap:18px;margin-top:15px"><div><div class="drawer-label">Excluded</div><div class="event-list"><div class="event"><span class="event-icon" style="background:var(--slate-soft)">—</span><div class="event-text">Merchant storage and counters</div></div><div class="event"><span class="event-icon" style="background:var(--slate-soft)">—</span><div class="event-text">Index memory and replication</div></div><div class="event"><span class="event-icon" style="background:var(--slate-soft)">—</span><div class="event-text">Headroom, export, protocol/runtime overhead</div></div></div></div><div><div class="drawer-label">Documented inputs</div><div class="kv"><span>Event payload</span><span>~1.5 KB · assumption</span></div><div class="kv"><span>Customer key</span><span>BIGINT · ~12 digits</span></div><div class="kv"><span>Source partitions</span><span>50 · script contract</span></div></div></div>`, { action: "Show formula trace" });
  return toolbar + `<div class="sizing-layout" style="height:440px">${table}${projection}</div><div class="sizing-bottom" style="height:365px">${awk}${exclusions}</div>`;
}

function runbookPage() {
  const toolbar = `<div class="toolbar"><div class="inline-row"><div style="font-size:12px;font-weight:700">Demo progress</div><div style="width:180px;height:6px;border-radius:6px;background:#e7ebf2;overflow:hidden"><div style="width:30%;height:100%;background:var(--accent)"></div></div><span class="muted">3 of 10 steps</span></div><div class="inline-row"><div class="ghost-button">Reset checks</div><div class="chip selected">Presenter mode</div></div></div>`;
  const checks = [
    ["VoltDB reachable","14.0.1","good","✓"],
    ["Six tables","verified","good","✓"],
    ["Nine procedures","verified","good","✓"],
    ["Pipeline activity","RecordTxn increasing","good","↗"],
    ["Loadgen activity","likely · rate > 0","warn","~"],
  ];
  const preflight = card("Pre-flight checks", `<div class="preflight-grid">${checks.map(c=>`<div class="preflight"><span class="event-icon" style="color:var(--${c[2]==="good"?"green":"amber"});background:var(--${c[2]==="good"?"green":"amber"}-soft)">${c[3]}</span><strong>${c[0]}</strong><span>${c[1]}</span></div>`).join("")}</div><div class="notice info" style="margin:0 14px 12px"><span>i</span><span>Pipeline activity is proven by increasing procedure calls. Loadgen process identity is not directly observable, so its state is “likely”.</span><span class="spacer"></span><span class="link">View manual commands ↗</span></div>`, { action: "Updated 12:04:18", bodyClass: "" });
  const steps = [
    ["Pick a busy customer","Query 1 · selected 100000012345",true],
    ["Hot-tier read","GetRollingFeatures · 1440",true],
    ["Rolling-window shrink proof","GetRollingFeatures · 5",false],
    ["Warm-tier read","GetRollingFeatures · 43200",false],
    ["Materialized profile","GetProfile",false],
    ["Merchant features","GetMerchantFeatures · 60",false],
    ["Ingest correctness counters","GetCounters",false],
    ["Retry / dedupe proof","Ad-hoc query 8",false],
    ["Daily buckets","GetDailyBuckets",false],
    ["Sizing inputs","@Statistics TABLE 0",false],
  ];
  const stepList = card("Runbook steps", `<div class="step-list">${steps.map((s,i)=>`<div class="step-row ${i===2?"active":""}"><div class="step-number">${i+1}</div><div><div class="step-name">${s[0]}</div><div class="step-meta mono">${s[1]}</div></div><div class="checkbox ${s[2]?"checked":""}">${s[2]?"✓":""}</div></div>`).join("")}</div>`, { action: badge("SOURCE-LINKED","neutral"), bodyClass: "", footer: '<span>Progress stored locally</span><span>Reset</span>' });
  const active = card("Step 3 · Rolling-window shrink proof", `<div style="display:flex;align-items:center;gap:8px;margin-bottom:11px">${badge("CURRENT","hot")}${badge("HOT · TXN_RAW","hot")}<span class="muted">Uses selectedCustomer from step 1</span></div><div class="talking-point"><strong>Talking point</strong><br>A rolling feature shrinks as old events cross the moving cutoff. No batch job is needed; this is distinct from physical TTL deletion.</div><div class="code-shell" style="border:1px solid var(--border);border-radius:8px"><div class="code-toolbar"><span>Exact statement</span><span>Copy · Open SQL ↗</span></div><div class="code-body"><span class="kw">exec</span> <span class="fn">GetRollingFeatures</span> <span style="color:#b45309">100000012345</span> <span style="color:#b45309">5</span>;</div></div><div class="grid two-col" style="gap:12px;margin-top:13px"><div style="border:1px solid var(--border);border-radius:9px;padding:13px"><div class="muted" style="font-size:9px">BASELINE · 12:00:16</div><div style="font-size:27px;font-weight:760;margin-top:7px">7 <span class="kpi-unit">RAW_EVENTS</span></div><div class="muted" style="font-size:9px">accepted-ingest baseline captured</div></div><div style="border:1px solid #bfdbfe;background:#f7faff;border-radius:9px;padding:13px"><div class="muted" style="font-size:9px">FOLLOW-UP · 12:04:18</div><div style="font-size:27px;font-weight:760;color:var(--accent);margin-top:7px">5 <span class="kpi-unit">RAW_EVENTS</span></div><div class="muted" style="font-size:9px">accepted-ingest delta 0</div></div></div><div class="notice good" style="margin-top:12px"><span>✓</span><span><strong>Expected observation confirmed.</strong> Totals declined after 4m 02s with no new accepted input.</span></div><div class="drawer-section" style="margin:14px -16px 0"><div class="drawer-label">Manual checklist</div><div style="display:flex;align-items:center;gap:10px"><div class="checkbox checked">✓</div><span>Stop loadgen in terminal</span><div class="checkbox checked" style="margin-left:20px">✓</div><span>Wait for a recent event to cross the cutoff</span></div></div>`, { action: '<span class="ghost-button">Open Feature Explorer</span><span class="ghost-button">Capture baseline</span><span class="primary-button">Capture follow-up</span>', footer: '<span>Source: queries.sql · GetRollingFeatures.java</span><span>Mark Done □</span>' });
  return toolbar + `<div style="height:177px;margin-bottom:14px">${preflight}</div><div class="runbook-layout" style="height:640px">${stepList}${active}</div>`;
}

function settingsPage() {
  const toolbar = `<div class="toolbar"><div class="notice good" style="padding:7px 11px"><span>✓</span><span>Connected · VoltDB 14.0.1 · 3 hosts · last tested 12:04:18</span></div><div class="inline-row"><div class="ghost-button">Reset</div><div class="primary-button">Save changes</div></div></div>`;
  const connection = card("Connection", `<div class="settings-group"><div class="settings-row"><div class="settings-label"><strong>Environment name</strong><span>Shown in the global header</span></div><div class="input">Local PoC</div><span></span></div><div class="settings-row"><div class="settings-label"><strong>VoltDB JSON API</strong><span>BFF upstream · HTTP(S) allowlist</span></div><div class="input mono">http://localhost:8080</div><div class="ghost-button">Test connection</div></div><div class="settings-row"><div class="settings-label"><strong>Client port</strong><span>Display only · pipeline client</span></div><div class="input mono" style="background:#f8fafc;color:var(--text-secondary)">21212</div><span></span></div><div class="settings-row"><div class="settings-label"><strong>Volt Management Center</strong><span>Opens in a separate tab</span></div><div class="input mono">http://localhost:8080</div><span></span></div><div class="settings-row"><div class="settings-label"><strong>Kafka bootstrap</strong><span>Optional lag and DLQ features</span></div><div class="input mono">localhost:9092</div><span></span></div><div class="settings-row"><div class="settings-label"><strong>Kafka consumer lag</strong><span>Admin API · no offset changes</span></div><span></span><div class="toggle"></div></div><div class="settings-row"><div class="settings-label"><strong>DLQ tail</strong><span>Isolated console consumer</span></div><span></span><div class="toggle"></div></div></div>`, { action: badge("CONNECTED","good") });
  const telemetry = card("Telemetry", `<div class="settings-group"><div class="settings-row"><div class="settings-label"><strong>Polling interval</strong><span>One shared telemetry coordinator</span></div><div class="small-control">3 seconds⌄</div><span></span></div><div class="settings-row"><div class="settings-label"><strong>Pause when hidden</strong><span>Refresh immediately on return</span></div><span></span><div class="toggle on"></div></div><div class="settings-row"><div class="settings-label"><strong>Stale threshold</strong><span>Derived at 2× poll interval</span></div><div class="input">6 seconds</div><span></span></div></div>`);
  const safety = card("Safety", `<div class="settings-group"><div class="notice good" style="margin:2px 0 12px"><span>✓</span><span><strong>Read-only guard locked.</strong> Server enforcement is active.</span></div><div class="drawer-label">Mutating procedures blocked</div><div class="inline-row" style="flex-wrap:wrap;margin-bottom:13px">${badge("RecordTxn","hygiene")}${badge("RecordMerchantTxn","hygiene")}${badge("BumpCounter","hygiene")}</div><div class="danger-button">Unlock writes…</div><div class="muted" style="font-size:9px;margin-top:9px">Unlock is short-lived, session-scoped, and never persisted.</div></div>`, { action: badge("LOCKED","good") });
  const review = card("Review mode", `<div class="settings-group"><div class="mode-card selected"><div class="radio"></div><div><strong>Live cluster</strong><div class="muted" style="font-size:9px">Real VoltDB and optional Kafka sources only</div></div></div><div class="mode-card"><div class="radio"></div><div><strong>Mock data</strong><div class="muted" style="font-size:9px">Complete deterministic fixtures for visual review</div></div></div><div class="notice info" style="margin-top:12px"><span>i</span><span>Mock data is never merged with live responses. Switching clears all cached telemetry.</span></div></div>`);
  const presenter = card("Presenter", `<div class="settings-group"><div class="settings-row"><div class="settings-label"><strong>Name</strong><span>Global avatar menu</span></div><div class="input">Alex Morgan</div><span></span></div><div class="settings-row"><div class="settings-label"><strong>Initials</strong><span>Two characters</span></div><div class="input">AM</div><span></span></div><div class="settings-row"><div class="settings-label"><strong>Role</strong><span>Supporting identity line</span></div><div class="input">Solutions Architect</div><span></span></div></div>`);
  return toolbar + `<div class="settings-layout"><div class="settings-stack">${connection}${telemetry}</div><div class="settings-stack">${safety}${review}${presenter}<div class="notice info"><span>i</span><span>Connection changes activate only after a successful test and Save. Credentials are never returned to the browser or request inspector.</span></div></div></div>`;
}

const page = new URLSearchParams(location.search).get("page") || "overview";
const renderers = { overview: overviewPage, architecture: architecturePage, schema: schemaPage, procedures: proceduresPage, sql: sqlPage, explorer: explorerPage, hygiene: hygienePage, benchmarks: benchmarksPage, sizing: sizingPage, runbook: runbookPage, settings: settingsPage };
const content = (renderers[page] || overviewPage)();
document.getElementById("app").innerHTML = shell(page in TITLES ? page : "overview", content);
