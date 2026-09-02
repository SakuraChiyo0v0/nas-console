import { useEffect, useState } from "react";
import { api, type AuditRow } from "../api";

export function AuditView() {
  const [rows, setRows] = useState<AuditRow[]>([]);

  async function load() {
    const r = await api<{ entries: AuditRow[] }>("/api/audit?limit=200");
    setRows(r.entries);
  }
  useEffect(() => { void load(); }, []);

  return (
    <div className="content">
      <div className="panel">
        <h2>审计日志（命令执行记录）</h2>
        <table>
          <thead><tr><th>时间</th><th>操作者</th><th>命令</th><th>退出码</th><th>耗时</th><th>IP</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.ts}</td>
                <td>{r.actor}</td>
                <td className="audit-cmd">{r.command}</td>
                <td>{r.exit_code ?? "—"}</td>
                <td>{r.duration_ms != null ? `${r.duration_ms}ms` : "—"}</td>
                <td>{r.remote_ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}