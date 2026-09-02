import { useEffect, useState } from "react";
import { api, type TokenRow } from "../api";

export function TokensView() {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const [full, setFull] = useState<{ id: number; token: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const r = await api<{ tokens: TokenRow[] }>("/api/tokens");
    setRows(r.tokens);
  }
  useEffect(() => { void load(); }, []);

  async function create() {
    setMsg(null); setCreated(null);
    try {
      const r = await api<{ name: string; token: string }>("/api/tokens", { method: "POST", body: JSON.stringify({ name: name || "default" }) });
      setCreated(r);
      setName("");
      await load();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "创建失败" }); }
  }

  async function showFull(id: number) {
    try {
      const r = await api<{ id: number; token: string }>(`/api/tokens/${id}`);
      setFull(r);
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "查询失败" }); }
  }

  async function revoke(id: number) {
    if (!confirm("确认吊销该 Token？此操作不可撤销。")) return;
    try {
      await api(`/api/tokens/${id}`, { method: "DELETE" });
      setMsg({ ok: true, text: "已吊销" });
      await load();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "吊销失败" }); }
  }

  return (
    <div className="content">
      <div className="panel">
        <h2>生成 API Token</h2>
        <p style={{ color: "#8b949e", fontSize: 13, margin: "0 0 12px" }}>
          给 AI / 程序用的长期密钥。完整值只在生成和详情里可见；请妥善保存。
        </p>
        <div className="token-create">
          <input placeholder="名称（如 codex / ci）" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" onClick={create}>生成</button>
        </div>
        {created && (
          <div>
            <div className="msg ok">已生成 <b>{created.name}</b>：请立即复制保存</div>
            <div className="full-token">{created.token}</div>
          </div>
        )}
        {msg && <div className={`msg ${msg.ok ? "ok" : "bad"}`}>{msg.text}</div>}
        {full && (
          <div>
            <div className="msg ok">Token #{full.id} 完整值：</div>
            <div className="full-token">{full.token}</div>
            <button className="btn ghost" onClick={() => setFull(null)}>关闭</button>
          </div>
        )}
      </div>
      <div className="panel">
        <h2>Token 列表</h2>
        <table>
          <thead><tr><th>ID</th><th>名称</th><th>Token</th><th>创建时间</th><th>最近使用</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>{t.name}</td>
                <td className="mono">{t.masked}</td>
                <td>{t.createdAt}</td>
                <td>{t.lastUsedAt ?? "—"}</td>
                <td>{t.revoked ? <span className="badge off">已吊销</span> : <span className="badge on">启用</span>}</td>
                <td>
                  {!t.revoked && (
                    <>
                      <button className="btn ghost" style={{ marginRight: 6 }} onClick={() => showFull(t.id)}>查看</button>
                      <button className="btn danger" onClick={() => revoke(t.id)}>吊销</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}