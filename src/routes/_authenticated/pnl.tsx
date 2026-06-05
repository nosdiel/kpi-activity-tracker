import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Save, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCateringSales, getToastCateringDiagnostics } from "@/lib/api/catering-sales.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  periodForWeek,
  quarterForWeek,
  quarterWeekRange,
  shiftISODate,
  weekDates,
  currentFiscalWeek,
} from "@/lib/fiscal";

export const Route = createFileRoute("/_authenticated/pnl")({
  ssr: false,
  head: () => ({ meta: [{ title: "Weekly P&L — NiNi KPI" }] }),
  component: WeeklyPnlPage,
});

type Location = { id: string; name: string };
type FY = { fiscal_year: number; start_date: string };
type VendorLine = { name: string; amount: number };
type VendorAmountsBlob = {
  food_cost?: VendorLine[];
  paper_supplies?: VendorLine[];
};
type WeeklyPnlRow = {
  id?: string;
  location_id: string;
  fiscal_year: number;
  fiscal_week: number;
  catering: number | null;
  wages: number | null;
  repairs: number | null;
  beer_wine_cost: number | null;
  vendor_amounts: VendorAmountsBlob | null;
};

const DEFAULT_FOOD_VENDORS: readonly string[] = [
  "Sysco", "The Cafe Group", "CBI", "All Coffee",
  "Cortes (Soda)", "CP Oil (Veg, Oil)", "Vicky Enterprises", "Joy's Kitchen",
];
const DEFAULT_PAPER_VENDORS: readonly string[] = ["All Florida Paper", "Dade Paper"];

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = (n: number) => `${(n * 100).toFixed(2)}%`;
const parseNum = (s: string) => {
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
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
const defaultFiscalYear = (rows: FY[]) => {
  const today = new Date().toISOString().slice(0, 10);
  const containing = rows.find((r) => {
    const end = new Date(`${r.start_date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 7 * 52);
    return r.start_date <= today && today < end.toISOString().slice(0, 10);
  });
  if (containing) return containing;
  return rows.find((r) => r.start_date <= today) ?? rows[rows.length - 1] ?? rows[0];
};

// Merge stored vendor list with defaults so defaults always appear (unless explicitly removed).
function buildSectionLines(
  defaults: readonly string[],
  stored: VendorLine[] | undefined,
  removed: readonly string[],
): VendorLine[] {
  const removedSet = new Set(removed.map((n) => n.toLowerCase()));
  const storedMap = new Map((stored ?? []).map((v) => [v.name.toLowerCase(), v]));
  const out: VendorLine[] = [];
  const seen = new Set<string>();
  for (const name of defaults) {
    const key = name.toLowerCase();
    if (removedSet.has(key)) continue;
    seen.add(key);
    out.push({ name, amount: storedMap.get(key)?.amount ?? 0 });
  }
  for (const v of stored ?? []) {
    const key = v.name.toLowerCase();
    if (seen.has(key) || removedSet.has(key)) continue;
    out.push({ name: v.name, amount: v.amount });
  }
  return out;
}

function WeeklyPnlPage() {
  const [locationId, setLocationId] = useState<string>("");
  const [fy, setFy] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [catering, setCatering] = useState("");
  const [wages, setWages] = useState("");
  const [repairs, setRepairs] = useState("");
  const [foodLines, setFoodLines] = useState<VendorLine[]>(
    () => DEFAULT_FOOD_VENDORS.map((n) => ({ name: n, amount: 0 })),
  );
  const [paperLines, setPaperLines] = useState<VendorLine[]>(
    () => DEFAULT_PAPER_VENDORS.map((n) => ({ name: n, amount: 0 })),
  );
  const [newFoodVendor, setNewFoodVendor] = useState("");
  const [newPaperVendor, setNewPaperVendor] = useState("");

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

  useEffect(() => {
    if (!locationId && locationsQ.data?.[0]) setLocationId(locationsQ.data[0].id);
  }, [locationsQ.data, locationId]);
  useEffect(() => {
    const years = withFY2027(fyQ.data ?? []);
    if (fy === null && years[0]) {
      // Default to the fiscal week PRIOR to the current week (the most recent
      // completed week), picking the FY that actually contains that prior week.
      const priorDate = new Date();
      priorDate.setUTCDate(priorDate.getUTCDate() - 7);
      const priorISO = priorDate.toISOString().slice(0, 10);
      const containing =
        years.find((r) => {
          const end = new Date(`${r.start_date}T00:00:00Z`);
          end.setUTCDate(end.getUTCDate() + 7 * 52);
          return r.start_date <= priorISO && priorISO < end.toISOString().slice(0, 10);
        }) ?? defaultFiscalYear(years);
      setFy(containing.fiscal_year);
      setWeek(currentFiscalWeek(containing.start_date, priorDate));
    }
  }, [fyQ.data, fy]);

  const fiscalYears = useMemo(() => withFY2027(fyQ.data ?? []), [fyQ.data]);
  const fyRow = useMemo(() => fiscalYears.find((r) => r.fiscal_year === fy) ?? null, [fiscalYears, fy]);
  const period = week ? periodForWeek(week) : 1;
  const quarter = week ? quarterForWeek(week) : 1;
  const quarterRange = quarterWeekRange(quarter);
  const dates = useMemo(() => (fyRow && week ? weekDates(fyRow.start_date, week) : []), [fyRow, week]);

  // Weekly P&L row
  const pnlQ = useQuery({
    queryKey: ["weekly-pnl-row", locationId, fy, week],
    enabled: !!locationId && !!fy && !!week,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_pnl")
        .select("id,location_id,fiscal_year,fiscal_week,catering,wages,repairs,beer_wine_cost,vendor_amounts")
        .eq("location_id", locationId)
        .eq("fiscal_year", fy as number)
        .eq("fiscal_week", week as number)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WeeklyPnlRow | null;
    },
  });

  // Daily sales for food sales total
  const salesQ = useQuery({
    queryKey: ["pnl-daily-sales", locationId, dates[0], dates[6]],
    enabled: !!locationId && dates.length === 7,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_sales")
        .select("business_date,actual_sales")
        .eq("location_id", locationId)
        .gte("business_date", dates[0])
        .lte("business_date", dates[6]);
      if (error) throw error;
      return (data ?? []) as { business_date: string; actual_sales: number | null }[];
    },
  });

  // Hydrate local state when row arrives or selection changes
  useEffect(() => {
    const row = pnlQ.data;
    setCatering(row?.catering != null ? String(row.catering) : "");
    setWages(row?.wages != null ? String(row.wages) : "");
    setRepairs(row?.repairs != null ? String(row.repairs) : "");

    let blob: VendorAmountsBlob = {};
    const raw = row?.vendor_amounts as unknown;
    if (raw && typeof raw === "object") blob = raw as VendorAmountsBlob;
    else if (typeof raw === "string") {
      try { blob = JSON.parse(raw) as VendorAmountsBlob; } catch { blob = {}; }
    }
    const removedFood = (blob as { _removed_food?: string[] })._removed_food ?? [];
    const removedPaper = (blob as { _removed_paper?: string[] })._removed_paper ?? [];
    setFoodLines(buildSectionLines(DEFAULT_FOOD_VENDORS, blob.food_cost, removedFood));
    setPaperLines(buildSectionLines(DEFAULT_PAPER_VENDORS, blob.paper_supplies, removedPaper));
  }, [pnlQ.data, locationId, fy, week]);

  const foodSales = useMemo(
    () => (salesQ.data ?? []).reduce((s, r) => s + Number(r.actual_sales ?? 0), 0),
    [salesQ.data],
  );
  const cateringN = parseNum(catering);
  const wagesN = parseNum(wages);
  const repairsN = parseNum(repairs);
  const totalSales = foodSales + cateringN;
  const foodCostTotal = foodLines.reduce((s, v) => s + (v.amount || 0), 0);
  const paperTotal = paperLines.reduce((s, v) => s + (v.amount || 0), 0);
  const totalCogs = wagesN + foodCostTotal + paperTotal + repairsN;

  const pctOf = (n: number) => (totalSales > 0 ? n / totalSales : 0);

  const locName = locationsQ.data?.find((l) => l.id === locationId)?.name ?? "—";
  const fmtMD = (iso: string) => {
    if (!iso) return "";
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };

  const updateLine = (
    setter: React.Dispatch<React.SetStateAction<VendorLine[]>>,
    idx: number,
    amount: number,
  ) => setter((prev) => prev.map((v, i) => (i === idx ? { ...v, amount } : v)));

  const removeLine = (
    setter: React.Dispatch<React.SetStateAction<VendorLine[]>>,
    idx: number,
  ) => setter((prev) => prev.filter((_, i) => i !== idx));

  const addVendor = (
    setter: React.Dispatch<React.SetStateAction<VendorLine[]>>,
    name: string,
    clear: () => void,
  ) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setter((prev) =>
      prev.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())
        ? prev
        : [...prev, { name: trimmed, amount: 0 }],
    );
    clear();
  };

  const handleRefresh = () => { pnlQ.refetch(); salesQ.refetch(); };


  const handleSave = async () => {
    if (!locationId || !fy || !week) return;
    setSaving(true);
    try {
      // Track removed defaults so they stay removed
      const visibleFood = new Set(foodLines.map((v) => v.name.toLowerCase()));
      const visiblePaper = new Set(paperLines.map((v) => v.name.toLowerCase()));
      const removedFood = DEFAULT_FOOD_VENDORS.filter((n) => !visibleFood.has(n.toLowerCase()));
      const removedPaper = DEFAULT_PAPER_VENDORS.filter((n) => !visiblePaper.has(n.toLowerCase()));

      const vendor_amounts: VendorAmountsBlob & { _removed_food?: string[]; _removed_paper?: string[] } = {
        food_cost: foodLines,
        paper_supplies: paperLines,
        _removed_food: removedFood,
        _removed_paper: removedPaper,
      };

      const { error } = await supabase
        .from("weekly_pnl")
        .upsert({
          location_id: locationId,
          fiscal_year: fy,
          fiscal_week: week,
          catering: cateringN,
          wages: wagesN,
          repairs: repairsN,
          vendor_amounts,
        }, { onConflict: "location_id,fiscal_year,fiscal_week" });
      if (error) throw error;
      toast.success("Saved");
      handleRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Weekly P&L</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locName} · FY{fy ?? "—"} · Q{quarter} · Week {week ?? "—"}
          </p>
        </div>
        <div className="flex gap-2" data-print-actions>
          <Button variant="outline" size="sm" disabled>Weekly P&L</Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/pnl-qtr">QTR Report</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
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
                {fiscalYears.map((y) => (
                  <SelectItem key={y.fiscal_year} value={String(y.fiscal_year)}>FY {y.fiscal_year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fiscal Quarter">
            <Select value={String(quarter)} onValueChange={(v) => setWeek(quarterWeekRange(Number(v)).start)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 4 }, (_, i) => i + 1).map((q) => {
                  const r = quarterWeekRange(q);
                  return (
                    <SelectItem key={q} value={String(q)}>
                      Q{q} (Weeks {r.start}–{r.end})
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
                {Array.from({ length: quarterRange.end - quarterRange.start + 1 }, (_, i) => quarterRange.start + i).map((w) => {
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

      <Card className="overflow-hidden print-compact-card">
        <div className="bg-[#0a1f4a] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold italic">Week {week ?? "—"}</h2>
            <p className="text-xs opacity-90">{dates[0] ? `${fmtMD(dates[0])} → ${fmtMD(dates[6])}` : ""} · Q{quarter} · P{period}</p>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[#f59e0b] hover:bg-[#d97706] text-white">
            <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>

        <div className="divide-y">
          <Row label="Food Sales (from daily sales)" i={0}>
            <ReadonlyAmount value={foodSales} />
            <PctCell>—</PctCell>
          </Row>
          <Row label="Catering Order" i={1}>
            <AmountInput value={catering} onChange={setCatering} />
            <PctCell>{pctFmt(pctOf(cateringN))}</PctCell>
          </Row>

          <TotalRow label="Total Sales" value={money(totalSales)} />

          <SectionHeader label="Payroll" />
          <Row label="Wages" i={0}>
            <AmountInput value={wages} onChange={setWages} />
            <PctCell>{pctFmt(pctOf(wagesN))}</PctCell>
          </Row>

          <TotalRow label="Total Payroll 20%" value={money(wagesN)} pct={pctFmt(pctOf(wagesN))} />

          <SectionHeader label="Food Cost" />
          {foodLines.map((v, i) => (
            <Row key={`${v.name}-${i}`} label={v.name} i={i}>
              <AmountInput
                value={v.amount ? String(v.amount) : ""}
                onChange={(s) => updateLine(setFoodLines, i, parseNum(s))}
              />
              <PctCell>{pctFmt(pctOf(v.amount || 0))}</PctCell>
              <button
                aria-label={`Remove ${v.name}`}
                className="ml-2 text-muted-foreground hover:text-destructive"
                onClick={() => removeLine(setFoodLines, i)}
              >
                <X className="h-4 w-4" />
              </button>
            </Row>
          ))}

          <AddVendorRow
            value={newFoodVendor}
            onChange={setNewFoodVendor}
            onAdd={() => addVendor(setFoodLines, newFoodVendor, () => setNewFoodVendor(""))}
          />
          <TotalRow label="Food Cost - Goal 33%" value={money(foodCostTotal)} pct={pctFmt(pctOf(foodCostTotal))} />

          <SectionHeader label="Paper Supplies" />
          {paperLines.map((v, i) => (
            <Row key={`${v.name}-${i}`} label={v.name} i={i}>
              <AmountInput
                value={v.amount ? String(v.amount) : ""}
                onChange={(s) => updateLine(setPaperLines, i, parseNum(s))}
              />
              <PctCell>{pctFmt(pctOf(v.amount || 0))}</PctCell>
              <button
                aria-label={`Remove ${v.name}`}
                className="ml-2 text-muted-foreground hover:text-destructive"
                onClick={() => removeLine(setPaperLines, i)}
              >
                <X className="h-4 w-4" />
              </button>
            </Row>
          ))}

          <AddVendorRow
            value={newPaperVendor}
            onChange={setNewPaperVendor}
            onAdd={() => addVendor(setPaperLines, newPaperVendor, () => setNewPaperVendor(""))}
          />
          <TotalRow label="Total (3%)" value={money(paperTotal)} pct={pctFmt(pctOf(paperTotal))} />

          <Row label="Total Repairs 1%" i={0}>
            <AmountInput value={repairs} onChange={setRepairs} />
            <PctCell>{pctFmt(pctOf(repairsN))}</PctCell>
          </Row>


          <div className="bg-[#0a1f4a] text-white px-6 py-4 flex items-center justify-between">
            <span className="font-semibold">Total Cost of Goods</span>
            <div className="flex items-center gap-6">
              <span className="font-semibold tabular-nums">{money(totalCogs)}</span>
              <span className="text-sm tabular-nums w-16 text-right">{pctFmt(pctOf(totalCogs))}</span>
            </div>
          </div>
        </div>
      </Card>

      {diagResult && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Catering Toast Diagnostics</h3>
                <p className="text-xs text-muted-foreground">
                  {diagResult.location.name} · restaurantGuid {diagResult.location.restaurantGuid}
                </p>
                <p className="text-xs text-muted-foreground">
                  POST {diagResult.endpoint} · reportRequestGuid {diagResult.reportRequestGuid} · {diagResult.rowCount} rows
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDiagResult(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <pre className="text-xs bg-muted/40 p-3 rounded overflow-x-auto">
{JSON.stringify(diagResult.requestBody, null, 2)}
            </pre>
            {diagResult.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Toast returned 0 rows for this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3">diningOption</th>
                      <th className="py-2 pr-3 text-right">netSalesAmount</th>
                      <th className="py-2 pr-3 text-right">grossSalesAmount</th>
                      <th className="py-2 pr-3">businessDate</th>
                      <th className="py-2 pr-3">restaurantGuid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagResult.rows.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1.5 pr-3">{r.diningOption ?? <em className="text-muted-foreground">(none)</em>}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{r.netSalesAmount ?? "—"}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{r.grossSalesAmount ?? "—"}</td>
                        <td className="py-1.5 pr-3">{r.businessDate ?? "—"}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">{r.restaurantGuid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Raw rows JSON</summary>
              <pre className="bg-muted/40 p-3 rounded overflow-x-auto mt-2">
{diagResult.rows.map((r) => r.raw).join("\n")}
              </pre>
            </details>
          </CardContent>
        </Card>
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

function SectionHeader({ label }: { label: string }) {
  return <div className="px-6 py-3 font-semibold text-foreground bg-muted/30 print-section">{label}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode; i?: number }) {
  return (
    <div className="px-6 py-2.5 flex items-center justify-between gap-4 print-row bg-white">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}


function TotalRow({ label, value, pct }: { label: string; value: string; pct?: string }) {
  return (
    <div className="px-6 py-3 bg-[#cfdcef] flex items-center justify-between font-semibold print-total">
      <span>{label}</span>
      <div className="flex items-center gap-6">
        <span className="tabular-nums">{value}</span>
        <span className="text-sm tabular-nums w-16 text-right">{pct ?? ""}</span>
      </div>
    </div>
  );
}

function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      className="w-32 text-right tabular-nums"
      inputMode="decimal"
      placeholder="0.00"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ReadonlyAmount({ value }: { value: number }) {
  return <span className="w-32 text-right tabular-nums font-medium">{money(value)}</span>;
}

function PctCell({ children }: { children: React.ReactNode }) {
  return <span className="text-sm tabular-nums text-muted-foreground w-16 text-right">{children}</span>;
}

function AddVendorRow({ value, onChange, onAdd }: { value: string; onChange: (v: string) => void; onAdd: () => void }) {
  return (
    <div className="px-6 py-2.5 flex items-center gap-2" data-print-add-row>
      <Input
        className="w-64"
        placeholder="Add vendor..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
      />
      <Button size="sm" variant="outline" onClick={onAdd}>
        <Plus className="h-4 w-4 mr-1" /> Add
      </Button>
    </div>
  );
}
