"use client";

import { Clock, Home } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

// Preview only: simulates the check-in button with a fixed sample time (the real one calls check_in()/check_out()).
export function CheckInCard({ inTime }: { inTime: string }) {
  const [state, setState] = useState<"not_in" | "in" | "out">("not_in");
  return (
    <Card className="min-w-0">
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Today</h2>
          {state === "not_in" && <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-muted">Not checked in</span>}
          {state !== "not_in" && <StatusBadge status="present" />}
        </div>
        {state !== "not_in" && (
          <p className="flex items-center gap-1.5 text-sm text-muted"><Clock className="size-4" aria-hidden /> Checked in {inTime}</p>
        )}
        {state === "out" && <p className="text-sm text-muted">Worked 8 h 02 m</p>}
        {state === "not_in" && <Button size="lg" onClick={() => setState("in")}>Check in</Button>}
        {state === "in" && <Button size="lg" variant="secondary" onClick={() => setState("out")}>Check out</Button>}
        {state === "out" && <p className="text-sm font-medium text-success">Done for today. See you tomorrow.</p>}
        <button type="button" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary">
          <Home className="size-4" aria-hidden /> Request WFH today
        </button>
      </CardBody>
    </Card>
  );
}
