# NovaPay Feature Store Console — Phase 1 UI design

Status: **ready for review; implementation intentionally not started**  
Repository reviewed: `novapay-feature-store` at commit `d87cb82`  
Primary visual reference: VoltCore Autonomous Network Console screenshot supplied with the brief

## 1. Product frame

### Audience and job to be done

The console is a presentation-grade working surface for a senior engineer or architect evaluating the Kafka → VoltSP → VoltDB tiered feature-store proof of concept. It should let the presenter move from a claim to its proof in one or two actions:

- see a live number;
- reveal the exact request and response that produced it;
- inspect the repository source that defines the behavior;
- compare repository definitions with the deployed cluster; and
- rerun the relevant SQL or stored procedure without leaving the console.

The primary narrative is the ten-step sequence in `src/main/resources/queries.sql`: busy-customer discovery, hot reads, eviction, warm reads, profile, merchant reads, counters, deduplication, daily buckets, and sizing.

### Experience principles

1. **Evidence before decoration.** Every metric has a trace affordance. The trace names the procedure or SQL, fields, aggregation, collection time, raw request, raw response, and whether the source is live or mock.
2. **Live means live.** A connected session never fills gaps with fixture data. Unavailable data is `—` with a reason. Mock mode is a single, global, unmistakable mode.
3. **Dense but calm.** Match the supplied reference: a fixed navigation rail, shallow header, compact controls, six-up KPIs, white bordered cards, minimal shadow, and restrained status color.
4. **Repository and runtime stay comparable.** DDL, procedures, configuration, and run commands retain their exact identifiers and include their repository path. Runtime differences are shown as structured diffs, never silently normalized.
5. **Safe by default.** The SQL workspace and procedure runner are read-only until writes are deliberately unlocked. Enforcement exists on the server as well as in the browser.
6. **The tier model is always legible.** Customer hot, customer warm, lifetime, merchant, ingest hygiene, Kafka, and VoltSP use the same colors and labels on every page.
7. **The demo can recover.** Loading, first-sample, idle, stale, disconnected, partial-data, empty, and error states are designed rather than left to generic spinners.

### Scope boundary for Phase 1

This document defines the complete experience, visual system, route layouts, component contracts, data sources, safety behavior, responsive behavior, and open decisions. Phase 2 will implement the design under `ui/`. This phase does not modify Java, DDL, scripts, `pom.xml`, or any live cluster.

## 2. Information architecture

| Order | Navigation label | Route | Primary question answered |
|---:|---|---|---|
| 1 | Overview | `/overview` | Is the PoC healthy, active, and producing credible feature data? |
| 2 | Architecture | `/architecture` | How does an event move through Kafka, VoltSP, tiers, and read procedures? |
| 3 | Schema & DDL | `/schema` | What is stored, retained, indexed, and actually deployed? |
| 4 | Procedures | `/procedures` | What does each procedure do, and what happens when I run it? |
| 5 | SQL Console | `/sql` | Can I issue real ad-hoc SQL/system calls and inspect results and plans? |
| 6 | Feature Explorer | `/explorer` | What features does a customer or merchant have across time windows? |
| 7 | Ingest Hygiene | `/hygiene` | Are bad, late, or retried events handled and accounted for? |
| 8 | Benchmarks | `/benchmarks` | What throughput and latency does the live system report? |
| 9 | Sizing (§8) | `/sizing` | What does each tier cost in bytes per row and projected RAM? |
| 10 | Demo Runbook | `/runbook` | Can the presenter execute the proof in a reliable sequence? |
| 11 | Settings | `/settings` | Which environment, polling, safety, and presenter preferences are active? |

`/` redirects to `/overview`. Deep links preserve demo context:

- `/explorer?subject=customer&id=100000012345&window=1440`
- `/explorer?subject=merchant&id=M-00042&window=60`
- `/procedures?name=GetRollingFeatures`
- `/schema?table=TXN_RAW&tab=ddl`
- `/sql?snippet=08-dedupe-proof`
- `/runbook?step=3`

### Command palette (`⌘K` / `Ctrl+K`)

The palette searches four grouped command types: **Navigate**, **Run snippet**, **Open definition**, and **Look up subject**. Exact database identifiers appear in monospace. Risky/mutating procedure names do not appear in the run group while read-only mode is active. Keyboard selection is visible; `Esc` closes; the query is cleared after navigation.

## 3. Visual foundation

### 3.1 Color tokens

Tokens are CSS custom properties so a future dark theme can replace values without changing component code. Only the light values below are implemented in Phase 2.

| Token | Value | Use |
|---|---:|---|
| `--canvas` | `#F6F7F9` | App background |
| `--surface` | `#FFFFFF` | Sidebar, header, cards, menus |
| `--surface-subtle` | `#F9FAFB` | Code headers, table hover, secondary panels |
| `--surface-active` | `#EEF2FF` | Active navigation and selected subtle rows |
| `--border` | `#E5E7EB` | Default borders/dividers |
| `--border-strong` | `#D1D5DB` | Focus-adjacent and emphasized dividers |
| `--text` | `#111827` | Primary labels and values |
| `--text-secondary` | `#6B7280` | Supporting copy and units |
| `--text-muted` | `#9CA3AF` | Empty, disabled, timestamps |
| `--accent` | `#2563EB` | Links, focus, primary series/actions |
| `--accent-hover` | `#1D4ED8` | Hover/pressed blue |
| `--accent-soft` | `#EFF6FF` | Blue icon tiles and selected rows |
| `--purple` | `#7C3AED` | Warm-tier series |
| `--purple-soft` | `#F3E8FF` | Warm-tier tint |
| `--green` | `#16A34A` | Healthy / VoltSP |
| `--green-soft` | `#ECFDF3` | Healthy / VoltSP tint |
| `--amber` | `#D97706` | Idle, warning, schema drift |
| `--amber-soft` | `#FFF7ED` | Warning tint |
| `--red` | `#DC2626` | Error / hygiene / destructive |
| `--red-soft` | `#FEF2F2` | Error tint |
| `--teal` | `#0D9488` | Lifetime tier |
| `--teal-soft` | `#ECFEFF` | Lifetime tint |
| `--orange` | `#EA580C` | Merchant tier |
| `--orange-soft` | `#FFF1E8` | Merchant tint |
| `--slate` | `#64748B` | Kafka and neutral infrastructure |
| `--slate-soft` | `#F1F5F9` | Kafka tint |

#### Canonical tier mapping

| Domain | Canonical label | Color | Never substitute with |
|---|---|---|---|
| `TXN_RAW` | Customer hot | Blue | Generic “primary” without HOT label |
| `CUSTOMER_DAILY` | Customer warm | Purple | Blue |
| `CUSTOMER_PROFILE` | Lifetime | Teal | Green |
| `MERCHANT_MINUTE`, `MERCHANT_TXN_SEEN` | Merchant | Orange | Amber warning |
| `COUNTERS`, DLQ | Ingest hygiene | Red | Orange |
| Kafka | Kafka | Slate | Blue |
| VoltSP | VoltSP | Green | Healthy status without a label |

Status color and tier color are separate semantics. For example, an unhealthy merchant card uses the orange merchant badge plus a red error treatment; it does not become a red merchant tier.

### 3.2 Typography

Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Code: `"JetBrains Mono", "SFMono-Regular", Consolas, monospace`.

| Role | Size / line | Weight | Notes |
|---|---|---:|---|
| Micro / keycap | `11px / 14px` | 500–600 | Badges, raw field types, timestamps |
| Caption | `12px / 16px` | 500 | Table headers, subtitle, footer |
| Body compact | `13px / 18px` | 400–600 | Navigation, rows, controls |
| Card title | `15px / 20px` | 600 | Card headers |
| Page title | `17px / 22px` | 650 | Header only |
| KPI | `26px / 30px` | 700 | `font-variant-numeric: tabular-nums` |
| Large evidence | `32px / 38px` | 700 | Sizing projection only |
| Code | `12px / 19px` | 400 | SQL/Java/config viewers |

All counts, rates, timings, byte values, timestamps, and table numeric columns use tabular numerals. Identifiers are never title-cased or altered.

### 3.3 Spacing, shape, elevation, and motion

| Token | Value | Use |
|---|---:|---|
| `--space-1` … `--space-8` | `4, 8, 12, 16, 20, 24, 28, 32px` | 4 px base rhythm |
| `--radius-control` | `8px` | Nav rows, inputs, buttons |
| `--radius-card` | `12px` | Cards, drawers, panels |
| `--radius-pill` | `999px` | Chips and status pills |
| `--shadow-card` | `0 1px 2px rgba(15,23,42,.04)` | Cards only |
| `--shadow-overlay` | `0 12px 32px rgba(15,23,42,.14)` | Palette, drawer, popover |
| `--focus-ring` | `0 0 0 3px rgba(37,99,235,.20)` | All keyboard-focusable controls |

Animation is functional and restrained: 120 ms for hover/press, 180 ms for drawers and palette, 220 ms for chart updates. Respect `prefers-reduced-motion`. Numeric values do not count upward on initial render; this avoids implying fabricated live motion.

### 3.4 App geometry

- Sidebar: `190px` fixed on ≥1280 px viewports; collapses to `64px` icon rail at 1024–1279 px; becomes a drawer below 1024 px.
- Header: `64px` fixed, white, 1 px bottom border.
- Footer: `36px` fixed to the content bottom on tall pages, otherwise after content.
- Content: 20 px inset at desktop, 16 px at compact desktop/tablet, 12 px on mobile.
- Card gaps: 16 px desktop, 12 px compact.
- Working minimum: 1024 px. The console remains usable below this width, but dense tables switch to horizontal scroll or stacked evidence cards.
- Overview grid at ≥1440 px: `300px minmax(520px, 1fr) 420px`; second row `minmax(720px, 1fr) 420px`.
- Card border: 1 px `--border`; no heavy drop shadows.

### 3.5 Iconography and data ink

Use 16 px Lucide outline icons at 1.75 stroke for navigation and controls; 18 px icons inside 32 px tinted KPI tiles. Charts use 2 px lines, no gradient fills, four horizontal gridlines, short tick labels, and a visible legend. Tooltips show exact unrounded values and collection time. Donuts keep a 12 px ring and put the aggregate in the center.

## 4. Application shell

