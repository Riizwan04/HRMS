"use client";

import { Bot, CheckCircle2, Send, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { askAgent, confirmDraft, discardDraft } from "@/modules/agent/actions";

type Call = { tool: string; outcome: string };
type Draft = { id: string; kind: string; summary: string };
type Msg = { role: "user" | "assistant"; content: string; calls?: Call[]; drafts?: Draft[] };

const SUGGESTIONS = ["Kitni CL bachi hai?", "How many days is Friday to Monday?", "Kal ki chutti chahiye", "What is the late mark rule?"];
const TOOL_LABEL: Record<string, string> = {
  get_my_leave_balance: "Checked your leave balance", get_holidays: "Looked up holidays", count_working_days: "Counted working days",
  explain_policy: "Read the policy", draft_leave_request: "Prepared a leave draft", get_team_today: "Checked your team today",
  summarise_pending_approvals: "Listed pending approvals", month_end_check: "Ran the month-end check",
};

/** Chat panel for the HR assistant: answers, the tools it called under each answer, and Confirm buttons for drafts. */
export function AskHrPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [conv, setConv] = useState<string | undefined>();
  const [busy, start] = useTransition();
  const [draftState, setDraftState] = useState<Record<string, string>>({});
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  if (!open) return null;

  const send = (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next); setText("");
    start(async () => {
      const r = await askAgent({ messages: next.map((m) => ({ role: m.role, content: m.content })), conversationId: conv });
      if ("error" in r) { setMsgs([...next, { role: "assistant", content: r.error }]); return; }
      setConv(r.conversationId);
      setMsgs([...next, { role: "assistant", content: r.answer, calls: r.calls, drafts: r.drafts }]);
    });
  };
  const confirm = (d: Draft) => start(async () => {
    const r = await confirmDraft({ id: d.id });
    setDraftState((s) => ({ ...s, [d.id]: r.ok ? `✓ ${r.message}` : r.error }));
  });
  const discard = (d: Draft) => start(async () => { await discardDraft({ id: d.id }); setDraftState((s) => ({ ...s, [d.id]: "Discarded." })); });

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 lg:items-stretch lg:justify-end" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Ask HR assistant" onClick={(e) => e.stopPropagation()}
        className="flex h-[90vh] w-full flex-col rounded-t-2xl border border-border bg-bg shadow-xl lg:h-full lg:w-[28rem] lg:rounded-none">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Bot className="size-5 text-primary" aria-hidden /> Ask HR</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-surface-2"><X className="size-5" aria-hidden /></button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {msgs.length === 0 && (
            <div className="text-sm text-muted">
              <p className="mb-3">Ask about your leave, holidays or policy. I look things up in the system, and I only prepare drafts — you press Confirm.</p>
              <div className="flex flex-wrap gap-2">{SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-input px-3 py-1.5 text-sm text-text hover:bg-surface-2">{s}</button>))}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-8 rounded-lg bg-primary p-3 text-sm text-on-primary" : "mr-4 rounded-lg border border-border bg-surface p-3 text-sm"}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.calls && m.calls.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs text-muted" aria-label="Tools used">
                  {m.calls.map((c, k) => <li key={k} className="flex items-center gap-1.5"><Wrench className="size-3" aria-hidden /> {TOOL_LABEL[c.tool] ?? c.tool}{c.outcome !== "ok" ? ` (${c.outcome.replace("_", " ")})` : ""}</li>)}
                </ul>
              )}
              {m.drafts?.map((d) => (
                <div key={d.id} className="mt-3 rounded-lg border border-primary p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Draft, not submitted</p>
                  <p className="mt-1 font-medium">{d.summary}</p>
                  {draftState[d.id] ? <p role="status" className="mt-2 flex items-start gap-1.5 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {draftState[d.id]}</p> : (
                    <div className="mt-2 flex gap-2"><Button size="sm" disabled={busy} onClick={() => confirm(d)}>Confirm</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => discard(d)}>Discard</Button></div>
                  )}
                </div>
              ))}
            </div>
          ))}
          {busy && <p className="text-sm text-muted">Thinking…</p>}
          <div ref={end} />
        </div>

        <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <label htmlFor="ask-input" className="sr-only">Your question</label>
          <input id="ask-input" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-surface px-3 text-sm" value={text} maxLength={500}
            placeholder="Ask about leave, holidays, policy…" onChange={(e) => setText(e.target.value)} />
          <Button type="submit" disabled={busy || text.trim() === ""} aria-label="Send"><Send className="size-4" aria-hidden /></Button>
        </form>
      </section>
    </div>
  );
}
