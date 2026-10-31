"use server";

import { google } from "@ai-sdk/google";
import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";
import { planErrorMessage, type PlanError } from "@/lib/leave-plan";
import { runAgent, type AgentReply, type ChatMessage } from "./run";

// Server actions behind the "Ask HR" panel. The signed-in user comes from the session; the model never sees credentials.

export async function askAgent(i: { messages: ChatMessage[]; conversationId?: string }): Promise<AgentReply | { error: string }> {
  const me = await requireEmployee();
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return { error: "The assistant isn't switched on yet. Please ask HR to add the AI key." };
  if (!Array.isArray(i.messages) || i.messages.length === 0 || i.messages[i.messages.length - 1].role !== "user") return { error: "Please type a question." };
  // Try the configured model first, then newer and older Gemini models: a retired or unavailable model (404) or an exhausted quota (429)
  // moves on to the next one, so the assistant keeps working without anyone editing settings. Auth errors stop at once.
  const candidates = [...new Set([process.env.AGENT_MODEL, "gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-2.0-flash"].filter((m): m is string => Boolean(m)))];
  let reply: AgentReply | null = null;
  for (const id of candidates) {
    reply = await runAgent({ me, messages: i.messages, conversationId: reply?.conversationId ?? i.conversationId, model: google(id) });
    if (!reply.failure || (reply.failure.kind !== "model_unavailable" && reply.failure.kind !== "quota")) return reply;
  }
  return reply!;
}

const DRAFT_ERRORS: Record<string, string> = {
  draft_expired: "This draft expired. Ask the assistant again.",
  draft_open: "This draft was already used.",
  draft_not_open: "This draft was already used.",
  not_found: "This draft no longer exists.",
  forbidden: "You can't confirm this draft.",
};

/** The human Confirm button: the only way a draft becomes a real request. */
export async function confirmDraft(i: { id: string }): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const me = await requireEmployee();
  try {
    const [[row]] = await withUser({ sub: me.sub }, [q`select public.confirm_draft(${i.id}::uuid) as r`]);
    const r = row.r as { ok?: boolean; errors?: PlanError[] };
    if (r.ok === false) return { ok: false, error: r.errors?.map((e) => planErrorMessage(e)).join(". ") || "Could not submit" };
    return { ok: true, message: "Done. Your manager will see the request in Approvals." };
  } catch (e) {
    return { ok: false, error: DRAFT_ERRORS[(e as Error).message.trim()] ?? "Could not confirm this draft." };
  }
}

export async function discardDraft(i: { id: string }): Promise<{ ok: true }> {
  const me = await requireEmployee();
  await withUser({ sub: me.sub }, [q`select public.discard_draft(${i.id}::uuid)`]);
  return { ok: true };
}