```text
┌──────────────────┬──────────────────────────────────────────────────────────────────────────────┐
│ V  Volt          │ ☰  NovaPay Feature Store Console                    Environment  Status  Search │
│                  │    Real-time segmentation PoC v4 · Kafka → VoltSP → VoltDB       Bell  User   │
│ Overview         ├──────────────────────────────────────────────────────────────────────────────┤
│ Architecture     │ page toolbar / tier chips / time range                                      │
│ Schema & DDL     │                                                                              │
│ Procedures       │ page content                                                                  │
│ SQL Console      │                                                                              │
│ Feature Explorer│                                                                              │
│ Ingest Hygiene   │                                                                              │
│ Benchmarks       │                                                                              │
│ Sizing (§8)      │                                                                              │
│ Demo Runbook     ├──────────────────────────────────────────────────────────────────────────────┤
│ Settings         │ © 2026 Volt Active Data    Feature ingest and reads…    rates · version Live │
│                  │                                                                              │
│ VoltDB Cluster   │                                                                              │
│ ● Healthy        │                                                                              │
│ localhost:8080   │                                                                              │
│ Open VMC ↗       │                                                                              │
└──────────────────┴──────────────────────────────────────────────────────────────────────────────┘
```

The header status has four explicit states:

| State | Label | Trigger |
|---|---|---|
| Connected and flowing | `All Systems Operational` | health succeeds and ingest delta > 0 |
| Connected but idle | `Pipeline idle` | health succeeds and ingest delta = 0 after two samples |
| Partial/stale | `Telemetry stale` | last success > 2× poll interval or optional Kafka call fails |
| Disconnected | `VoltDB unreachable` | health or required VoltDB request fails |
| Mock | `Mock data · not connected` | global mock mode; purple outline, never green |

The pinned cluster card shows JSON API host, health, last update, and the VMC link. VMC opens the configured HTTP base in a new tab. The footer rate remains `—` until a second statistics sample exists.

## 5. Page designs

### 5.1 Overview

**Purpose:** establish health and activity, then provide direct paths to the demo's strongest evidence. The first viewport contains the tier filters, six KPIs, storage, a live rate chart, and the compact pipeline.

```text
┌ Tier chips: ● Hot  ● Warm  ● Lifetime  ● Merchant  ● Hygiene  ● Kafka  ● VoltSP ── [15m ▾] ┐
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤
│ ↗ Ingest     │ ⇄ Feature    │ ◷ Read p99   │ ◎ Subjects   │ ▤ Hot rows   │ ! Rejected   │
│ 2,018 ev/s   │ 506 q/s      │ 2.4 ms       │ 99,842       │ 8.42 M       │ 1,403        │
├────────────────────┬──────────────────────────────────────────────┬──────────────────────┤
│ Tier Storage  ⓘ    │ Ingest & Reads Over Time  ⓘ       [15m][Avg]│ Pipeline (Live)  ⓘ ↗│
│   donut + total    │ — RecordTxn/s — Merchant/s — Reads/s        │ Kafka → VoltSP       │
│ ● table rows / MB  │                                              │    ↘ DLQ             │
│ ● table rows / MB  │               line chart                     │ VoltDB tier nodes     │
│ View sizing ›      │                                              │ ● flowing ● idle ● err│
├───────────────────────────────────────────────────────────────────┼──────────────────────┤
│ Busiest Customers (24 h)  ⓘ                                      │ Recent Hygiene Events│
│ CUSTOMER_ID          TXNS          SPEND             source badge │ time  event  delta   │
│ 100000012345         1,284         4,832,914.20       WARM         │ 12:04 dropped_late +3│
│ Multi-partition ad-hoc query · demo use   View in SQL › Export ↓  │ No rejected events…  │
└───────────────────────────────────────────────────────────────────┴──────────────────────┘
```

Interactions and states:

- Selecting a tier chip dims unrelated chart series, storage legend entries, cards, and rows; it does not hide evidence by default. `Alt+click` isolates one tier.
- KPI hover shows source and latest collection time; clicking opens `RequestInspector`.
- Rates require two cumulative-stat samples. The first state reads `Waiting for the second statistics sample…` and renders `—`, not zero.
- Clicking a busy customer opens the Customer tab in Feature Explorer. `View in SQL console` opens snippet 1 with its exact SQL.
- `Recent Hygiene Events` derives entries from counter deltas; repeated equal samples create no feed item. Optional Kafka DLQ payloads are explicitly labeled `Kafka tail`.
- A failed optional Kafka request does not turn VoltDB KPIs into errors; the pipeline card shows a partial-data badge.

### 5.2 Architecture

**Purpose:** explain the exact event path and make every node inspectable. The SVG is semantic: nodes are keyboard-focusable buttons, edges have text equivalents, and rates are optional overlays rather than the only communication channel.

```text
┌ Architecture ───────────────────────────────────────────────────────────────────── [Live rates] ┐
│                                                                                                 │
│ [Loadgen] → [Kafka novapay-txn-events · 50] → [VoltSP novapay-txn-feature-ingest-v4]                │
│                                                   │ parse → contract → lateness                 │
│                         bad / late ────────────────┤────────→ [novapay-txn-dlq · 4]                │
│                                                   └────────→ [BumpCounter]                       │
│                         valid: two single-partition calls                                       │
│                            ├→ [RecordTxn] → [TXN_RAW 7d] → [CUSTOMER_DAILY 90d] → [PROFILE ∞]   │
│                            └→ [RecordMerchantTxn] → [SEEN 48h] → [MERCHANT_MINUTE 7d]            │
│                                                                                       [Reads]   │
│   Selected-node drawer → config · partition key · TTL · source excerpt · live rows  ┌─────────┐ │
│                                                                                     │Rolling  │ │
│                                                                                     │Merchant │ │
│                                                                                     │Profile… │ │
└─────────────────────────────────────────────────────────────────────────────────────┴─────────┴─┘
┌ Tier / Storage / Retention / Serves ─────────────────────────────────────────────────────────────┐
│ README tier table, wording preserved; identifiers link to Schema or Procedures                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
┌ Precision statement (repository wording) ─────────────────────────┐ ┌ Why tiers ────────────────┐
│ Verbatim text + source path + detected source-code discrepancy    │ │ Customers 0.94 bucket/evt│
│ badge if unresolved                                               │ │ Merchants ~50:1          │
└───────────────────────────────────────────────────────────────────┘ └────────────────────────────┘
```

Node selection opens a right drawer without changing the route; the node is encoded in `?node=` for sharing. The drawer uses tabs: **Runtime**, **Contract**, **Source**, **Trace**. Runtime shows `—` when a stat cannot be attributed to the selected node. Live edge labels are rates calculated from cumulative procedure deltas. A zero rate is `Idle` only after two valid samples.

The pipeline stages and tier language come from `README.md` and `config/pipeline-config.yaml`. The drawer exposes the `handle()` source from `TxnFeaturePipeline.java`; Phase 2 needs a whitelisted repository-source endpoint for this file.

### 5.3 Schema & DDL

**Purpose:** compare authored schema to deployed schema and explain retention, width, keys, indexes, and procedure ownership.

```text
┌ Schema & DDL ─────────────────────────────────────────────────────────── [Refresh catalog] ┐
│ ┌ Tables (6) ────────────┐ ┌ Selected: CUSTOMER_DAILY ────────────────────────────────┐   │
│ │ TXN_RAW       HOT      │ │ ● WARM · partition CUSTOMER_ID · TTL 90 DAYS            │   │
│ │ CUSTOMER_DAILY WARM    │ │ Runtime: 2.31M rows · 418 B/row · Matches repo DDL ✓     │   │
│ │ CUSTOMER_PROFILE LIFE  │ │                                                        │   │
│ │ MERCHANT_TXN_SEEN MERCH│ │ Columns        Type       Null Default  Comment          │   │
│ │ MERCHANT_MINUTE MERCH  │ │ CUSTOMER_ID    BIGINT     no   —        …                │   │
│ │ COUNTERS      HYGIENE  │ │ DAY_START      TIMESTAMP  no   —        …                │   │
│ │                         │ │ ▶ 38 filler accumulators (200-attribute width)          │   │
│ │ partition · TTL        │ │                                                        │   │
│ │ live rows · bytes/row  │ │ Primary key · indexes · Readers · Writers               │   │
│ └─────────────────────────┘ └────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [ddl.sql] [remove_db.sql] [Deployed diff]                    Copy  Open Procedures ↗     │
│  1  -- NovaPay feature-store PoC v4…                                                      │
│  2  CREATE TABLE CUSTOMER_DAILY (…                                                     │
│                                                                  Deploy command  Copy   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- The list always shows all six tables and their canonical tier badge. Runtime columns appear only after table statistics resolve.
- `As deployed` compares normalized repository DDL facts with `@SystemCatalog TABLES`, `COLUMNS`, `INDEXINFO`, `PRIMARYKEYS`, `PROCEDURES`, and `PROCEDURECOLUMNS`. Normalization ignores formatting and statement order but not type, nullability, default, partition key, TTL, primary key, index, or procedure binding.
- Diff severity: green `Matches repo DDL`; amber `N differences`; red `Catalog unavailable`. Expandable diff rows are `repo`, `deployed`, `impact`.
- `F01…F38` starts collapsed as `38 filler accumulators (200-attribute width)`. Expansion reveals exact names/types/defaults and the repository explanation.
- The source viewer preserves repository text, line numbers, search, and copy. `remove_db.sql` receives a red `Destructive script · view only` label.

### 5.4 Procedures

**Purpose:** inspect and execute all nine procedures while retaining parameters, source, result-set structure, plans, and raw transport evidence.

```text
┌ Procedures ───────────────────────────────────────────────────────────── [Search…] [Read-only ✓] ┐
│ ┌ Procedure list (9) ───────────────────┐ ┌ GetRollingFeatures  JAVA  HOT/WARM ────────────────┐ │
│ │ Name                  Kind  inv/s  µs │ │ Partition: TXN_RAW.CUSTOMER_ID · parameter 0       │ │
│ │ GetRollingFeatures    Java   506  182 │ │ Parameters                                             │ │
│ │ GetMerchantFeatures   Java    51  104 │ │ customerId [100000012345]  windowMinutes [1440]       │ │
│ │ GetProfile            SQL     24   38 │ │ Computed tier: HOT · from TXN_RAW                     │ │
│ │ …                                      │ │ [Execute ⌘↵] [Explain] [Show request]                 │ │
│ └────────────────────────────────────────┘ ├────────────────────────────────────────────────────┤ │
│                                           │ [Result 1] [Distinct amount] [Distinct merchants]    │ │
│                                           │ [Profile] [Plan] [Source]                            │ │
│                                           │ RAW_EVENTS  TXN_COUNT  TXN_AMOUNT_SUM …               │ │
│                                           │ 1,284       1,090      4,832,914.20                   │ │
│                                           │ Client 4.8 ms · server 0.18 ms · 4 VoltTables         │ │
│                                           │ source viewer / request inspector                     │ │
│                                           └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- List rows show kind, partition binding, parameter signature, live invocation delta rate, and average execution time. No prior sample means `—`.
- Parameter forms are generated from a checked-in UI signature manifest derived from the Java/DDL sources and compared with `@SystemCatalog PROCEDURECOLUMNS`. A mismatch blocks execution until the presenter confirms the deployed signature.
- Defaults: customer `100000012345`, merchant `M-00042`, common window `1440`; values remain editable and are validated before transport.
- `GetRollingFeatures` displays `HOT · TXN_RAW` for `windowMinutes ≤ 10080` and `WARM · CUSTOMER_DAILY` above that boundary. The result tabs follow the actual return order: hot has aggregate, distinct amount, distinct merchants, profile; warm has aggregate, profile.
- `Execute` uses `POST /api/volt/call`. `Explain` calls `@ExplainProc` through the same allowlisted call endpoint. Java/SQL source is read-only.
- Mutating Java procedures (`RecordTxn`, `RecordMerchantTxn`, `BumpCounter`) are inspectable in read-only mode but their form is disabled. Unlocking writes changes this state only after the global safety confirmation.

