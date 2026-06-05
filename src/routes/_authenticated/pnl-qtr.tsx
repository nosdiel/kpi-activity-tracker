import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getCateringSales, getToastCateringDiagnostics } from "@/lib/api/catering-sales.functions";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  quarterWeekRange,
  shiftISODate,
  weekDates,
} from "@/lib/fiscal";

export const Route = createFileRoute("/_authenticated/pnl-qtr")({
  ssr: false,
  head: () => ({ meta: [{ title: "Quarter Report — NiNi KPI" }] }),
  component: QtrPage,
});

type Location = { id: string; name: string; region: string | null; payroll_pct_of_sales: number | null; food_cost_pct_of_sales: number | null; paper_goods_pct_of_sales: number | null };
type FY = { fiscal_year: number; start_date: string };
type VendorLine = { name: string; amount: number };
type VendorAmountsBlob = { food_cost?: VendorLine[]; paper_supplies?: VendorLine[] };

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyVar = (n: number) => `${n < 0 ? "-" : ""}${money(Math.abs(n))}`;

const withFY2027 = (rows: FY[] = []) => {
  const map = new Map(rows.map((r) => [r.fiscal_year, r.start_date]));
  if (!map.has(2027)) {
    const fy2026 = map.get(2026);
    map.set(2027, fy2026 ? shiftISODate(fy2026, 364) : "2026-12-27");
  }
  for (let y = 2026; y >= 2020; y--) {
    if (!map.has(y)) map.set(y, shiftISODate(map.get(y + 1)!, -364));
  }
  return Array.from(map.entries())
    .map(([fiscal_year, start_date]) => ({ fiscal_year, start_date }))
    .sort((a, b) => b.fiscal_year - a.fiscal_year);
};

function sumVendor(blob: unknown, key: "food_cost" | "paper_supplies"): number {
  if (!blob || typeof blob !== "object") return 0;
  const b = blob as VendorAmountsBlob;
  const arr = b[key] ?? [];
  return arr.reduce((s, v) => s + (Number(v?.amount) || 0), 0);
}

const CATEGORIES = [
  { key: "sales", label: "Sales" },
  { key: "payroll", label: "Payroll" },
  { key: "food_cost", label: "Food Cost" },
  { key: "catering", label: "Catering Order" },
  { key: "paper_good", label: "Paper Good" },
] as const;
type CatKey = (typeof CATEGORIES)[number]["key"];

