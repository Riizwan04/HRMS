import { Card } from "@/components/ui/card";

export function BalanceCard({ code, name, available, pending, note }: {
  code: string; name: string; available: number; pending: number; note?: string;
}) {
  return (
    <Card className="min-w-36 flex-1 p-4 sm:min-w-0">
      <p className="text-sm text-muted">{name} <span className="font-semibold text-text">({code})</span></p>
      <p className="mt-1 text-3xl font-semibold">{available.toFixed(code === "EL" ? 2 : 1)}</p>
      <p className="text-sm text-muted">available</p>
      <p className="mt-2 text-xs text-muted">{note ?? `Pending ${pending.toFixed(1)}`}</p>
    </Card>
  );
}