### 5.5 SQL Console

**Purpose:** make ad-hoc proof fast, safe, and fully inspectable for SQL, `exec` calls, system procedures, plans, and multi-result responses.

```text
┌ SQL Console ─────────────────────────────────────────────────────────────────────────────────────┐
│ ┌ Snippets ───────────────┐ ┌ Editor ──────────────────────────────────────────────────────────┐ │
│ │ Demo queries            │ │ [Run ⌘↵] [Explain ○] [Read-only locked] [History] [Show request]│ │
│ │ 01 Busy customers       │ │ 1  exec GetRollingFeatures 100000012345 1440;                   │ │
│ │ 02 Hot-tier read        │ │                                                                  │ │
│ │ …                       │ │                                                                  │ │
│ │ 10 Sizing inputs        │ │                                                                  │ │
│ │                         │ └──────────────────────────────────────────────────────────────────┘ │
│ │ System                  │ ┌ Results · 4 sets · 10 rows · 4.8 ms ─────────────────────────────┐ │
│ │ @Statistics TABLE       │ │ [Aggregate] [Distinct amount] [Distinct merchants] [Profile]     │ │
│ │ @Statistics TTL         │ │ Column             BIGINT      DECIMAL …                         │ │
│ │ @Statistics PROCEDURE   │ │ RAW_EVENTS         1,284       …                                 │ │
│ │ @Statistics LATENCY     │ │                                                                  │ │
│ │ @Statistics MEMORY      │ │ [1–100 of 1,240]                     Export CSV · Copy Markdown   │ │
│ │ @SystemInformation      │ └──────────────────────────────────────────────────────────────────┘ │
│ └─────────────────────────┘ [Plan] [History] [Request & response]                                │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- CodeMirror 6 uses SQL syntax, line numbers, selection highlighting, bracket matching, and a VoltDB completion list. `⌘↵` / `Ctrl+Enter` runs; `Shift+⌘↵` runs the selected statement(s).
- A quote-aware tokenizer splits semicolon-delimited statements and recognizes `exec Procedure arg…`, including quoted strings and `@` system procedures. Each statement produces a result group; each VoltTable is a tab.
- `@AdHoc` receives non-`exec` SQL. The Explain toggle sends eligible SQL to `@Explain`; procedures use `@ExplainProc`. Explain is disabled with a stated reason when not supported.
- Headers show field name and Volt type. Type codes are decoded centrally: 3 TINYINT, 4 SMALLINT, 5 INTEGER, 6 BIGINT, 8 FLOAT, 9 STRING, 11 TIMESTAMP, 22 DECIMAL, 25 VARBINARY.
- TIMESTAMP displays ISO while hover/copy can reveal raw microseconds. DECIMAL remains a string end-to-end. VARBINARY renders a bounded hexadecimal preview.
- Large results use TanStack Table and row virtualization. Pagination is client-side over returned data because the VoltDB call has already materialized the result; the UI warns when no SQL `LIMIT` is present.
- History persists locally with timestamp, elapsed time, status, mode, and a pinned flag. Raw responses are not persisted by default.
- The server performs the final read-only classification. With the guard locked it denies DML, DDL, `LOAD`, destructive system procedures, and known mutating application procedures even if the browser is bypassed.

### 5.6 Feature Explorer

**Purpose:** make hot/warm behavior, materialized attributes, moving-window shrinkage, daily storage, recent transactions, and merchant features inspectable for a real subject selected from live data.

```text
┌ Feature Explorer ───────────────────────────────────────────────────────────────────────────────┐
│ [Customer] [Merchant]   Customer ID [100000012345        ] [Pick a busy customer] [Load]       │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Profile  LIFE     First seen · Last event · Last city · Lifetime count/sum · 24h count/sum     │
│                  AVG_TICKET 1,932.18  [materialized inside RecordTxn]              Show trace   │
├────────────────┬────────────────┬────────────────┬────────────────┬─────────────────────────────┤
│ 5 min  HOT     │ 1 hour  HOT   │ 24 hours HOT  │ 30 days WARM   │ Custom [10081] min  WARM     │
│ txn count  —   │ txn count  12 │ txn count 394 │ txn count 9.3k│ every returned aggregate      │
│ amount     —   │ amount   …    │ exact distinct│ day edge note │ computed source + trace        │
├───────────────────────────────────────────────┬────────────────────────────────────────────────┤
│ Rolling-window shrink proof                   │ Daily buckets (30)                            │
│ Baseline [Capture now]  Follow-up [Capture]   │ [Txn count] [Amount] bar chart                │
│ elapsed · new input warning · field deltas    │ day-aligned bars                              │
├───────────────────────────────────────────────┴────────────────────────────────────────────────┤
│ Recent Transactions · retry rows highlighted                                                   │
│ CREATED_AT · TXN_ID · TYPE · AMOUNT · RESULT · MERCHANT · ATTEMPT_COUNT [retry deduplicated]   │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Customer behavior:

- ID validation accepts exactly a positive 12-digit integer for the demo contract and serializes it as an integer-safe decimal string until the BFF validates it against JavaScript safe-integer limits.
- `Pick a busy customer` runs query 1, opens a compact chooser, and carries the selected ID into Runbook steps 2–5, 8, and 9.
- Window cards are generated from a shared result adapter. Hot cards expose all four actual result sets; warm cards expose aggregate and profile. A badge states the real boundary source.
- The copy reads `computed from TXN_RAW · minute-aligned cutoff` for the current Java procedure. It must not claim a call-time exact-to-the-second boundary until the source/README discrepancy is resolved.
- The shrink widget is named **Rolling-window shrink proof**, not TTL eviction proof. Physical TTL deletion is shown separately on Ingest Hygiene. Baseline and follow-up include timestamps, elapsed time, accepted-ingest delta, and warnings when new events arrived.
- Capture is disabled when the selected subject has no 5-minute activity. The UI recommends choosing a subject with current events instead of presenting two identical empty snapshots as proof.
- `GetRecentTxns` retry rows show `retry deduplicated` as supporting evidence. An info note links to `RecordTxn` source because a row alone does not prove aggregate semantics.

Merchant behavior:

```text
┌ [Customer] [Merchant]   Merchant ID [M-00042] [Pick active merchant] [Load] ┐
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│ 5 min MERCHANT  │ 60 min MERCHANT│ 1440 min MERCH │ Custom window         │
│ aggregate fields│ aggregate fields│ aggregate fields│ validation + trace    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Last 60 minute buckets · TXN_COUNT / AMOUNT_SUM sparkline · minute-aligned │
└─────────────────────────────────────────────────────────────────────────────┘
```

`Pick active merchant` uses an ad-hoc aggregate against recent `MERCHANT_MINUTE` rows rather than assuming `M-00042` has current data. The preset remains `M-00042` because it is the runbook example.

### 5.7 Ingest Hygiene

**Purpose:** prove that invalid/late input is counted, that retry attempts converge on deduplicated rows, and that physical TTL cleanup is observable.

```text
┌ Ingest Hygiene ─────────────── [15m ▾] [Auto refresh] [Kafka tail: disabled] ┐
├──────────────────┬──────────────────┬──────────────────┬───────────────────┤
│ unparseable_json │ bad created_at   │ missing subject  │ dropped_late      │
│ 0   0.000%       │ 394  0.196%      │ 391  0.194%      │ 588  0.293%       │
│ delta sparkline  │ delta sparkline  │ delta sparkline  │ delta sparkline   │
├────────────────────────────────────────────┬────────────────────────────────┤
│ Expected vs observed                      │ Recent rejected input           │
│ Case · injected · observed · sample       │ DLQ payload · inferred reason   │
│ malformed JSON · not injected · 0         │ “Reason inferred” badge         │
│ invalid timestamp · ~0.196% · 0.196%      │ or: Kafka tail not enabled      │
├────────────────────────────────────────────┴────────────────────────────────┤
│ Retry / dedupe evidence                                                    │
│ CUSTOMER_ID · TXN_ID · AMOUNT · ATTEMPT_COUNT · RESULT · source links      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Physical TTL activity                                                      │
│ TABLE · rows deleted · last round · remaining · last delete time           │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Ratios use `accepted RecordTxn delta + rejection-counter deltas` as the closest available input denominator, with the formula visible. Dividing only by `RecordTxn` would undercount inputs.
- Loadgen edge cases are injected only on non-retries, so displayed expected whole-stream values are approximately 0.196% bad timestamp, 0.196% missing key, and 0.294% late when retries are 2%. These are expectations, not pass/fail thresholds.
- `dlq_unparseable_json` is labeled `not injected by standard loadgen`; an observed nonzero value remains valid evidence from another producer.
- DLQ payloads contain the original payload but no reason field. The UI labels any reason as **inferred** and correlates only when a deterministic payload defect is visible; lateness inference uses the configured bound and current time.
- Physical TTL deletion data comes from `@Statistics TTL 0` and is never conflated with the moving query boundary in Feature Explorer.

### 5.8 Benchmarks

**Purpose:** separate server-side procedure execution statistics from client-side querybench measurements and make collection gaps explicit.

```text
┌ Benchmarks ───────────────────────────────────────────────────────────── [15m ▾] [Avg ▾] ┐
├────────────────────────────────────────────────┬─────────────────────────────────────────┤
│ Server procedure performance                   │ Cluster latency percentiles             │
│ Procedure · inv/s · avg/min/max µs · calls     │ p50 / p95 / p99 / p99.9 line chart      │
│ GetRollingFeatures …                           │ Scope: @Statistics LATENCY (cluster) ⓘ  │
├────────────────────────────────────────────────┼─────────────────────────────────────────┤
│ Load generation                               │ Query benchmark                           │
│ ./scripts/05_run_loadgen.sh 2000       Copy   │ ./scripts/06_run_querybench.sh 500  Copy │
│ §8 peak: … 15000                       Copy   │ client output format · source path       │
│ Commands are view/copy only · not launched    │ No live client feed configured —         │
├────────────────────────────────────────────────┴─────────────────────────────────────────┤
│ Optional Kafka consumer lag · group novapay-feature-agg · disabled/enabled/error           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- Procedure durations from `@Statistics PROCEDURE` convert nanoseconds to microseconds in one tested utility.
- `@Statistics LATENCY` is labeled **cluster latency** unless the returned schema and runtime allow procedure-level attribution. It must not be presented as feature-read-only p99 by assumption.
- Querybench percentiles are client round trips printed to stdout about every ten seconds. The current repo exposes no feed, so the initial card shows command, defaults, report shape, and `No live client feed configured`. A future adapter hook is labeled TODO and is not simulated in live mode.
- Script comments currently say 100k customers while both Java programs default to 10M. The UI shows explicit commands with arguments and a source-warning badge until the comments are reconciled.

