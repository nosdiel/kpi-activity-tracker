import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  periodWeekRange,
  periodForWeek,
  quarterForPeriod,
  weekDates,
  currentFiscalWeek,
} from "@/lib/fiscal";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function dayNameFromISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return DAY_NAMES[d.getUTCDay()];
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({ meta: [{ title: "Daily Sales — NiNi KPI" }] }),
  component: DashboardPage,
});

type Location = { id: string; name: string };
type FY = { fiscal_year: number; start_date: string };
type DailySale = {
  business_date: string;
  actual_sales: number | null;
  actual_customer_count: number | null;
  last_year_sales: number | null;
  last_year_customer_count: number | null;
  dessert_count: number | null;
};
type Target = {
  fiscal_year: number;
  fiscal_week: number;
  target_pct_over_ly: number | null;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("en-US");
const num0 = (n: number | null | undefined) => num(Number(n ?? 0));

function DashboardPage() {
  const [locationId, setLocationId] = useState<string>("");
  const [fy, setFy] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);

  const locationsQ = useQuery({
    queryKey: ["locations-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Location[];
    },
  });

  const fyQ = useQuery({
    queryKey: ["fiscal-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_year_settings")
        .select("fiscal_year,start_date")
        .order("fiscal_year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FY[];
    },
  });

  // Default selections
  useEffect(() => {
    if (!locationId && locationsQ.data?.[0]) setLocationId(locationsQ.data[0].id);
  }, [locationsQ.data, locationId]);

  useEffect(() => {
    if (fy === null && fyQ.data && fyQ.data.length > 0) {
      const latest = fyQ.data[0];
      setFy(latest.fiscal_year);
      setWeek(currentFiscalWeek(latest.start_date));
    }
  }, [fyQ.data, fy]);

  const fyRow = useMemo(
    () => fyQ.data?.find((r) => r.fiscal_year === fy) ?? null,
    [fyQ.data, fy],
  );

  const period = week ? periodForWeek(week) : 1;
  const quarter = quarterForPeriod(period);
  const periodRange = periodWeekRange(period);

  const dates = useMemo(
    () => (fyRow && week ? weekDates(fyRow.start_date, week) : []),
    [fyRow, week],
  );

  // Same physical week last year = each date minus 364 days (preserves weekday).
  const lyDates = useMemo(
    () =>
      dates.map((d) => {
        const dt = new Date(`${d}T00:00:00Z`);
        dt.setUTCDate(dt.getUTCDate() - 364);
        return dt.toISOString().slice(0, 10);
      }),
    [dates],
  );

  const monthStart = dates[0]?.slice(0, 7);

  const salesQ = useQuery({
    queryKey: ["dashboard-sales", locationId, dates[0], dates[6]],
    enabled: !!locationId && dates.length === 7,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_sales")
        .select("business_date,actual_sales,actual_customer_count,last_year_sales,last_year_customer_count,dessert_count")
        .eq("location_id", locationId)
        .gte("business_date", dates[0])
        .lte("business_date", dates[6]);
      if (error) throw error;
      return (data ?? []) as DailySale[];
    },
  });

  const lySalesQ = useQuery({
    queryKey: ["dashboard-ly-sales", locationId, lyDates[0], lyDates[6]],
    enabled: !!locationId && lyDates.length === 7,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_sales")
        .select("business_date,actual_sales,actual_customer_count")
        .eq("location_id", locationId)
        .gte("business_date", lyDates[0])
        .lte("business_date", lyDates[6]);
      if (error) throw error;
      return (data ?? []) as { business_date: string; actual_sales: number | null; actual_customer_count: number | null }[];
    },
  });

  const monthDessertQ = useQuery({
    queryKey: ["dashboard-dessert-month", locationId, monthStart],
    enabled: !!locationId && !!monthStart,
    queryFn: async () => {
      const start = `${monthStart}-01`;
      const endDate = new Date(`${start}T00:00:00Z`);
      endDate.setUTCMonth(endDate.getUTCMonth() + 1);
      const end = endDate.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("daily_sales")
        .select("business_date,dessert_count")
        .eq("location_id", locationId)
        .gte("business_date", start)
        .lt("business_date", end);
      if (error) throw error;
      return (data ?? []) as { business_date: string; dessert_count: number | null }[];
    },
  });

  const targetQ = useQuery({
    queryKey: ["dashboard-target", locationId, fy, week],
    enabled: !!locationId && !!fy && !!week,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_targets")
        .select("fiscal_year,fiscal_week,target_pct_over_ly")
        .eq("location_id", locationId)
        .eq("fiscal_year", fy)
        .eq("fiscal_week", week)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Target | null;
    },
  });

  const targetPct = Number(targetQ.data?.target_pct_over_ly ?? 0) / 100;

  const byDate = useMemo(() => {
    const m = new Map<string, DailySale>();
    (salesQ.data ?? []).forEach((r) => m.set(r.business_date, r));
    return m;
  }, [salesQ.data]);

  const lyByDate = useMemo(() => {
    const m = new Map<string, { actual_sales: number | null; actual_customer_count: number | null }>();
    (lySalesQ.data ?? []).forEach((r) =>
      m.set(r.business_date, { actual_sales: r.actual_sales, actual_customer_count: r.actual_customer_count }),
    );
    return m;
  }, [lySalesQ.data]);

  // Dessert running total within month, up to each date
  const dessertCumulative = useMemo(() => {
    const m = new Map<string, number>();
    const sorted = (monthDessertQ.data ?? []).slice().sort((a, b) => a.business_date.localeCompare(b.business_date));
    let acc = 0;
    for (const r of sorted) {
      acc += Number(r.dessert_count ?? 0);
      m.set(r.business_date, acc);
    }
    return m;
  }, [monthDessertQ.data]);

  const rows = dates.map((d, i) => {
    const s = byDate.get(d);
    const lyRow = lyByDate.get(lyDates[i]);
    // Prefer actual sales from same weekday last year; fall back to stored last_year_sales.
    const ly = Number(lyRow?.actual_sales ?? s?.last_year_sales ?? 0);
    const lyCust = Number(lyRow?.actual_customer_count ?? s?.last_year_customer_count ?? 0);
    const actual = Number(s?.actual_sales ?? 0);
    const cust = Number(s?.actual_customer_count ?? 0);
    const target = ly * (1 + targetPct);
    const varSales = actual - target;
    const varCust = cust - lyCust;
    const lyAvg = lyCust > 0 ? ly / lyCust : 0;
    const actAvg = cust > 0 ? actual / cust : 0;
    const dessertMonth = dessertCumulative.get(d) ?? 0;
    const hasActual = s && (s.actual_sales !== null || s.actual_customer_count !== null);
    return { date: d, day: DAY_NAMES[i], ly, lyCust, actual, cust, target, varSales, varCust, lyAvg, actAvg, dessertMonth, hasActual };
  });


  const totals = rows.reduce(
    (a, r) => {
      a.ly += r.ly; a.lyCust += r.lyCust; a.actual += r.actual; a.cust += r.cust;
      a.target += r.target; a.varSales += r.varSales; a.varCust += r.varCust;
      a.dessertMonth = r.dessertMonth || a.dessertMonth;
      return a;
    },
    { ly: 0, lyCust: 0, actual: 0, cust: 0, target: 0, varSales: 0, varCust: 0, dessertMonth: 0 },
  );
  const lyAvgTotal = totals.lyCust > 0 ? totals.ly / totals.lyCust : 0;
  const actAvgTotal = totals.cust > 0 ? totals.actual / totals.cust : 0;
  const avgVariance = actAvgTotal - lyAvgTotal;

  const locName = locationsQ.data?.find((l) => l.id === locationId)?.name ?? "—";

  const varClass = (v: number) =>
    v > 0 ? "text-emerald-500" : v < 0 ? "text-red-500" : "text-muted-foreground";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Sales Activity</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locName} · FY{fy ?? "—"} · Period {period} · Week {week ?? "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { salesQ.refetch(); lySalesQ.refetch(); targetQ.refetch(); monthDessertQ.refetch(); }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      <Card data-print-filters>
        <CardContent className="pt-6 grid gap-4 md:grid-cols-4">
          <Field label="Location">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue placeholder="Pick location" /></SelectTrigger>
              <SelectContent>
                {(locationsQ.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fiscal Year">
            <Select value={fy?.toString() ?? ""} onValueChange={(v) => setFy(Number(v))}>
              <SelectTrigger><SelectValue placeholder="FY" /></SelectTrigger>
              <SelectContent>
                {(fyQ.data ?? []).map((y) => (
                  <SelectItem key={y.fiscal_year} value={String(y.fiscal_year)}>FY {y.fiscal_year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fiscal Period">
            <Select value={String(period)} onValueChange={(v) => {
              const p = Number(v);
              setWeek(periodWeekRange(p).start);
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 13 }, (_, i) => i + 1).map((p) => {
                  const r = periodWeekRange(p);
                  return (
                    <SelectItem key={p} value={String(p)}>
                      P{p} (Q{quarterForPeriod(p)}, wk {r.start}–{r.end})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fiscal Week">
            <Select value={week?.toString() ?? ""} onValueChange={(v) => setWeek(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: periodRange.end - periodRange.start + 1 }, (_, i) => periodRange.start + i).map((w) => {
                  const wd = fyRow ? weekDates(fyRow.start_date, w) : [];
                  const fmt = (iso: string) => {
                    const d = new Date(`${iso}T00:00:00Z`);
                    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
                  };
                  const range = wd.length === 7 ? ` (${fmt(wd[0])}–${fmt(wd[6])})` : "";
                  return <SelectItem key={w} value={String(w)}>Week {w}{range}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card className="overflow-hidden print-report-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm report-table">
            <thead className="report-thead">
              <tr>
                <Th>Days</Th>
                <Th right>LY Sales</Th>
                <Th right>Target</Th>
                <Th right>Actual Sales</Th>
                <Th right>Var Sales</Th>
                <Th right>LY Avg</Th>
                <Th right>Actual Avg</Th>
                <Th right>LY Cust</Th>
                <Th right>Actual Cust</Th>
                <Th right>Var Cust</Th>
                <Th right>Dessert Month</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.date} className={idx % 2 === 0 ? "report-row-odd" : "report-row-even"}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.day}</div>
                    <div className="text-xs text-muted-foreground">{r.date}</div>
                  </td>
                  <Td right>{money(r.ly)}</Td>
                  <Td right>{money(r.target)}</Td>
                  <Td right>{r.hasActual ? money(r.actual) : "—"}</Td>
                  <Td right className={r.hasActual ? varClass(r.varSales) : "text-muted-foreground"}>
                    {r.hasActual ? money(r.varSales) : "—"}
                  </Td>
                  <Td right>{money(r.lyAvg)}</Td>
                  <Td right>{r.hasActual ? money(r.actAvg) : "—"}</Td>
                  <Td right>{num(r.lyCust)}</Td>
                  <Td right>{r.hasActual ? num(r.cust) : "0"}</Td>
                  <Td right className={r.hasActual ? varClass(r.varCust) : "text-muted-foreground"}>
                    {r.hasActual ? num(r.varCust) : "—"}
                  </Td>
                  <Td right>{num(r.dessertMonth)}</Td>
                </tr>
              ))}
              <tr className="report-totals font-semibold">
                <td className="px-4 py-3">Totals</td>
                <Td right>{money(totals.ly)}</Td>
                <Td right>{money(totals.target)}</Td>
                <Td right>{money(totals.actual)}</Td>
                <Td right className={varClass(totals.varSales)}>{money(totals.varSales)}</Td>
                <Td right>{money(lyAvgTotal)}</Td>
                <Td right>{money(actAvgTotal)}</Td>
                <Td right>{num(totals.lyCust)}</Td>
                <Td right>{num(totals.cust)}</Td>
                <Td right className={varClass(totals.varCust)}>{num(totals.varCust)}</Td>
                <Td right>{num0(totals.dessertMonth)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 report-stat-grid">
        <Stat label="Sales Target" value={money(totals.target)} variance={totals.varSales} varianceLabel={money(totals.varSales)} pct={totals.target > 0 ? totals.varSales / totals.target : 0} />
        <Stat label="LY Avg" value={money(lyAvgTotal)} variance={avgVariance} varianceLabel={money(avgVariance)} pct={lyAvgTotal > 0 ? avgVariance / lyAvgTotal : 0} />
        <Stat label="LY Cust" value={num(totals.lyCust)} variance={totals.varCust} varianceLabel={num(totals.varCust)} pct={totals.lyCust > 0 ? totals.varCust / totals.lyCust : 0} />
      </div>

      {salesQ.error && <p className="text-sm text-destructive">{(salesQ.error as Error).message}</p>}
      {locationsQ.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No locations yet — add one under Locations.</p>
      )}
      {fyQ.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No fiscal year configured. Add a row in <code>fiscal_year_settings</code>.</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-2.5 text-xs uppercase tracking-wider font-semibold ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, right, className = "" }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-4 py-3 ${right ? "text-right tabular-nums" : ""} ${className}`}>{children}</td>;
}

function Stat({ label, value, variance, varianceLabel, pct }: { label: string; value: string; variance: number; varianceLabel: string; pct: number }) {
  const positive = variance >= 0;
  return (
    <Card className="report-stat-card">
      <CardContent className="pt-6 flex items-start justify-between gap-4 report-stat-content">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Variance {positive ? "▲" : "▼"}</p>
          <p className={`text-xl font-semibold mt-1 ${positive ? "text-emerald-500" : "text-red-500"}`}>{varianceLabel}</p>
          <p className={`text-xs ${positive ? "text-emerald-500" : "text-red-500"}`}>
            {positive ? "+" : ""}{(pct * 100).toFixed(1)}%
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
