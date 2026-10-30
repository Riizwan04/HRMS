"use server";

import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";
import type { LeavePlan, PlanError } from "@/lib/leave-plan";

// Writes. The actor always comes from the verified session (never a parameter) and the database re-checks everything.
type PlanInput = { typeId: string; from: string; to: string; half?: boolean; session?: "first" | "second" | null; convert?: boolean; hasDoc?: boolean };

export async function previewLeave(i: PlanInput): Promise<LeavePlan & { can_submit: boolean }> {
  const me = await requireEmployee();
  const [[row]] = await withUser({ sub: me.sub }, [q`select public.preview_leave(${i.typeId}::uuid, ${i.from}::date, ${i.to}::date,
      ${i.half ?? false}::boolean, ${i.session ?? null}::text, ${i.convert ?? false}::boolean, ${i.hasDoc ?? false}::boolean) as plan`]);
  return row.plan as LeavePlan & { can_submit: boolean };
}

export async function applyLeave(i: PlanInput & { reason: string; attachment: string | null }): Promise<{ ok: boolean; id?: string; errors?: PlanError[]; plan?: LeavePlan }> {
  const me = await requireEmployee();
  const [[row]] = await withUser({ sub: me.sub }, [q`select public.apply_leave(${i.typeId}::uuid, ${i.from}::date, ${i.to}::date,
      ${i.half ?? false}::boolean, ${i.session ?? null}::text, ${i.reason}::text, ${i.attachment}::text, ${i.convert ?? false}::boolean) as r`]);
  return row.r as { ok: boolean; id?: string; errors?: PlanError[]; plan?: LeavePlan };
}

export async function cancelLeave(i: { id: string }): Promise<{ ok: boolean }> {
  const me = await requireEmployee();
  const [[row]] = await withUser({ sub: me.sub }, [q`select public.cancel_leave(${i.id}::uuid) as r`]);
  return row.r as { ok: boolean };
}

export async function decideLeave(i: { id: string; decision: "approve" | "reject"; comment: string | null }): Promise<{ ok: boolean; status: string }> {
  const me = await requireEmployee();
  const [[row]] = await withUser({ sub: me.sub }, [q`select public.decide_leave(${i.id}::uuid, ${i.decision}::text, ${i.comment}::text) as r`]);
  return row.r as { ok: boolean; status: string };
}

const CERT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/** Stores a medical certificate in the private Blob store and returns its pathname. Call before applyLeave; the path is the attachment. */
export async function uploadCertificate(form: FormData): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const me = await requireEmployee();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload" };
  if (!CERT_TYPES.includes(file.type)) return { ok: false, error: "Only PDF, JPG or PNG files are accepted" };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "The file must be under 5 MB" };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, error: "File uploads are not configured yet. Ask HR to connect the storage." };
  const { put } = await import("@vercel/blob");
  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  const blob = await put(`${me.id}/${crypto.randomUUID()}/${safe}`, file, { access: "private", addRandomSuffix: false });
  return { ok: true, path: blob.pathname };
}
