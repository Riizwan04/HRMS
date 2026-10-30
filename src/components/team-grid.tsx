import clsx from "clsx";
import type { ReactNode } from "react";
import { isoWeekday } from "@/lib/time/ist";

export type GridCell = { cls: string; text: string; label: string; dashed?: boolean };

/** A people-by-days month grid. Every cell has a text code and an accessible label, so colour is never the only signal. */
export function TeamGrid({ days, members, cell, footer }: {
  days: string[]; members: { id: string; name: string; code: string }[]; cell: (memberId: string, day: string) => GridCell; footer?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-max min-w-full border-collapse text-xs">
        <thead>
          <tr className="bg-bg">
            <th scope="col" className="sticky left-0 z-[1] min-w-40 bg-bg px-3 py-2 text-left font-semibold">Employee</th>
            {days.map((d) => (
              <th key={d} scope="col" className={clsx("w-8 min-w-8 px-0.5 py-2 text-center font-medium", isoWeekday(d) >= 6 && "text-muted")}>
                {Number(d.slice(8))}<br /><span className="font-normal text-muted">{["M", "T", "W", "T", "F", "S", "S"][isoWeekday(d) - 1]}</span>
              </th>))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {members.map((m) => (
            <tr key={m.id}>
              <th scope="row" className="sticky left-0 z-[1] bg-surface px-3 py-1.5 text-left font-medium">{m.name}<br /><span className="font-normal text-muted">{m.code}</span></th>
              {days.map((d) => {
                const c = cell(m.id, d);
                return <td key={d} className="p-0.5 text-center"><span role="img" aria-label={`${m.name}, ${d}: ${c.label}`}
                  className={clsx("flex h-7 w-7 items-center justify-center rounded text-[11px] font-semibold", c.cls, c.dashed && "border border-dashed border-current")}>{c.text}</span></td>;
              })}
            </tr>))}
        </tbody>
        {footer}
      </table>
    </div>
  );
}