### 5.9 Sizing (§8)

**Purpose:** reproduce the README measurement, explain every term, guard edge cases, and project subject-tier memory without pretending the formula covers all cluster overhead.

```text
┌ Sizing (§8) ───────────────────────────────────────────────────────────── [Refresh statistics] ┐
│ Measurement source: @Statistics TABLE 0 · 3 hosts · 48 partitions · collected 12:04:18        │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Table                Rows       Tuple MB    String MB    Bytes/row    Tier                       │
│ TXN_RAW              8.42 M     7,404.2     820.4        1,000        HOT                        │
│ CUSTOMER_DAILY       2.31 M       860.1      80.2          417        WARM                       │
│ CUSTOMER_PROFILE     99,842        28.0      12.1          421        LIFE                       │
│ …                                                                                              │
├──────────────────────────────────────────────┬─────────────────────────────────────────────────┤
│ Bytes per customer subject                  │ Projection                                      │
│ rawRows/subject × raw B/row                 │ Subjects [10,000,000] Events/s [2,000]          │
│ + dailyRows/subject × daily B/row           │ Raw retention [7d] Daily retention [90d]        │
│ + 1 × profile B/row                         │ Projected subject-tier RAM  96.4 GB              │
│ = measured subject-tier footprint           │ [Assumptions] [Formula] [Trace]                  │
├──────────────────────────────────────────────┴─────────────────────────────────────────────────┤
│ README awk command (verbatim) · Copy  │ BIGINT vs VARCHAR key note │ exclusions / zero-row note │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Group `@Statistics TABLE` rows by `TABLE_NAME`; sum `TUPLE_COUNT`, `TUPLE_DATA_MEMORY`, and `STRING_DATA_MEMORY` across hosts/partitions. Memory fields are KB. `bytesPerRow = (tupleKB + stringKB) × 1024 / rows`.
- When rows are zero, bytes/row is `—` with `No rows to measure`; never divide by zero.
- The measured customer formula is `TXN_RAW rows/customer × raw bytes/row + CUSTOMER_DAILY rows/customer × daily bytes/row + 1 × profile bytes/row`. The UI shows the actual subject denominator and all intermediate values.
- The projection panel states its modeling assumptions. It excludes merchant storage, counters, index memory, replication, headroom, export, and protocol/runtime overhead unless a reviewed extension explicitly adds them.
- The exact README awk command remains visible beside the computed table so the evaluator can compare outputs.

### 5.10 Demo Runbook

**Purpose:** provide a reliable, source-linked presentation sequence with real prerequisites, carried context, inline results, and honest expected observations.

```text
┌ Demo Runbook ─────────────────────────────── Progress 3/10 ── [Reset checks] [Presenter mode] ┐
│ Pre-flight                                                                                     │
│ ✓ VoltDB reachable  ✓ six tables  ✓ nine procedures  ● pipeline activity  ○ loadgen activity │
│ Manual commands: build · create topics · start VoltDB · deploy · pipeline · loadgen · bench   │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1  Pick a busy customer               [Run] [Open SQL] [✓ Done]                               │
│    exact statement · expected result · selected demo ID 100000012345                           │
│    Result grid                                                                                  │
│ 2  Hot-tier read                       [Run] [Open procedure] [□ Done]                          │
│    exec GetRollingFeatures ${selectedCustomer} 1440                                            │
│ 3  Rolling-window shrink proof         [Capture baseline] [Capture follow-up] [□ Done]         │
│    prerequisite: recent events; stop loadgen is a manual instruction, never a UI process action│
│ …                                                                                               │
│ 10 Sizing inputs                       [Run] [Open sizing] [□ Done]                             │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Pre-flight auto-checks: health via `@SystemInformation OVERVIEW`; six tables via catalog; nine expected procedures via catalog; accepted ingest activity via increasing `RecordTxn`; load activity is `likely` rather than proven because the UI cannot directly inspect the loadgen process.
- The commands from `README.md` and `scripts/0*.sh` are copied verbatim and remain view/copy-only. Pipeline must precede loadgen because `startingOffset` is `LATEST`.
- Step 1 result selection sets `selectedCustomer` for later steps. If no row is returned, the step provides a retry/empty explanation instead of inserting the hardcoded ID silently.
- Step 3 uses the Feature Explorer snapshot component and calls the evidence a rolling-window shrink. It requires a recent-event subject and enough elapsed time. `Stop loadgen` is a manual checklist item.
- Each step contains: talking point, exact statement, source path, `Run`, inline result, expected observation, request inspector, and persistent local Done state. Results are not persisted across reloads.

### 5.11 Settings

**Purpose:** make environment and safety state clear without turning the console into infrastructure management.

```text
┌ Settings ──────────────────────────────────────────────────────────────────────────────────────┐
│ Connection                                                                                     │
│ Environment name [Local PoC]      VoltDB JSON API [http://localhost:8080] [Test connection]    │
│ Client port 21212 (display only)  VMC URL [derived / override]                                 │
│ Kafka bootstrap [localhost:9092]  [Enable lag] [Enable DLQ tail]                               │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Telemetry                                                                                      │
│ Poll interval [3 s]  [Pause when hidden ✓]  Stale threshold [6 s, derived]                     │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Safety                                                                                         │
│ Read-only guard [Locked ✓]     Unlock writes…                                                  │
│ Server enforcement active · mutating procedures listed                                         │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Review mode                                                                                    │
│ [Live cluster] [Mock data]   Mock data is never merged with live responses                     │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Presenter                                                                                      │
│ Name [Alex Morgan]  Initials [AM]  Role [Solutions Architect]                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Connection testing never changes the active environment until it succeeds and the user saves.
- Mock mode is global, persists locally, replaces the header status with `Mock data · not connected`, and adds a slim purple banner to every page.
- Read-only unlocking requires typing the current environment name and acknowledging that UI calls may mutate the cluster. Locking again is one click. The BFF is authoritative.
- Presenter data, navigation density, mode, and polling preference may live in browser storage. Connection endpoints and safety state should be BFF-managed; the persistence choice is an open decision below.
- Help text explains that the VoltDB JSON API requires HTTPD and JSON API to be enabled. Credentials, if added later, must never be returned to the browser or request inspector.

## 6. Component inventory and contracts

Components are small, composable, and presentation-first. Fetching, polling, decoding, mode selection, and security do not live inside card components. Phase 2 should reuse accessible shadcn primitives where the generated/installed component exists, Lucide for icons, Recharts for quantitative charts, CodeMirror 6 for editing, highlight.js or Shiki for read-only source, and TanStack Table + Virtual for large grids.

### 6.1 Shared domain types

```ts
type DataMode = "live" | "mock";
type Tier = "hot" | "warm" | "lifetime" | "merchant" | "hygiene" | "kafka" | "voltsp";
type AsyncPhase = "loading" | "first-sample" | "ready" | "empty" | "stale" | "error";
type Tone = "neutral" | "info" | "success" | "warning" | "danger" | Tier;

type TraceSource = {
  id: string;
  label: string;
  mode: DataMode | "repo";
  endpoint: string;
  request: unknown;
  response?: unknown;
  collectedAt?: string;
  fields: string[];
  formula?: string;
  repositoryPath?: string;
  caveat?: string;
  timing?: { bffRoundTripMs: number; upstreamMs?: number };
};

