import type { Sample, HygieneEvent } from "@/data/telemetry";
import { fmtInt } from "@/lib/format";
import { Dot } from "@/components/ui/primitives";

export function PipelineMiniMap({ latest, events, hasRates, dim }: { latest?: Sample; events: HygieneEvent[]; hasRates: boolean; dim?: (k: "kafka" | "voltsp" | "hot" | "warm" | "merchant" | "hygiene") => boolean }) {
  const recent = events.filter((e) => e.t > Date.now() - 10_000).reduce((a, e) => a + e.delta, 0);
  const rate = (n?: number) => (hasRates && n != null ? `${fmtInt(n)}/s` : "—");
  const op = (k: Parameters<NonNullable<typeof dim>>[0]) => ({ opacity: dim?.(k) ? .35 : 1 });
  return (
    <div className="pipeline">
      <div className="pipeline-flow">
        <div className="pipeline-node" style={op("kafka")}><strong>Kafka</strong><span>novapay-txn-events</span></div>
        <div className="flow-arrow"><span className="flow-rate" title="Kafka→VoltSP rate is unavailable without optional Kafka telemetry; shown as accepted + rejected">{hasRates && latest ? `${fmtInt(latest.ingest + latest.rejected)}/s` : "—"}</span>→</div>
        <div className="pipeline-node" style={op("voltsp")}><strong>VoltSP</strong><span>parse · validate · lateness</span></div>
        <div className="flow-arrow"><span className="flow-rate">{rate(latest?.ingest)}</span>→</div>
        <div className="pipeline-node"><strong>VoltDB</strong><span>two subject tiers</span><div className="tier-mini"><div style={{ color: "var(--accent)", background: "var(--accent-soft)", ...op("hot") }}>HOT</div><div style={{ color: "var(--purple)", background: "var(--purple-soft)", ...op("warm") }}>WARM</div><div style={{ color: "var(--orange)", background: "var(--orange-soft)", ...op("merchant") }}>MERCHANT</div></div></div>
      </div>
      <div className="dlq-edge" style={op("hygiene")}><Dot color="red" /> {recent > 0 ? `${recent} rejected in the last 10 s → DLQ` : "No rejections in the last 10 s"}</div>
      <div className="legend" style={{ justifyContent: "center", marginTop: 16 }}><span className="legend-item"><Dot color="green" /> flowing</span><span className="legend-item"><Dot color="amber" /> idle</span><span className="legend-item"><Dot color="red" /> error</span></div>
    </div>
  );
}
