import { useEffect, useState } from "react";
import { api, type Me } from "./api";
import { LoginView } from "./views/Login";
import { TerminalView } from "./views/TerminalView";
import { TokensView } from "./views/TokensView";
import { AuditView } from "./views/AuditView";

type View = "terminal" | "tokens" | "audit";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("terminal");

  useEffect(() => {
    api<Me>("/api/me")
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    try { await api("/api/logout", { method: "POST" }); } catch { /* ignore */ }
    setMe(null);
    setView("terminal");
  }

  if (loading) return <div className="login-wrap">加载中…</div>;
  if (!me || me.kind !== "user") {
    return <LoginView onLogin={(username) => setMe({ kind: "user", username })} />;
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <span className="brand">NAS Console</span>
        <nav>
          <button className={view === "terminal" ? "active" : ""} onClick={() => setView("terminal")}>终端</button>
          <button className={view === "tokens" ? "active" : ""} onClick={() => setView("tokens")}>API Token</button>
          <button className={view === "audit" ? "active" : ""} onClick={() => setView("audit")}>审计日志</button>
        </nav>
        <span className="who">{me.username}</span>
        <button className="logout" onClick={logout}>登出</button>
      </div>
      {view === "terminal" && <TerminalView />}
      {view === "tokens" && <TokensView />}
      {view === "audit" && <AuditView />}
    </div>
  );
}