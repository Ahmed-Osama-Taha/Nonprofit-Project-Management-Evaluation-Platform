"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

/** Reviewer assistant: ask grounded (RAG) questions about a project. */
export function ChatBox({ projectId }: { projectId: string }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function ask() {
    if (!q.trim()) return;
    setBusy(true);
    setErr("");
    setAnswer("");
    try {
      const res = await api.chat(projectId, q, lang);
      setAnswer(res.answer);
      setSources(res.sources);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">
        <h3 style={{ margin: 0 }}>{t("ai.ask")}</h3>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="flex">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("ai.askPlaceholder")}
          onKeyDown={(e) => e.key === "Enter" && ask()}
        />
        <button className="btn" onClick={ask} disabled={busy}>
          {busy ? "…" : t("ai.ask")}
        </button>
      </div>
      {answer && (
        <div style={{ marginTop: 12 }}>
          <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>
          {sources.length > 0 && (
            <details>
              <summary className="small muted">{sources.length}</summary>
              {sources.map((s, i) => (
                <p
                  key={i}
                  className="small muted"
                  style={{
                    borderInlineStart: "3px solid var(--border)",
                    paddingInlineStart: 8,
                  }}
                >
                  {s.slice(0, 300)}…
                </p>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
