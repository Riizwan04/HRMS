import clsx from "clsx";
import { Ban, CheckCircle2, Hourglass, XCircle } from "lucide-react";

/** Request status (pending/approved/rejected/cancelled). Deliberately NOT the day-status colours. */
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

const CFG = {
  pending: { label: "Pending", cls: "border border-dashed border-input bg-surface text-text", Icon: Hourglass },
  approved: { label: "Approved", cls: "bg-st-present-bg text-st-present", Icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "bg-st-absent-bg text-st-absent", Icon: XCircle },
  cancelled: { label: "Cancelled", cls: "bg-st-off-bg text-st-off", Icon: Ban },
} as const;

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const { label, cls, Icon } = CFG[status];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", cls)}>
      <Icon className="size-3.5" aria-hidden /> {label}
    </span>
  );
}
