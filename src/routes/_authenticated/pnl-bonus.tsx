import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/pnl-bonus")({
  head: () => ({ meta: [{ title: "Bonus Calculator — NiNi KPI" }] }),
  component: BonusPage,
});

type Role = "store_manager" | "assistant_manager";

const ROLE_PCT: Record<Role, number> = {
  store_manager: 0.15,
  assistant_manager: 0.075,
};

// Quarter hours (40 hrs/week * 13 weeks)
const QUARTER_HOURS = 40 * 13;

// Payout table: sales-target % -> payout %
const PAYOUT_TABLE: Array<{ threshold: number; payout: number; label: string }> = [
  { threshold: 0, payout: 0, label: "< 95%" },
  { threshold: 95, payout: 0, label: "95%" },
  { threshold: 96, payout: 50, label: "96%" },
  { threshold: 97, payout: 60, label: "97%" },
  { threshold: 98, payout: 70, label: "98%" },
  { threshold: 99, payout: 80, label: "99%" },
  { threshold: 100, payout: 100, label: "100%" },
  { threshold: 105, payout: 130, label: "105%" },
  { threshold: 110, payout: 150, label: "110%" },
  { threshold: 130, payout: 170, label: "130%" },
];

function payoutPctFor(salesTargetPct: number): number {
  let payout = 0;
  for (const row of PAYOUT_TABLE) {
    if (salesTargetPct >= row.threshold) payout = row.payout;
  }
  return payout;
}

const parseNum = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function BonusPage() {
  const [hourlyRate, setHourlyRate] = useState("");
  const [role, setRole] = useState<Role>("store_manager");
  const [quarterTarget, setQuarterTarget] = useState("");
  const [actualSales, setActualSales] = useState("");
  const [payrollMet, setPayrollMet] = useState(true);
  const [foodMet, setFoodMet] = useState(true);

  const calc = useMemo(() => {
    const rate = parseNum(hourlyRate);
    const target = parseNum(quarterTarget);
    const actual = parseNum(actualSales);

    const quarterlyEarning = rate * QUARTER_HOURS;
    const baseBonus = quarterlyEarning * ROLE_PCT[role];
    const salesTargetPct = target > 0 ? (actual / target) * 100 : 0;
    const payoutPct = payoutPctFor(salesTargetPct);
    let bonus = baseBonus * (payoutPct / 100);
    if (!payrollMet || !foodMet) bonus = bonus * 0.4;

    return { quarterlyEarning, baseBonus, salesTargetPct, payoutPct, bonus };
  }, [hourlyRate, role, quarterTarget, actualSales, payrollMet, foodMet]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Bonus Calculator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Store manager bonus: 15% of QTR earning (hourly rate × {QUARTER_HOURS} hrs) at 100% sales target, scaled by
          payout table. Assistant manager: 7.5%. If payroll or food cost targets are missed, bonus is reduced to 40%.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Hourly Rate</Label>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Quarterly earning: {money(calc.quarterlyEarning)} ({QUARTER_HOURS} hrs)
            </p>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="store_manager">Store Manager (15%)</SelectItem>
                <SelectItem value="assistant_manager">Assistant Manager (7.5%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quarter Sales Target</Label>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={quarterTarget}
              onChange={(e) => setQuarterTarget(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Actual Quarter Sales</Label>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={actualSales}
              onChange={(e) => setActualSales(e.target.value)}
            />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={payrollMet} onCheckedChange={(v) => setPayrollMet(!!v)} />
              Payroll % target met
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={foodMet} onCheckedChange={(v) => setFoodMet(!!v)} />
              Food cost % target met
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <Row label="Sales Target %" value={`${calc.salesTargetPct.toFixed(1)}%`} />
          <Row label="Payout % of Target" value={`${calc.payoutPct}%`} />
          <Row label={`Base bonus (at 100%, ${role === "store_manager" ? "15%" : "7.5%"} of QTR earning)`} value={money(calc.baseBonus)} />
          {(!payrollMet || !foodMet) && (
            <p className="text-xs text-muted-foreground">Targets missed — bonus reduced to 40%.</p>
          )}
          <div className="flex items-center justify-between border-t pt-3">
            <span className="font-semibold">Bonus payout</span>
            <span className="text-2xl font-bold text-primary">{money(calc.bonus)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-y-1 text-sm max-w-md">
            <div className="font-medium">Sales Target %</div>
            <div className="font-medium">Payout %</div>
            {PAYOUT_TABLE.map((r) => (
              <RowPair key={r.label} a={r.label} b={`${r.payout}%`} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function RowPair({ a, b }: { a: string; b: string }) {
  return (
    <>
      <div>{a}</div>
      <div>{b}</div>
    </>
  );
}