type AsyncModel<T> = {
  phase: AsyncPhase;
  data?: T;
  error?: { title: string; detail: string; trace: TraceSource };
  lastGoodAt?: string;
  source: "live" | "mock" | "repo";
};
```

### 6.2 Shell and navigation

| Component | Required props | Responsibility |
|---|---|---|
| `ConsoleShell` | `navigation`, `header`, `footer`, `children`, `sidebarMode` | Fixed shell geometry, skip link, main landmark, responsive rail/drawer |
| `AppSidebar` | `items`, `activeRoute`, `collapsed`, `clusterSummary`, `onToggle` | Brand, 11 destinations, active state, pinned cluster card |
| `TopHeader` | `title`, `subtitle`, `environment`, `systemStatus`, `searchHint`, `presenter` | Page identity, environment, global status, palette trigger, avatar |
| `FooterStatus` | `ingestRate`, `readRate`, `version`, `liveState`, `updatedAt` | Source-aware footer; renders `—` until rates are defensible |
| `PageToolbar` | `chips?`, `range?`, `actions?`, `children?` | Consistent row below header; wraps without losing controls |
| `CommandPalette` | `open`, `groups`, `query`, `onQueryChange`, `onSelect`, `onClose` | Keyboard-first global navigation and commands |
| `MobileNavDrawer` | `open`, `items`, `activeRoute`, `onClose` | Modal navigation under 1024 px with focus return |

### 6.3 Visual primitives

| Component | Required props | Responsibility |
|---|---|---|
| `Card` | `title?`, `subtitle?`, `info?`, `actions?`, `state?`, `trace?`, `footer?`, `children` | White bordered container; owns header/footer spacing, not data loading |
| `KpiCard` | `label`, `value`, `unit?`, `icon`, `tone`, `state`, `trace`, `secondary?` | 32 px icon tile, 26 px tabular value, source-aware unknown/error |
| `Chip` | `label`, `tone`, `selected`, `dot?`, `count?`, `onSelect`, `ariaPressed?` | Tier filters and compact toggles; visible text always accompanies color |
| `StatusPill` | `status`, `label`, `updatedAt?`, `title?` | Green/amber/red/mock state with icon/dot and text |
| `TierBadge` | `tier`, `label?`, `table?`, `windowMinutes?`, `compact?` | Canonical tier color and boundary label; never computes server data itself |
| `InfoTooltip` | `label`, `content`, `side?` | Accessible explanatory popover opened by focus or pointer |
| `EmptyState` | `title`, `detail?`, `icon?`, `action?`, `compact?` | Product-specific empty/first-sample states |
| `InlineNotice` | `tone`, `title`, `detail?`, `action?`, `trace?` | Warning, partial, stale, or error content inside a page/card |
| `CopyButton` | `value`, `label?`, `successLabel?` | Clipboard feedback without replacing the copied source |
| `MetricValue` | `value`, `unit?`, `format`, `unknownReason?`, `precision?` | Tabular formatting; preserves zero vs null vs unknown |
| `TimeAgo` | `timestamp`, `staleAfterMs?` | Stable relative label; accessible exact timestamp |

### 6.4 Evidence, source, and results

| Component | Required props | Responsibility |
|---|---|---|
| `RequestInspector` | `open`, `trace`, `onClose`, `initialTab?` | Drawer with Summary, Request, Response, Formula, Source; redacts secrets |
| `TraceButton` | `trace`, `label?`, `compact?` | Opens the request inspector from any metric or result |
| `DataGrid<Row>` | `columns`, `rows`, `rowKey`, `schema?`, `state`, `virtualize?`, `pagination?`, `onRowActivate?`, `trace` | Semantic table, virtualization, type labels, keyboard row activation, horizontal overflow |
| `ResultTabs` | `results`, `activeId`, `onChange`, `timing`, `trace`, `exporters` | One tab per statement/VoltTable; stable result names with numeric fallback |
| `CodeViewer` | `language`, `source`, `path`, `lineNumbers`, `highlights?`, `diff?`, `onCopy` | Read-only Java/SQL/YAML/Bash with source identity |
| `SqlEditor` | `value`, `onChange`, `onRun`, `onExplain`, `selection?`, `guardState`, `busy`, `diagnostics` | CodeMirror wrapper and keyboard behavior; no security authority |
| `ProcedureForm` | `signature`, `values`, `errors`, `tier?`, `disabledReason?`, `onChange`, `onExecute`, `onExplain` | Typed parameters, sensible defaults, source/deployed mismatch state |
| `SourceDiff` | `repoFacts`, `deployedFacts`, `unknownFacts`, `onOpenSource` | Structured DDL/procedure match view with partial-verification label |
| `ExportMenu` | `formats`, `onExport`, `disabledReason?` | CSV and Markdown export; preserves DECIMAL/TIMESTAMP semantics |

### 6.5 Telemetry and domain components

| Component | Required props | Responsibility |
|---|---|---|
| `TierStorageDonut` | `tables`, `selectedTiers`, `state`, `trace`, `onSelectTable` | Memory donut plus rows/MB legend and text alternative |
| `RateTrendChart` | `series`, `range`, `aggregation`, `state`, `trace`, `onRangeChange`, `onAggregationChange` | Bounded time-series chart; gaps remain gaps |
| `PipelineMiniMap` | `nodes`, `edges`, `selectedTiers`, `state`, `onOpenArchitecture` | Compact architecture with live/idle/error labels |
| `ArchitectureDiagram` | `nodes`, `edges`, `selectedNode`, `rates`, `state`, `onSelectNode` | Interactive SVG plus synchronized accessible node/edge list |
| `ProcedureStatsTable` | `rows`, `state`, `trace`, `onSelectProcedure` | Calls/rates/durations with correct unit conversion |
| `WindowFeatureCard` | `windowMinutes`, `tier`, `aggregate`, `distincts?`, `state`, `trace` | Branch-aware hot/warm adapter; does not assume equal result shapes |
| `WindowSnapshot` | `baseline?`, `followUp?`, `activityDelta?`, `onCapture`, `eligibility` | Moving-window comparison, elapsed time, new-input warning |
| `CounterCard` | `name`, `value`, `rate`, `ratio?`, `expected?`, `series`, `state`, `trace` | Canonical counter facts without inventing absent/failing values |
| `SizingTable` | `tables`, `state`, `trace`, `formula` | Host/partition aggregation and zero-row guard |
| `ProjectionCalculator` | `inputs`, `measured`, `assumptions`, `onChange`, `result` | Transparent subject-tier formula, not a generic capacity promise |
| `RunbookStep` | `number`, `title`, `talkingPoint`, `statement`, `expected`, `state`, `done`, `onRun`, `onDoneChange`, `trace` | Inline execution and persistent local progress |
| `PreflightCheck` | `label`, `status`, `evidence`, `manualCommand?`, `trace?` | Auto/manual distinction and likely-vs-proven wording |

### 6.6 Overlays and state ownership

- `RequestInspector`, node detail, history, and command palette use accessible Dialog/Sheet primitives with focus trapping, `Esc`, and focus restoration.
- A page owns selection and URL state. A domain component owns only ephemeral local interaction such as expanded rows.
- `TelemetryCoordinator` owns polling and normalized sample history. `LiveDataSource` or `MockDataSource` owns transport. No component calls `fetch` directly.
- `Toast` is used only for transient actions such as copied/exported/saved. Data errors remain inline and persistent.

## 7. Data and API architecture

### 7.1 Proposed Phase-2 structure

```text
ui/
├── DESIGN.md
├── package.json · package-lock.json · .nvmrc · .gitignore
├── index.html · vite.config.ts · tsconfig*.json
├── src/
│   ├── app/               router, providers, ConsoleShell
│   ├── pages/             11 route compositions
│   ├── components/        ui, data, and domain components
│   ├── data/              ConsoleDataSource, LiveDataSource, MockDataSource
│   ├── telemetry/         coordinator, store, selectors, rate math
│   ├── mocks/fixtures/    complete endpoint contracts and state variants
│   └── styles/tokens.css  canonical visual tokens
├── server/
│   ├── routes/            volt, repo, kafka, health, settings, security
│   ├── services/          VoltJsonClient, RepoReader, KafkaInspector
│   ├── aggregation/       table, procedure, latency, TTL, memory
│   └── security/          SQL classifier, procedure and path policies
└── shared/                API, Volt types, domain types, tier constants
```

Use React 18, strict TypeScript, Vite, Tailwind mapped to `tokens.css`, Recharts, CodeMirror 6, highlight.js or Shiki, TanStack Table/Virtual, React Router, and Fastify. Route-level lazy-load CodeMirror, highlighting, charting, and the architecture surface. Pin Node 20 in `ui/.nvmrc`; the current host reports Node 25 and is not the acceptance runtime.

### 7.2 Common response envelope

```ts
type ApiEnvelope<T> = {
  source: "live" | "mock" | "repo";
  data: T;
  capturedAt: string;
  requestId: string;
  timing: { bffRoundTripMs: number; upstreamMs?: number };
  inspector: { request: unknown; response: unknown };
  warnings?: Array<{ code: string; message: string }>;
};
```

`bffRoundTripMs` is never labeled `server elapsed`. The supplied VoltDB JSON response contract does not guarantee per-call server duration. Server execution time is shown only when a live response/statistic provides a defensible field; otherwise it is `—`.

Volt decoding is central and lossless:

- BIGINT and DECIMAL are strings in normalized JSON;
- TIMESTAMP becomes `{ rawMicros: string, iso: string }`;
- each column retains `{ name, typeCode, typeName }`;
- top-level and per-result `status === 1` are required;
- `statusstring` is retained and surfaced on failure; and
- malformed, oversized, or timed-out upstream responses become typed errors with trace metadata.

### 7.3 BFF route contract

| Route | Upstream / source | Validation and output |
|---|---|---|
| `POST /api/volt/call` | VoltDB `/api/1.0/` | `{procedure, params}`; allowlist/read-only policy; normalized VoltTables |
| `POST /api/volt/sql` | `@AdHoc` | `{sql}`; server parser and write policy; one response per statement |
| `POST /api/volt/explain` | `@Explain` | Read SQL only; normalized plan result |
| `GET /api/volt/stats/:selector` | `@Statistics selector 0` | Fixed selector enum; raw and aggregated TABLE/PROCEDURE/LATENCY/TTL/MEMORY |
| `GET /api/volt/catalog/:selector` | `@SystemCatalog selector` | Fixed selector enum; normalized catalog rows |
| `GET /api/health` | `@SystemInformation OVERVIEW` plus BFF checks | reachability, version, host count, uptime when available |
| `GET /api/repo/ddl` | `ddl.sql` | Exact source text and metadata |
| `GET /api/repo/remove-ddl` | `remove_db.sql` | Exact source text; destructive label |
| `GET /api/repo/queries` | `queries.sql` | Exact source plus parsed numbered snippets |
| `GET /api/repo/config` | `pipeline-config.yaml` | Redacted raw source plus parsed allowlisted values |
| `GET /api/repo/procedures/:name/source` | five whitelisted Java files / four DDL excerpts | Named procedure only; no caller path |
| `GET /api/repo/source/:id` | pipeline/loadgen/querybench/README | Additional fixed identifiers required by Architecture, Benchmarks, Sizing |
| `GET /api/repo/scripts` | six whitelisted `scripts/0*.sh` | Exact text and parsed display commands |
| `GET /api/kafka/dlq/tail?n=50` | optional isolated consumer | bounded `n`; no production group offsets/commits |
| `GET /api/kafka/lag` | optional Kafka admin | group `novapay-feature-agg`; explicit disabled state |
| `GET/PUT /api/settings/connection` | BFF session/config | host allowlist, redaction, test-before-save |
| `POST /api/security/unlock`, `DELETE /api/security/unlock` | BFF memory session | short-lived session unlock; permanent admin denylist remains |

The extra fixed repository endpoints are necessary to satisfy the requested source/runbook views. `RepoReader` maps identifiers to absolute known files and confirms the resolved path remains inside the repository. It never accepts an arbitrary path.

### 7.4 Shared polling

One `TelemetryCoordinator`, exposed through `useSyncExternalStore`, manages resource keys such as `health`, `stats:procedure`, `stats:latency`, `stats:table`, `stats:ttl`, `counters`, `kafka:lag`, and `kafka:dlq`.

- The default tick is 3 seconds and uses a recursive timeout so requests do not overlap.
- Active page subscriptions are reference-counted; the header/footer keep only their required global keys active.
- One tick fetches each active resource at most once and publishes `Promise.allSettled` results independently.
- Requests abort when `document.hidden`; the coordinator refreshes immediately when visible.
- Rates require two samples and use the actual timestamp delta. First sample, negative delta, counter reset, cluster identity/start-time change, or mode change clears the baseline and returns unknown.
- Bounded in-memory ring buffers hold 5m, 15m, and 1h views. Gaps and failures are stored as gaps rather than interpolated points.
- Stale begins after 2× the configured polling interval. A last-known value may remain visible with `Stale · last successful…`; it is never styled as current.

### 7.5 Strict mock/live separation

`ConsoleDataSource` has complete `LiveDataSource` and `MockDataSource` implementations. The selected provider is global.

- No live failure falls back to a fixture.
- Changing mode aborts requests, clears resource caches/ring buffers, swaps providers, and reloads route data.
- Every payload is tagged with its source; the store rejects a source that does not match the active mode.
- `npm run mock` starts with mock selected and renders every route with realistic, deterministic fixtures.
- Repository source endpoints may remain real in mock mode because they expose actual static project files, not fabricated telemetry. The request inspector labels them `repo`.
- Fixture sets cover success, loading delay, first-sample, empty, stale, partial, and error for every endpoint. A developer-only fixture selector may exist behind a URL flag; it is not part of presenter UI.

### 7.6 Read-only and network safety

- Fastify binds to `127.0.0.1` by default because authentication is out of scope.
- Locked mode positively allows `SELECT`, the six read procedures, and documented read-only system/catalog/statistics/explain calls. It blocks `RecordTxn`, `RecordMerchantTxn`, `BumpCounter`, DML, DDL, `LOAD`, and unknown procedures.
- SQL classification is quote-, comment-, and multi-statement-aware on the server. Client parsing exists only for editor UX.
- Unlock is short-lived and session-scoped in server memory. It is not stored in localStorage. Destructive administrative system procedures and process/deployment control remain permanently denied.
- Stats/catalog selectors are fixed enums. Customer and merchant identifiers are validated before any constructed SQL.
- The editable VoltDB base is an SSRF boundary: allow only HTTP(S), reject embedded credentials, and enforce an environment-configured hostname/IP allowlist.
- Request Inspector redacts authorization, cookies, connection credentials, Kafka secrets, and future environment secrets.
- Optional DLQ tail uses a console-specific group/client, reads bounded tail offsets, and never joins or commits as `novapay-feature-agg`.

## 8. Data-source map

The `TraceSource` attached to every widget records the call, fields, formula, and caveat shown below. Derived values retain links to all contributing requests.

### 8.1 Shell and Overview

| Widget | Console/BFF call | VoltDB or repository source | Fields / calculation | Refresh and caveat |
|---|---|---|---|---|
| Header health | `GET /api/health` | `@SystemInformation OVERVIEW` | version, host count, uptime/cluster identity when present | 3 s; failure = unreachable |
| Pipeline status | health + procedure rate + optional Kafka | `@Statistics PROCEDURE 0` | `RecordTxn` invocation delta; optional lag | `idle` means no accepted writes, not proof the pipeline process stopped |
| Footer ingest | `GET /api/volt/stats/PROCEDURE` | `@Statistics PROCEDURE 0` | delta `RecordTxn` invocations / elapsed seconds | Accepted customer calls, not total Kafka input |
| Footer reads | same | same | deltas for `GetRollingFeatures` + `GetMerchantFeatures` | First sample = `—` |
| Ingest rate KPI | same | same | `RecordTxn` delta rate | Tooltip says `accepted RecordTxn calls/s` |
| Feature reads KPI | same | same | `GetRollingFeatures` + `GetMerchantFeatures` deltas | Does not include ad-hoc/profile calls unless design is revised |
| Read p99 KPI | `GET /api/volt/stats/LATENCY` | `@Statistics LATENCY 0` | percentile adapter after live schema validation | Label `Cluster p99` until read-only attribution is proven |
| Subjects KPI | `GET /api/volt/stats/TABLE` | `@Statistics TABLE 0` | summed `TUPLE_COUNT` for `CUSTOMER_PROFILE` | One row/customer by schema invariant |
| Hot-tier rows KPI | same | same | summed `TUPLE_COUNT` for `TXN_RAW` | Host/partition aggregation |
| Rejected + late KPI | `POST /api/volt/call` | `GetCounters()` | sum canonical `dlq_unparseable_json`, `dlq_unparseable_created_at`, `dlq_missing_subject_key`, `dropped_late` | Successful call + absent name = 0; failed call = `—`; do not sum arbitrary names |
| Tier Storage | table stats | `@Statistics TABLE 0` | per table: rows, tuple KB, string KB, total MB | Donut value is measured table data memory, excludes indexes |
| Ingest/read chart | procedure stats | `@Statistics PROCEDURE 0` | `RecordTxn/s`, `RecordMerchantTxn/s`, feature reads/s | Client/store ring buffer only; no historical database table |
| Pipeline mini-map | procedure stats + counters + repo config | `@Statistics PROCEDURE 0`, `GetCounters`, `pipeline-config.yaml` | edge rates, names, lateness; DLQ counter deltas | Kafka→VoltSP rate unavailable without optional Kafka telemetry |
| Busiest customers | `POST /api/volt/sql` | query 1 from `queries.sql` through `@AdHoc` | `CUSTOMER_ID`, `TXNS`, `SPEND` | Multi-partition; current SQL is day-bucket aligned, not an exact rolling 24h |
| Hygiene feed | `GetCounters` + optional `/api/kafka/dlq/tail` | counter deltas / DLQ | name, delta, sample interval; payload | Counter event and Kafka payload are not assumed to correlate one-to-one |

### 8.2 Architecture, Schema, and Procedures

| Widget | Console/BFF call | Upstream/source | Fields / calculation | Caveat |
|---|---|---|---|---|
| Architecture nodes | `GET /api/repo/source/README`, `/api/repo/config`, `/api/repo/scripts` | README, YAML, topic script | topic/group names, 50/4 partitions, flow, lateness | Partition counts come from script, not YAML |
| Pipeline node drawer | `GET /api/repo/source/pipeline` | `TxnFeaturePipeline.java` | parse/validate/lateness/DLQ/call excerpts | Valid events call merchant procedure only with merchant ID |
| Architecture row counts | table stats | `@Statistics TABLE 0` | table `TUPLE_COUNT` sums | Only table nodes have row counts |
| Architecture edge rates | procedure stats and counters | `@Statistics PROCEDURE 0`, `GetCounters` | call/counter deltas | Two application writes are independently atomic |
| Tier table and precision | `GET /api/repo/source/README` | README sections | exact repository prose | Display unresolved minute-boundary warning |
| Table list | `GET /api/repo/ddl` + table stats | `ddl.sql`, `@Statistics TABLE 0` | six tables, partition/TTL, rows, bytes/row | Four TTL tables use `BATCH_SIZE 5000` |
| Columns/keys/indexes | repo DDL + catalog | `ddl.sql`, `@SystemCatalog COLUMNS/PRIMARYKEYS/INDEXINFO` | name, type, nullability, default, PK, explicit/generated indexes | Explicit vs generated indexes are distinguished |
| Procedure relationships | repo manifest + catalog | DDL registrations and Java SQL statements | readers/writers per table | Source-derived manifest is compared at build/test time |
| Deployed match | catalog selectors | TABLES, COLUMNS, INDEXINFO, PRIMARYKEYS, PROCEDURES, PROCEDURECOLUMNS | normalized fact diff | TTL and class byte identity may be unverifiable; report partial match |
| DDL tabs | `/api/repo/ddl`, `/api/repo/remove-ddl` | exact files | source text, line numbers, copy | remove script is view-only/destructive |
| Procedure list | catalog + procedure stats + source manifest | `@SystemCatalog`, `@Statistics PROCEDURE 0`, repo files | name, kind, partition, params, invocation rate, durations | Parameter display names for DDL `?` placeholders are UI metadata |
| Procedure source | `/api/repo/procedures/:name/source` | five Java files / four DDL excerpts | exact source | No arbitrary path |
| Procedure execute | `POST /api/volt/call` | selected procedure | branch-aware VoltTables | Mutators blocked while locked |
| Procedure explain | `POST /api/volt/call` | `@ExplainProc name` | plan result | Support/shape verified live; otherwise unavailable reason |

### 8.3 SQL Console and Feature Explorer

| Widget | Call | Returned fields | Adapter rules |
|---|---|---|---|
| Snippet library | `GET /api/repo/queries` | numbered comments and exact statements | Preserve order 1–10; add separate System group |
| SQL statements | `POST /api/volt/sql` | schema and data per VoltTable | `@AdHoc`; preserve result order and types |
| `exec` statements | `POST /api/volt/call` | procedure-dependent | Quote-aware parsing is repeated/validated server-side |
| SQL plan | `POST /api/volt/explain` | plan text/table | Keep monospace; no fabricated cost summary |
| Profile card | `GetProfile(customerId)` | all nine profile columns including `CUSTOMER_ID` | Prefer this over embedded profile when ID is needed |
| Hot window cards | `GetRollingFeatures(id, 5/60/1440)` | table 0: `RAW_EVENTS`, `TXN_COUNT`, `TXN_AMOUNT_SUM`, `AMOUNT_MIN`, `AMOUNT_MAX`, `SUCCESS_COUNT`, `SUCCESS_AMOUNT_SUM`, `CARD_COUNT`, `CARD_AMOUNT_SUM`, `MANDATE_COUNT`, `MANDATE_AMOUNT_SUM`; table 1 `AMOUNT_DISTINCT`; table 2 `DISTINCT_MERCHANTS`; table 3 eight profile fields | Hot empty SUM values can be null; do not coerce absence blindly to 0 |
| Warm window card | `GetRollingFeatures(id, 43200)` | table 0: `DAYS`, `TXN_COUNT`, `ATTEMPT_COUNT`, sums/min/max/filter fields; table 1 profile | Shape is not compatible with hot; no distinct result sets |
| Custom window | same | hot for `≤10080`; warm for `>10080` | Positive integer minutes; show actual branch |
| Shrink snapshots | repeated `GetRollingFeatures(id, 5)` + procedure stats | hot aggregate/distincts + accepted-ingest delta | Compare nullable fields field-by-field; show intervening activity |
| Daily buckets | `GetDailyBuckets(id)` | `DAY_START`, `TXN_COUNT`, `ATTEMPT_COUNT`, `TXN_AMOUNT_SUM`, `AMOUNT_MIN`, `AMOUNT_MAX`, `SUCCESS_COUNT`, `CARD_COUNT`, `CARD_AMOUNT_SUM`, `MANDATE_COUNT`, `MANDATE_AMOUNT_SUM` | Up to 30; no `SUCCESS_AMOUNT_SUM` in this procedure |
| Recent transactions | `GetRecentTxns(id)` | `TXN_ID`, `CREATED_AT`, `EVENT_TYPE`, `TXN_TYPE`, `AMOUNT`, `PAYMENT_RESULT`, `MERCHANT_ID`, `CITY`, `ATTEMPT_COUNT` | Up to 20; retry badge when attempt > 1 |
| Merchant windows | `GetMerchantFeatures(id, 5/60/1440)` | `BUCKETS`, `ATTEMPT_COUNT`, `TXN_COUNT`, `AMOUNT_SUM`, `AMOUNT_MIN`, `AMOUNT_MAX`, `SUCCESS_COUNT`, `SUCCESS_AMOUNT_SUM` | Sums are coalesced; min/max may be null |
| Merchant sparkline | `POST /api/volt/sql` | `BUCKET_START`, `TXN_COUNT`, `AMOUNT_SUM` | Server constructs from validated merchant ID or safely parameterizes equivalent call |

### 8.4 Hygiene, Benchmarks, Sizing, and Runbook

| Widget | Call/source | Fields / formula | Caveat |
|---|---|---|---|
| Counter cards | `GetCounters()` | key by `NAME`; current `VAL`; delta rate over samples | Counter schema permits additional names |
| Expected ratios | counters + procedure deltas + loadgen source | rejected delta / (`RecordTxn` delta + rejection deltas) | Expected injection applies only to non-retries |
| Dedupe evidence | query 8 via `@AdHoc` | `CUSTOMER_ID`, `TXN_ID`, `AMOUNT`, `ATTEMPT_COUNT`, `PAYMENT_RESULT` | Supporting evidence; link to write procedure semantics |
| TTL table | `@Statistics TTL 0` | table, rows deleted, last-round deletion, remaining, last time as exposed by live schema | Filter four TTL tables; field names validated against live VoltDB 14.0.1 |
| DLQ tail | optional Kafka endpoint | raw payload, partition, offset, timestamp, inferred reason | Reason not present in emitted payload |
| Server procedure table | `@Statistics PROCEDURE 0` | invocation deltas and avg/min/max nanoseconds converted to µs | Treat reset/restart as new baseline |
| Latency chart | `@Statistics LATENCY 0` | p50/p95/p99/p99.9 after schema-specific aggregation | Cluster scope unless verified otherwise |
| Loadgen card | script + loadgen Java source | exact commands, defaults, injection percentages | Script comment 100k vs Java 10M warning |
| Querybench card | script + Java source | exact command; output format p50/p95/p99/p99.9/max | No live stdout adapter in scope |
| Kafka lag | optional admin endpoint | current group offsets/end offsets and lag | Disabled state is valid |
| Sizing table | `@Statistics TABLE 0` | sum rows and KB; bytes/row formula | Persistent tables only; zero-row guard |
| Bytes/subject | table stats | raw rows/subjects × raw B/row + daily rows/subjects × daily B/row + profile B/row | Customer subject tier only |
| Projection | measured B/row + user inputs | visible equation and assumptions | Not a complete production capacity model |
| Preflight health | health | reachability/version/host data | `reachable` only |
| Preflight schema | catalogs | expected six tables/nine procedures/signatures | Partial/full verification label |
| Preflight activity | procedure stats | increasing `RecordTxn` | Indicates accepted calls, not process identity |
| Runbook steps | queries source + calls above | exact statement and inline result | Step 1 customer selection is carried forward |

## 9. Exact repository contracts represented in the UI

### 9.1 Tables

| Table | Key / partition | TTL | Explicit secondary indexes | UI relationship summary |
|---|---|---|---|---|
| `TXN_RAW` | PK `(CUSTOMER_ID, TXN_ID)`; partition `CUSTOMER_ID` | 7 days on `CREATED_AT`, batch 5000 | `IDX_TXN_RAW_CUST_TIME`, `IDX_TXN_RAW_TTL` | written/read by `RecordTxn`; read by rolling/recent procedures |
| `CUSTOMER_DAILY` | PK `(CUSTOMER_ID, DAY_START)`; partition `CUSTOMER_ID` | 90 days on `DAY_START`, batch 5000 | `IDX_CUSTOMER_DAILY_TTL` | written/read by `RecordTxn`; read by rolling/daily procedures |
| `CUSTOMER_PROFILE` | PK/partition `CUSTOMER_ID` | none | none | written/read by `RecordTxn`; read by rolling/profile procedures |
| `MERCHANT_TXN_SEEN` | PK `(MERCHANT_ID, TXN_ID)`; partition `MERCHANT_ID` | 48 hours on `CREATED_AT`, batch 5000 | `IDX_MERCHANT_SEEN_TTL` | merchant dedupe, read/write by `RecordMerchantTxn` |
| `MERCHANT_MINUTE` | PK `(MERCHANT_ID, BUCKET_START)`; partition `MERCHANT_ID` | 7 days on `BUCKET_START`, batch 5000 | `IDX_MERCHANT_MINUTE_TTL` | written/read by `RecordMerchantTxn`; read by merchant procedure |
| `COUNTERS` | PK/partition `NAME` | none | none | written by `BumpCounter`; read by `GetCounters` |

`CUSTOMER_DAILY` has 51 physical columns: two keys, eleven named accumulators/aggregates, and 38 width fillers (`F01…F38`). The fillers model the intended row width and are not presented as business features.

### 9.2 Procedures and result shape

| Procedure | Kind / route | Parameters | Result shape used by UI |
|---|---|---|---|
| `RecordTxn` | Java; `TXN_RAW.CUSTOMER_ID` | long, string, long, double, five strings | scalar 1 new / 0 duplicate; mutating |
| `RecordMerchantTxn` | Java; `MERCHANT_MINUTE.MERCHANT_ID` | string, string, long, double, string, string | scalar 1 new / 0 duplicate; mutating |
| `BumpCounter` | Java; `COUNTERS.NAME` | string | new value; mutating |
| `GetRollingFeatures` | Java; `TXN_RAW.CUSTOMER_ID` | long customer, int window | hot: 4 VoltTables; warm: 2 VoltTables |
| `GetMerchantFeatures` | Java; `MERCHANT_MINUTE.MERCHANT_ID` | string merchant, int window | 1 aggregate VoltTable |
| `GetRecentTxns` | DDL; `TXN_RAW.CUSTOMER_ID` | customer | up to 20 transaction rows |
| `GetProfile` | DDL; `CUSTOMER_PROFILE.CUSTOMER_ID` | customer | zero/one full profile row |
| `GetDailyBuckets` | DDL; `CUSTOMER_DAILY.CUSTOMER_ID` | customer | up to 30 daily rows |
| `GetCounters` | DDL; multi-partition | none | ordered `NAME`, `VAL` rows |

The procedure manifest explicitly marks `RecordTxn`, `RecordMerchantTxn`, and `BumpCounter` as mutating. It also records result order so a fixed result index cannot confuse hot and warm profile data.

## 10. State model and interaction behavior

### 10.1 Card and page states

| State | Visual treatment | Copy and behavior |
|---|---|---|
| Loading | Fixed-height neutral skeleton matching final layout | Preserve card title and source tooltip; do not show zeros |
| First sample | Muted center state or `—` metric | `Waiting for the second statistics sample…` for rate math |
| Empty | Quiet icon + product-specific explanation | Successful empty results are distinct from unknown/error |
| Partial | Amber inline notice; successful widgets stay normal | Name the unavailable optional source; no mock fallback |
| Stale | Keep last good value at reduced emphasis + amber badge | Show exact last success and retry state |
| Error | Red inline notice inside affected boundary | Human summary, failing call, retry, and Request Inspector |
| Disconnected | Header red pill; page data boundaries fail independently | Repository source pages remain usable |
| Mock | Purple header/banner, mock trace labels | Complete mock surface; never a green Live pill |
| Reset/restart | Clear deltas and trends; retain definitions | `Cluster changed; collecting a new baseline…` |

### 10.2 Zero, null, empty, and unknown

- `0` means a successful source reported zero.
- `null` is preserved as database null and rendered `—` with `NULL` on hover where meaningful, especially MIN/MAX on empty aggregates.
- `—` without `NULL` means unknown/unavailable and requires an explanation.
- A successful `GetCounters` call with no canonical row may display zero for that expected convention; a failed call may not.
- Empty result tables retain their schema headers and show `No rows returned`.
- Rounding is display-only. Request Inspector and exports preserve exact strings.

### 10.3 Primary flows

#### Trace a number

1. Focus or select the metric's `ⓘ`/trace affordance.
2. View source label, fields, collection time, formula, and caveat.
3. Open Request Inspector for raw request/response.
4. Follow the repository source or open the equivalent SQL/procedure view.

#### Run a procedure or SQL statement

1. Choose a snippet/procedure or enter text.
2. Client validates obvious types and displays the computed tier.
3. BFF parses and enforces the current safety policy.
4. Busy state disables duplicate execution but leaves cancel/navigation available.
5. Result tabs render schema-first, followed by exact timing labels and trace.
6. Failures keep the statement and parameters intact and show `statusstring`.

#### Compare repository and deployed state

1. Load repository facts immediately.
2. Fetch catalogs and runtime stats independently.
3. Normalize supported facts, classifying each as `match`, `different`, or `unverifiable`.
4. Never label the whole schema `matches` if required TTL/class facts are unverifiable; use `Verified fields match · N unverified`.
5. A difference opens the exact repo and deployed values with impact text.

#### Run the demo

1. Complete preflight; manual process steps remain manual.
2. Step 1 selects a real current subject and stores it in runbook context.
3. Later statements interpolate that selected subject visibly.
4. Each `Run` uses the same execution/result/trace components as SQL Console.
5. Step completion is manual and local, even if the call succeeds; a presenter can decide whether the observation was convincing.

## 11. Responsive behavior

| Viewport | Shell | Grid behavior | Dense-workspace adaptations |
|---|---|---|---|
| `≥1440px` | 190 px sidebar, full header | Six KPI columns; three-column Overview | Matches supplied reference density |
| `1024–1439px` | 64 px icon rail | Three-by-two KPIs; two-column cards | Avatar text may collapse; tooltips retain labels |
| `768–1023px` | Sidebar drawer | Two KPI columns; mostly one-column cards | SQL snippets become a drawer; detail panes stack |
| `<768px` | Sidebar drawer; compact header | One column | Tables use labeled horizontal scroll; editor above results; KPI labels stay visible |

Architecture on mobile offers pan/zoom but also an equivalent ordered node/edge list. Code viewers keep line numbers and horizontal scroll. Cards do not hide trace/source actions behind hover. Touch targets are at least 40×40 px even when the visible icon is 16 px.

## 12. Accessibility and keyboard contract

Target WCAG 2.2 AA.

- A skip link lands on `<main>`. Sidebar, header, main, and footer use landmarks.
- Focus rings use `--focus-ring` and are never removed. Drawer/palette focus is trapped and restored.
- Tier, health, and error meaning always includes text or iconography; color is supplementary.
- Charts include a concise text summary and an accessible tabular alternative. SVG nodes have names, roles, descriptions, and keyboard activation.
- Tables use correct header scopes; virtualized grids preserve announced row/column context and provide a non-virtualized export.
- Status announcements use `aria-live="polite"` only for meaningful transitions (connected, disconnected, run complete/failed), not every 3-second update.
- Tooltips open by focus and pointer and are dismissible with `Esc`.
- `⌘K` / `Ctrl+K`: palette. `⌘↵` / `Ctrl+Enter`: run. `Esc`: close top overlay. Standard browser shortcuts are not overridden.
- Reduced-motion users receive immediate drawer/chart state changes without animated interpolation.
- Text and UI contrast meet AA; muted text is not used for essential 12 px instructions on white.

## 13. Source reconciliation and honest UI wording

Repository review found several places where display copy must be more precise than the supplied brief. Phase 2 should implement the treatment below unless the underlying repository changes first.

| Source issue | Evidence-based UI treatment |
|---|---|
| README says hot windows are exact to the second; `GetRollingFeatures` floors the cutoff to the minute | Say `exact aggregates from raw events · minute-aligned cutoff`; show an amber source discrepancy in Architecture |
| Query 1 says last 24 h but filters midnight daily buckets with `DAY_START > NOW()-1 day` | Keep the exact snippet; label result `Busiest customers · daily-bucket cutoff` or show `not an exact rolling 24h` |
| Step 3 is a moving 5-minute query, not physical table eviction | Name it `Rolling-window shrink proof`; reserve TTL terminology for `@Statistics TTL` |
| A fixed customer is unlikely to have 5-minute events at 2k eps across 10M customers | Carry a live subject from step 1 and gate snapshot capture on recent activity |
| “Two calls per event” is conditional | Say `valid events call RecordTxn; events with merchant_id also call RecordMerchantTxn`; transactions are independent |
| Rejected inputs never invoke `RecordTxn` | Use accepted + rejected deltas as the hygiene denominator and show the equation |
| Standard loadgen never emits malformed JSON | Mark `dlq_unparseable_json` expected value as `not injected`, not 0.2% |
| Script comments say 100k customers; README and Java defaults use 10M | Show explicit commands/arguments; treat Java as runtime truth and flag the comment mismatch |
| `@Statistics LATENCY` is not proven to be feature-read-only | Label it cluster latency until live schema proves attribution |
| Supplied JSON response shape has no guaranteed server elapsed field | Show BFF/upstream round trip; server elapsed remains `—` unless proven by a source |
| DLQ payload contains no reason envelope | Label displayed reason `inferred`; counters are authoritative for rejection class |
| `F01…F38` are deterministic width fillers, not business accumulators | Keep collapsed and call them width fillers; never chart them |
| `LAST_TXN_AT` / `LAST_CITY` are overwritten on every accepted `RecordTxn`, including retries/non-TXN and accepted out-of-order events | Tooltip states `last accepted RecordTxn write`, not event-time MAX/LAST semantics |
| 50/4 Kafka partition counts are in `01_create_topic.sh`, not pipeline YAML | Trace partition labels to the script and names/group/lateness to YAML |
| README's ~1.5 KB event is asserted, not measured by loadgen | Present it as a documented sizing assumption, not live observed payload size |
| POM still describes per-customer minute buckets | Do not surface the stale POM description; architecture follows README/DDL/Java v4 |

## 14. Validation plan for Phase 2

### Unit and integration coverage

- Volt type decoding for all documented codes; top-level/per-table status failures; lossless BIGINT/DECIMAL/TIMESTAMP.
- `@Statistics TABLE` aggregation exactly matches the README awk formula, including multiple hosts/partitions and zero rows.
- Procedure delta math: first sample, elapsed time, negative reset, cluster restart, stale gaps, visibility pause.
- Tier classification at `10080` and `10081` minutes and branch-specific result adapters.
- SQL parser/classifier: quoted semicolons, comments, mixed case, multi-statement input, `exec @Statistics`, bypass attempts.
- Locked/unlocked procedure policy, permanent admin denylist, stats/catalog enum validation, path traversal, SSRF host validation, timeout, malformed response, and response-size limits.
- Strict mode swap aborts and clears all live/mock data.
- Each page in loading, first-sample, empty, ready, stale, partial, error, and mock states.
- Accessibility checks with axe plus explicit focus, keyboard, and live-region tests.

### Browser smoke and visual review

- All 11 routes load in mock mode with no console errors.
- SQL Console executes a mocked multi-result hot call and system-stat call; Procedure page handles all six reads and visibly blocks three mutators.
- Feature Explorer changes HOT/WARM exactly at the 10080-minute boundary.
- Request Inspector reveals request, response, formula, mode, and source without secrets.
- Screenshot comparison/manual review at approximately 1920×900, 1280×800, 768×1024, and 390×844.
- Visual checklist: 190 px white sidebar, 64 px header, light-gray canvas, six compact KPIs, 1 px card borders, 12 px radius, Inter scale, restrained shadows, canonical tier colors, tabular metrics, and footer status.

### Live-cluster acceptance

- `exec GetRollingFeatures 100000012345 1440` and `exec @Statistics TABLE 0` run through SQL Console when data/environment permit.
- All six read procedures execute; three mutating procedures remain locked by default.
- Sizing table reproduces the README aggregation for the same raw statistics response.
- Counters and procedure deltas update during a live load and never fall back to fixtures.
- Catalog comparison distinguishes matches, differences, and unverifiable facts.
- `npm run build` under Node 20 completes with zero TypeScript errors; runtime smoke has no console errors.

## 15. Review decisions and open questions

Items marked **recommended** have a safe default and need review mainly because they change wording or operational assumptions.

1. **Hot-window precision — recommended:** approve `exact aggregates from raw events · minute-aligned cutoff` in the UI while preserving the README statement in a source viewer with a discrepancy badge. The alternative requires changing Java or README, which is outside the UI scope.
2. **Busy-customer label — recommended:** keep query 1 verbatim but call it `Busiest customers · daily-bucket cutoff`, with `not an exact rolling 24h` in its note. The alternative is a repository query change.
3. **Step 3 naming — recommended:** use `Rolling-window shrink proof`; keep physical `TTL eviction` exclusively for the TTL statistics table.
4. **Latency KPI — recommended:** initially label it `Cluster p99 latency`; change to `Read p99` only if a VoltDB 14.0.1 sample demonstrates defensible procedure-level filtering.
5. **Procedure timing — recommended:** show BFF/upstream round trip and `@Statistics PROCEDURE` aggregates; leave per-call server elapsed as `—` unless the live response supplies an authoritative value.
6. **Deployed match semantics — recommended:** use `Verified fields match · N unverified` when TTL definitions or deployed class identity cannot be proven from catalog data. What artifact/checksum, if any, should define Java-source equality?
7. **Connection persistence:** should the editable JSON API/Kafka endpoints persist only for the BFF process, in a gitignored local settings file, or be environment-only? Recommended: environment defaults plus memory-only session overrides in Phase 2.
8. **Allowed VoltDB hosts:** which hostnames/IP ranges must the BFF accept beyond localhost? Recommended: localhost by default plus an explicit environment allowlist.
9. **VoltDB HTTP/VMC source:** `pipeline-config.yaml` contains client port 21212, not HTTP 8080. Confirm whether `http://localhost:8080` is always the demo default and whether TLS/auth must be anticipated.
10. **Mock entry point — recommended:** `npm run mock` starts mock mode; Settings may switch modes only after clearing all cached telemetry. Should production builds expose the switch, or should it be enabled by an environment flag?
11. **Kafka features:** are DLQ tail and group lag expected in the first implementation environment? They remain optional and show a designed disabled state either way.
12. **Presenter identity:** confirm the default name/initials/role or approve neutral defaults (`Demo Presenter`, `DP`, `Solutions Architect`).
13. **Local-only delivery — recommended:** the console is a localhost BFF for a local/live VoltDB demo. No hosted deployment is proposed because the BFF reads repository files and connects to local infrastructure.

## 16. Phase-1 review checklist

- [ ] Information architecture and route names are approved.
- [ ] Visual tokens and canonical tier colors are approved.
- [ ] All eleven wireframes support the intended demo narrative.
- [ ] Source-accuracy wording in section 13 is accepted.
- [ ] Data-source mappings and unknown/error behavior are accepted.
- [ ] Read-only guard and network boundaries are accepted.
- [ ] Recommended answers in section 15 are accepted or replaced.
- [ ] Phase 2 is authorized.

Implementation is intentionally paused here for Phase-1 review.
