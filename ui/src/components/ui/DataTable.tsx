import type { CSSProperties, ReactNode } from "react";
import { isNumericType, T, type VoltCell, type VoltTable } from "@/lib/volt";
import { fmtDecimal, fmtInt, fmtIso } from "@/lib/format";

export type Column<Row> = { key: string; header: ReactNode; type?: string; align?: "left" | "right"; width?: string; render?: (row: Row, index: number) => ReactNode; className?: string };

export function DataTable<Row>({ columns, rows, rowKey, onRowClick, selectedKey, fixed = true, empty = "No rows returned", maxHeight, style }: {
  columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row, i: number) => string; onRowClick?: (row: Row) => void; selectedKey?: string; fixed?: boolean; empty?: ReactNode; maxHeight?: number; style?: CSSProperties;
}) {
  return (
    <div className="table-scroll" style={{ maxHeight, overflowY: maxHeight ? "auto" : undefined, ...style }}>
      <table className={`data-table ${fixed ? "fixed" : ""}`}>
        {fixed && columns.some((c) => c.width) && <colgroup>{columns.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}</colgroup>}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.align === "right" ? "num" : ""}>{c.header}{c.type && <span className="th-type">{c.type}</span>}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="table-empty" style={{ whiteSpace: "normal" }}>{empty}</td></tr>}
          {rows.map((row, i) => {
            const k = rowKey(row, i);
            return (
              <tr key={k} className={`${onRowClick ? "clickable" : ""} ${selectedKey === k ? "selected" : ""}`} onClick={onRowClick ? () => onRowClick(row) : undefined} tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(row); } : undefined}>
                {columns.map((c) => <td key={c.key} className={`${c.align === "right" ? "num" : ""} ${c.className ?? ""}`}>{c.render ? c.render(row, i) : String((row as Record<string, unknown>)[c.key] ?? "")}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function formatCell(v: VoltCell, typeCode: number): ReactNode {
  if (v == null) return <span className="cell-null" title="NULL">—</span>;
  if (typeCode === T.TIMESTAMP) { const iso = fmtIso(v); return <span className="cell-mono" title={`raw µs ${v}`}>{iso.replace("T", " ").replace("Z", "")}</span>; }
  if (typeCode === T.DECIMAL) return <span className="cell-mono" title={String(v)}>{fmtDecimal(v)}</span>;
  if (isNumericType(typeCode)) return <span className="cell-mono">{typeof v === "number" ? fmtInt(v) : v}</span>;
  return <span className="cell-mono">{String(v)}</span>;
}

/** Renders a VoltTable schema-first: field name + Volt type in the header, typed formatting in cells. */
export function VoltTableView({ table, maxRows = 200, maxHeight, showTypes = true }: { table: VoltTable; maxRows?: number; maxHeight?: number; showTypes?: boolean }) {
  const rows = table.rows.slice(0, maxRows);
  return (
    <div className="table-scroll" style={{ maxHeight, overflowY: maxHeight ? "auto" : undefined }}>
      <table className="data-table">
        <thead><tr>{table.columns.map((c) => <th key={c.name} scope="col" className={isNumericType(c.typeCode) ? "num" : ""}>{c.name}{showTypes && <span className="th-type">{c.typeName}</span>}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={table.columns.length} className="table-empty">No rows returned · schema preserved</td></tr>}
          {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={isNumericType(table.columns[j].typeCode) ? "num" : ""} style={{ maxWidth: 380 }}>{formatCell(v, table.columns[j].typeCode)}</td>)}</tr>)}
        </tbody>
      </table>
      {table.rows.length > maxRows && <div className="table-empty" style={{ padding: 8 }}>Showing {maxRows} of {fmtInt(table.rows.length)} rows · export for the full set</div>}
    </div>
  );
}