function QtrPage() {
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [locationId, setLocationId] = useState<string>("");
  const [fy, setFy] = useState<number | null>(null);
  const [quarter, setQuarter] = useState<number>(1);

  const locationsQ = useQuery({
    queryKey: ["qtr-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id,name,region,payroll_pct_of_sales,food_cost_pct_of_sales,paper_goods_pct_of_sales")
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

  const regions = useMemo(() => {
    const set = new Set<string>();
    (locationsQ.data ?? []).forEach((l) => {
      if (l.region) set.add(l.region);
    });
    return Array.from(set).sort();
  }, [locationsQ.data]);

  const filteredLocations = useMemo(
    () =>
      (locationsQ.data ?? []).filter((l) =>
        regionFilter === "all" ? true : (l.region ?? "") === regionFilter,
      ),
    [locationsQ.data, regionFilter],
  );

  useEffect(() => {
    if (!locationId && filteredLocations[0]) setLocationId("all");
  }, [filteredLocations, locationId]);

  const fiscalYears = useMemo(() => withFY2027(fyQ.data ?? []), [fyQ.data]);
  useEffect(() => {
    if (fy === null && fiscalYears[0]) {
      const today = new Date().toISOString().slice(0, 10);
      const containing = fiscalYears.find((r) => {
        const end = new Date(`${r.start_date}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + 7 * 52);
        return r.start_date <= today && today < end.toISOString().slice(0, 10);
      }) ?? fiscalYears[0];
      setFy(containing.fiscal_year);
      // default quarter = current
      const fyStart = new Date(`${containing.start_date}T00:00:00Z`);
      const diff = Math.floor(
        (Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) -
          fyStart.getTime()) /
          86_400_000,
      );
      const w = Math.max(1, Math.min(52, Math.floor(diff / 7) + 1));
      setQuarter(Math.min(4, Math.floor((w - 1) / 13) + 1));
    }
  }, [fiscalYears, fy]);

  const fyRow = useMemo(() => fiscalYears.find((r) => r.fiscal_year === fy) ?? null, [fiscalYears, fy]);
  const qRange = quarterWeekRange(quarter);
  const weeks = useMemo(
    () => Array.from({ length: qRange.end - qRange.start + 1 }, (_, i) => qRange.start + i),
    [qRange.start, qRange.end],
  );

  const locIds = useMemo(
    () =>
      locationId === "all"
        ? filteredLocations.map((l) => l.id)
        : locationId
          ? [locationId]
          : [],
    [locationId, filteredLocations],
  );
  const locIdsKey = locIds.join(",");

  const targetsQ = useQuery({
    queryKey: ["qtr-targets", locIdsKey, fy, quarter],
    enabled: locIds.length > 0 && !!fy,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_targets")
        .select("location_id,fiscal_week,target_pct_over_ly")
        .in("location_id", locIds)
        .eq("fiscal_year", fy as number)
        .gte("fiscal_week", qRange.start)
        .lte("fiscal_week", qRange.end);
      if (error) throw error;
      return (data ?? []) as { location_id: string; fiscal_week: number; target_pct_over_ly: number | null }[];
    },
  });

  const pnlQ = useQuery({
    queryKey: ["qtr-pnl", locIdsKey, fy, quarter],
    enabled: locIds.length > 0 && !!fy,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_pnl")
        .select("fiscal_week,catering,wages,vendor_amounts")
        .in("location_id", locIds)
        .eq("fiscal_year", fy as number)
        .gte("fiscal_week", qRange.start)
        .lte("fiscal_week", qRange.end);
      if (error) throw error;
      return (data ?? []) as {
        fiscal_week: number;
        catering: number | null;
        wages: number | null;
        vendor_amounts: unknown;
      }[];
    },
  });

  const weekDateRanges = useMemo(() => {
    if (!fyRow) return new Map<number, [string, string]>();
    const m = new Map<number, [string, string]>();
    for (const w of weeks) {
      const wd = weekDates(fyRow.start_date, w);
      m.set(w, [wd[0], wd[6]]);
    }
    return m;
  }, [fyRow, weeks]);

  const firstWeekStart = weekDateRanges.get(weeks[0])?.[0];
  const lastWeekEnd = weekDateRanges.get(weeks[weeks.length - 1])?.[1];

  const salesQ = useQuery({
    queryKey: ["qtr-sales", locIdsKey, firstWeekStart, lastWeekEnd],
    enabled: locIds.length > 0 && !!firstWeekStart && !!lastWeekEnd,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_sales")
        .select("location_id,business_date,actual_sales,last_year_sales")
        .in("location_id", locIds)
        .gte("business_date", firstWeekStart as string)
        .lte("business_date", lastWeekEnd as string);
      if (error) throw error;
      return (data ?? []) as {
        location_id: string;
        business_date: string;
        actual_sales: number | null;
        last_year_sales: number | null;
      }[];
    },
  });

  const cateringFn = useServerFn(getCateringSales);
  const diagFn = useServerFn(getToastCateringDiagnostics);
  const [diagLocation, setDiagLocation] = useState<string>("");
  const [diagWeek, setDiagWeek] = useState<number | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<null | {
    location: { id: string; name: string; restaurantGuid: string };
    endpoint: string;
    requestBody: unknown;
    reportRequestGuid: string;
    rowCount: number;
    rows: Array<{
      diningOption: string | null;
      netSalesAmount: number | null;
      grossSalesAmount: number | null;
      businessDate: string | null;
      restaurantGuid: string;
      raw: string;
    }>;
  }>(null);
  const handleToastDiagnostics = async () => {
    if (!diagLocation || !diagWeek || !fyRow) {
      toast.error("Pick a specific location and a week first");
      return;
    }
    const wd = weekDates(fyRow.start_date, diagWeek);
    if (wd.length !== 7) return;
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const res = await diagFn({
        data: { location_id: diagLocation, start_date: wd[0], end_date: wd[6] },
      });
      setDiagResult(res);
      toast.success(`Toast returned ${res.rowCount} rows`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDiagLoading(false);
    }
  };

  const cateringQ = useQuery({
    queryKey: ["qtr-catering", locIdsKey, firstWeekStart, lastWeekEnd],
    enabled: false,
    queryFn: async () => {
      const res = await cateringFn({
        data: {
          location_ids: locIds,
          start_date: firstWeekStart as string,
          end_date: lastWeekEnd as string,
          fiscal_year: fy as number,
          weeks: weeks.flatMap((w) => {
            const range = weekDateRanges.get(w);
            return range ? [{ fiscal_week: w, start_date: range[0], end_date: range[1] }] : [];
          }),
        },
      });
      return res as { results: { location_id: string; business_date: string; amount: number }[]; errors: { location_id: string; message: string }[] };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Compute per-week values
  const rows = useMemo(() => {
    const pctByLocWeek = new Map<string, number>();
    (targetsQ.data ?? []).forEach((r) =>
      pctByLocWeek.set(`${r.location_id}:${r.fiscal_week}`, Number(r.target_pct_over_ly ?? 0) / 100),
    );
    const payrollPctByLoc = new Map<string, number>();
    const foodPctByLoc = new Map<string, number>();
    const paperPctByLoc = new Map<string, number>();
    (locationsQ.data ?? []).forEach((l) => {
      payrollPctByLoc.set(l.id, Number(l.payroll_pct_of_sales ?? 0) / 100);
      foodPctByLoc.set(l.id, Number(l.food_cost_pct_of_sales ?? 0) / 100);
      paperPctByLoc.set(l.id, Number(l.paper_goods_pct_of_sales ?? 0) / 100);
    });

    const pnlByWeek = new Map<number, { catering: number; wages: number; food: number; paper: number }>();
    (pnlQ.data ?? []).forEach((r) => {
      const cur = pnlByWeek.get(r.fiscal_week) ?? { catering: 0, wages: 0, food: 0, paper: 0 };
      cur.catering += Number(r.catering ?? 0);
      cur.wages += Number(r.wages ?? 0);
      cur.food += sumVendor(r.vendor_amounts, "food_cost");
      cur.paper += sumVendor(r.vendor_amounts, "paper_supplies");
      pnlByWeek.set(r.fiscal_week, cur);
    });

    const salesByWeek = new Map<number, number>();
    const goalByWeek = new Map<number, number>();
    const payrollGoalByWeek = new Map<number, number>();
    const foodGoalByWeek = new Map<number, number>();
    const paperGoalByWeek = new Map<number, number>();
    (salesQ.data ?? []).forEach((s) => {
      for (const [w, [start, end]] of weekDateRanges.entries()) {
        if (s.business_date >= start && s.business_date <= end) {
          const actual = Number(s.actual_sales ?? 0);
          salesByWeek.set(w, (salesByWeek.get(w) ?? 0) + actual);
          const pct = pctByLocWeek.get(`${s.location_id}:${w}`) ?? 0;
          const ly = Number(s.last_year_sales ?? 0);
          goalByWeek.set(w, (goalByWeek.get(w) ?? 0) + ly * (1 + pct));
          payrollGoalByWeek.set(w, (payrollGoalByWeek.get(w) ?? 0) + actual * (payrollPctByLoc.get(s.location_id) ?? 0));
          foodGoalByWeek.set(w, (foodGoalByWeek.get(w) ?? 0) + actual * (foodPctByLoc.get(s.location_id) ?? 0));
          paperGoalByWeek.set(w, (paperGoalByWeek.get(w) ?? 0) + actual * (paperPctByLoc.get(s.location_id) ?? 0));
          break;
        }
      }
    });

    const cateringByWeek = new Map<number, number>();
    (cateringQ.data?.results ?? []).forEach((c) => {
      for (const [w, [start, end]] of weekDateRanges.entries()) {
        if (c.business_date >= start && c.business_date <= end) {
          cateringByWeek.set(w, (cateringByWeek.get(w) ?? 0) + Number(c.amount ?? 0));
          break;
        }
      }
    });

    return weeks.map((w) => {
      const sales = salesByWeek.get(w) ?? 0;
      const p = pnlByWeek.get(w) ?? { catering: 0, wages: 0, food: 0, paper: 0 };
      const vals: Record<CatKey, { goal: number; actual: number }> = {
        sales: { goal: goalByWeek.get(w) ?? 0, actual: sales },
        payroll: { goal: payrollGoalByWeek.get(w) ?? 0, actual: p.wages },
        food_cost: { goal: foodGoalByWeek.get(w) ?? 0, actual: p.food },
        catering: { goal: 0, actual: cateringByWeek.get(w) ?? p.catering },
        paper_good: { goal: paperGoalByWeek.get(w) ?? 0, actual: p.paper },
      };
      return { week: w, vals };
    });
  }, [targetsQ.data, pnlQ.data, salesQ.data, locationsQ.data, cateringQ.data, weeks, weekDateRanges]);

  // Totals
  const totals = useMemo(() => {
    const t: Record<CatKey, { goal: number; actual: number }> = {
      sales: { goal: 0, actual: 0 },
      payroll: { goal: 0, actual: 0 },
      food_cost: { goal: 0, actual: 0 },
      catering: { goal: 0, actual: 0 },
      paper_good: { goal: 0, actual: 0 },
    };
    rows.forEach((r) => {
      for (const c of CATEGORIES) {
        t[c.key].goal += r.vals[c.key].goal;
        t[c.key].actual += r.vals[c.key].actual;
      }
    });
    return t;
  }, [rows]);

  // Split weeks into 3 sub-groups (Q/T/D in the original); label all 3 with quarter number
  const groups = useMemo(() => {
    const n = weeks.length;
    const a = Math.ceil(n / 3);
    const b = Math.ceil((n - a) / 2);
    return [weeks.slice(0, a), weeks.slice(a, a + b), weeks.slice(a + b)];
  }, [weeks]);
  const isRefreshing = targetsQ.isFetching || pnlQ.isFetching || salesQ.isFetching || cateringQ.isFetching;
  const cateringErrorCount = cateringQ.data?.errors?.length ?? 0;
  const cateringLoadedCount = cateringQ.data?.results?.length ?? 0;
  const savedCateringTotal = totals.catering.actual;

  const handleRefresh = () => {
    targetsQ.refetch();
    pnlQ.refetch();
    salesQ.refetch();
    cateringQ.refetch();
  };

  const locName =
    locationId === "all"
      ? `All locations${regionFilter === "all" ? "" : ` · ${regionFilter}`}`
      : (filteredLocations.find((l) => l.id === locationId)?.name ?? "—");


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quarter Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locName} · FY{fy ?? "—"} · Q{quarter} · Weeks {qRange.start}–{qRange.end}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/pnl">Weekly PNL</Link>
          </Button>
          <Button variant="outline" size="sm" disabled>QTR Report</Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {(cateringQ.isFetching || cateringErrorCount > 0 || cateringLoadedCount > 0) && (
        <Alert variant={cateringErrorCount > 0 ? "destructive" : "default"}>
          <AlertTitle>Catering sales</AlertTitle>
          <AlertDescription>
            {cateringQ.isFetching
              ? "Loading catering sales from POS…"
              : cateringErrorCount > 0
                ? `Toast rate limit reached, try again later. Showing saved weekly catering total ${money(savedCateringTotal)}.`
                : `Loaded catering sales for ${cateringLoadedCount} day${cateringLoadedCount === 1 ? "" : "s"}.`}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6 grid gap-4 md:grid-cols-4">
          <Field label="Region">
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Location">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue placeholder="Pick location" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {filteredLocations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fiscal Year">
            <Select value={fy?.toString() ?? ""} onValueChange={(v) => setFy(Number(v))}>
              <SelectTrigger><SelectValue placeholder="FY" /></SelectTrigger>
              <SelectContent>
                {fiscalYears.map((y) => (
                  <SelectItem key={y.fiscal_year} value={String(y.fiscal_year)}>FY {y.fiscal_year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Quarter">
            <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((q) => (
                  <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0a1f4a] text-white">
                <th className="px-3 py-3 text-left w-[60px]"></th>
                <th className="px-3 py-3 text-left">Weeks</th>
                {CATEGORIES.map((c) => (
                  <th key={c.key} colSpan={3} className="px-3 py-3 text-center border-l border-white/20">
                    {c.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-muted text-foreground">
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2 text-left font-medium">Weeks</th>
                {CATEGORIES.map((c) => (
                  <Fragment key={c.key}>
                    <th className="px-3 py-2 text-right font-medium border-l">Goal</th>
                    <th className="px-3 py-2 text-right font-medium">Actual</th>
                    <th className="px-3 py-2 text-right font-medium">WTD</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((grp, gi) => (
                <Fragment key={gi}>
                  {grp.map((w, idx) => {
                    const row = rows.find((r) => r.week === w);
                    return (
                      <tr key={w} className="border-t">
                        {idx === 0 && (
                          <td
                            rowSpan={grp.length}
                            className="px-3 py-2 text-center align-middle font-semibold text-muted-foreground border-r bg-muted/30"
                          >
                            QTR {quarter}
                          </td>
                        )}
                        <td className="px-3 py-2">Week {w}</td>
                        {CATEGORIES.map((c) => (
                          <Cells key={c.key} val={row?.vals[c.key] ?? { goal: 0, actual: 0 }} />
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
              <tr className="bg-[#0a1f4a] text-white font-semibold">
                <td className="px-3 py-3 text-center">QTD {quarter}</td>
                <td className="px-3 py-3"></td>
                {CATEGORIES.map((c) => {
                  const v = totals[c.key];
                  const variance = v.actual - v.goal;
                  return (
                    <Fragment key={c.key}>
                      <td className="px-3 py-3 text-right border-l border-white/20">{money(v.goal)}</td>
                      <td className="px-3 py-3 text-right">{money(v.actual)}</td>
                      <td className="px-3 py-3 text-right">
                        {v.goal === 0 && v.actual === 0 ? "—" : moneyVar(variance)}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Cells({ val }: { val: { goal: number; actual: number } }) {
  const variance = val.actual - val.goal;
  return (
    <>
      <td className="px-3 py-2 text-right border-l">{money(val.goal)}</td>
      <td className="px-3 py-2 text-right">{money(val.actual)}</td>
      <td className="px-3 py-2 text-right text-muted-foreground">
        {val.goal === 0 && val.actual === 0 ? "—" : moneyVar(variance)}
      </td>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
