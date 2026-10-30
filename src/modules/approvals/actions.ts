"use server";

import { requireEmployee } from "@/lib/auth";
import { withUser } from "@/lib/db/client";

// One approval rule for four request types (CLAUDE.md rule 7): the database decides who may decide.
type Kind = "leave" | "regularisation" | "wfh" | "optional_holiday";
const FN: Record<Kind, string> = {
  leave: "decide_leave", regularisation: "decide_regularisation", wfh: "decide_wfh", optional_holiday: "decide_optional_holiday",
};
const MESSAGES: Record<string, string> = {
  comment_required: "Add a short comment so the employee knows why",
  insufficient_balance: "The balance is no longer sufficient. The request stays pending; ask HR to adjust it or ask the employee to convert part to Loss of Pay.",
  forbidden: "You can't decide this request",
  not_pending: "This request was already decided",
  not_found: "This request no longer exists",
};

export async function decideRequest(i: { kind: Kind; id: string; decision: "approve" | "reject"; comment: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireEmployee();
  const fn = FN[i.kind];
  if (!fn) return { ok: false, error: "Unknown request type" };
  try {
    await withUser({ sub: me.sub }, [{ text: `select public.${fn}($1::uuid, $2::text, $3::text)`, values: [i.id, i.decision, i.comment.trim() || null] }]);
    return { ok: true };
  } catch (e) {
    const code = (e as Error).message.trim();
    return { ok: false, error: MESSAGES[code] ?? "Could not record the decision" };
  }
}
