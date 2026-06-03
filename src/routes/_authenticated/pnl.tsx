import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Save, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  periodWeekRange,
  periodForWeek,
  quarterForPeriod,
  weekDates,
  currentFiscalWeek,
} from "@/lib/fiscal";

export const Route = createFileRoute("/_authenticated/pnl")({
  ssr: false,
  head: () => ({ meta: [{ title: "Weekly PNL — NiNi KPI" }] }),
  component: WeeklyPnlPage,
});

type Location = { id: string; name: string };
type FY = { fiscal_year: number; start_date: string };
type Vendor = { id: string; name: string; section: string; sort_order: number | null; location_id: string | null; active: boolean };
type VendorAmount = { vendor_id: string; amount: number };
type WeeklyPnlRow = {
  id?: string;
  location_id: string;
  fiscal_year: number;
  fiscal_week: number;
  catering: number | null;
  wages: number | null;
  repairs: number | null;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const parseNum = (s: string) => {
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function WeeklyPnlPage() {
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState<string>("");
  const [fy, setFy] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Local editable state
  const [catering, setCatering] = useState("");
  const [wages, setWages] = useState("");
  const [repairs, setRepairs] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({}); // vendor_id -> string
  const [hiddenVendors, setHiddenVendors] = useState<Set<string>>(new Set());
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
    if (fy === null && fyQ.data?.[0]) {
      setFy(fyQ.data[0].fiscal_year);
      setWeek(currentFiscalWeek(fyQ.data[0].start_date));
    }
  }, [fyQ.data, fy]);

  const fyRow = useMemo(() => fyQ.data?.find((r) => r.fiscal_year === fy) ?? null, [fyQ.data, fy]);
  const period = week ? periodForWeek(week) : 1;
  const quarter = quarterForPeriod(period);
  const periodRange = periodWeekRange(period);
  const dates = useMemo(() => (fyRow && week ? weekDates(fyRow.start_date, week) : []), [fyRow, week]);

  // Vendors visible for this location (global + per-location)
  const vendorsQ = useQuery({
    queryKey: ["pnl-vendors", locationId],
    enabled: !!locationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pnl_vendors")
        .select("id,name,section,sort_order,location_id,active")
        .eq("active", true)
        .or(`location_id.is.null,location_id.eq.${locationId}`)
        .order("section")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });

  // Auto-seed default vendors for a location the first time it's used.
  useEffect(() => {
    if (!locationId || !vendorsQ.data) return;
    const haveFood = vendorsQ.data.some((v) => v.section === "food_cost");
    const havePaper = vendorsQ.data.some((v) => v.section === "paper_supplies");
    const toInsert: Array<{ name: string; section: string; sort_order: number; active: boolean; location_id: string }> = [];
    if (!haveFood) DEFAULT_FOOD_VENDORS.forEach((n, i) => toInsert.push({ name: n, section: "food_cost", sort_order: (i + 1) * 10, active: true, location_id: locationId }));
    if (!havePaper) DEFAULT_PAPER_VENDORS.forEach((n, i) => toInsert.push({ name: n, section: "paper_supplies", sort_order: (i + 1) * 10, active: true, location_id: locationId }));
    if (toInsert.length === 0) return;
    (async () => {
      const { error } = await supabase.from("pnl_vendors").insert(toInsert);
      if (!error) qc.invalidateQueries({ queryKey: ["pnl-vendors", locationId] });
    })();
  }, [locationId, vendorsQ.data, qc]);

  // Vendor amounts for this week
  const amountsQ = useQuery({
    queryKey: ["pnl-vendor-amounts", locationId, fy, week],
    enabled: !!locationId && !!fy && !!week,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_pnl_vendor_amounts")
        .select("vendor_id,amount")
        .eq("location_id", locationId)
        .eq("fiscal_year", fy as number)
        .eq("fiscal_week", week as number);
      if (error) throw error;
      return (data ?? []) as VendorAmount[];
    },
  });

  // Weekly PNL header row
  const pnlQ = useQuery({
    queryKey: ["weekly-pnl-row", locationId, fy, week],
    enabled: !!locationId && !!fy && !!week,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_pnl")
        .select("id,location_id,fiscal_year,fiscal_week,catering,wages,repairs")
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

  // Seed local editable state when queries arrive / week changes
  useEffect(() => {
    setCatering(pnlQ.data?.catering != null ? String(pnlQ.data.catering) : "");
    setWages(pnlQ.data?.wages != null ? String(pnlQ.data.wages) : "");
    setRepairs(pnlQ.data?.repairs != null ? String(pnlQ.data.repairs) : "");
  }, [pnlQ.data, locationId, fy, week]);

  useEffect(() => {
    const m: Record<string, string> = {};
    (amountsQ.data ?? []).forEach((a) => { m[a.vendor_id] = String(a.amount); });
    setAmounts(m);
    setHiddenVendors(new Set());
  }, [amountsQ.data, locationId, fy, week]);

  // Derived totals
  const foodSales = useMemo(
    () => (salesQ.data ?? []).reduce((s, r) => s + Number(r.actual_sales ?? 0), 0),
    [salesQ.data],
  );
  const cateringN = parseNum(catering);
  const wagesN = parseNum(wages);
  const repairsN = parseNum(repairs);
  const totalSales = foodSales + cateringN;

  const visibleVendors = useMemo(
    () => (vendorsQ.data ?? []).filter((v) => !hiddenVendors.has(v.id)),
    [vendorsQ.data, hiddenVendors],
  );
  const foodVendors = visibleVendors.filter((v) => v.section === "food_cost");
  const paperVendors = visibleVendors.filter((v) => v.section === "paper_supplies");

  const sectionTotal = (vs: Vendor[]) => vs.reduce((s, v) => s + parseNum(amounts[v.id] ?? ""), 0);
  const foodCostTotal = sectionTotal(foodVendors);
  const paperTotal = sectionTotal(paperVendors);
  const totalCogs = wagesN + foodCostTotal + paperTotal + repairsN;

  const pctOf = (n: number) => (totalSales > 0 ? n / totalSales : 0);

  const fmtMD = (iso: string) => {
    if (!iso) return "";
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };

  const locName = locationsQ.data?.find((l) => l.id === locationId)?.name ?? "—";

  const handleRefresh = () => {
    pnlQ.refetch(); amountsQ.refetch(); salesQ.refetch(); vendorsQ.refetch();
  };

  const handleAddVendor = async (section: "food_cost" | "paper_supplies", name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !locationId) return;
    // If a hidden one matches, just unhide
    const existing = (vendorsQ.data ?? []).find(
      (v) => v.section === section && v.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      setHiddenVendors((s) => { const n = new Set(s); n.delete(existing.id); return n; });
    } else {
      const maxSort = Math.max(0, ...(vendorsQ.data ?? []).filter((v) => v.section === section).map((v) => v.sort_order ?? 0));
      const { error } = await supabase.from("pnl_vendors").insert({
        name: trimmed,
        section,
        sort_order: maxSort + 10,
        active: true,
        location_id: locationId,
      });
      if (error) { toast.error(error.message); return; }
      await qc.invalidateQueries({ queryKey: ["pnl-vendors", locationId] });
    }
    if (section === "food_cost") setNewFoodVendor(""); else setNewPaperVendor("");
  };

  const handleSave = async () => {
    if (!locationId || !fy || !week) return;
    setSaving(true);
    try {
      // Upsert weekly_pnl row
      const pnlPayload = {
        location_id: locationId,
        fiscal_year: fy,
        fiscal_week: week,
        catering: cateringN,
        wages: wagesN,
        repairs: repairsN,
      };
      const { error: pnlErr } = await supabase
        .from("weekly_pnl")
        .upsert(pnlPayload, { onConflict: "location_id,fiscal_year,fiscal_week" });
      if (pnlErr) throw pnlErr;

      // Upsert vendor amounts for visible vendors; delete amounts for hidden ones
      const upserts = visibleVendors.map((v) => ({
        location_id: locationId,
        fiscal_year: fy,
        fiscal_week: week,
        vendor_id: v.id,
        amount: parseNum(amounts[v.id] ?? ""),
      }));
      if (upserts.length) {
        const { error } = await supabase
          .from("weekly_pnl_vendor_amounts")
          .upsert(upserts, { onConflict: "location_id,fiscal_year,fiscal_week,vendor_id" });
        if (error) throw error;
      }
      if (hiddenVendors.size) {
        const { error } = await supabase
          .from("weekly_pnl_vendor_amounts")
          .delete()
          .eq("location_id", locationId)
          .eq("fiscal_year", fy)
          .eq("fiscal_week", week)
          .in("vendor_id", [...hiddenVendors]);
        if (error) throw error;
      }
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
          <h1 className="text-3xl font-bold tracking-tight">Weekly PNL</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locName} · FY{fy ?? "—"} · Period {period} · Week {week ?? "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>Weekly PNL</Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/pnl-qtr">QTR Report</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <Card>
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
            <Select value={String(period)} onValueChange={(v) => setWeek(periodWeekRange(Number(v)).start)}>
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
                {Array.from({ length: periodRange.end - periodRange.start + 1 }, (_, i) => periodRange.start + i).map((w) => (
                  <SelectItem key={w} value={String(w)}>Week {w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="bg-primary text-primary-foreground px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold italic">Week {week ?? "—"}</h2>
            <p className="text-xs opacity-90">{dates[0] ? `${fmtMD(dates[0])} → ${fmtMD(dates[6])}` : ""} · Q{quarter} · P{period}</p>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>

        <div className="divide-y">
          {/* Sales */}
          <Row label="Food Sales (from daily sales)">
            <ReadonlyAmount value={foodSales} />
            <PctCell>—</PctCell>
          </Row>
          <Row label="Catering">
            <AmountInput value={catering} onChange={setCatering} />
            <PctCell>{pct(pctOf(cateringN))}</PctCell>
          </Row>
          <TotalRow label="Total Sales" value={money(totalSales)} />

          {/* Payroll */}
          <SectionHeader label="Payroll" />
          <Row label="Wages">
            <AmountInput value={wages} onChange={setWages} />
            <PctCell>{pct(pctOf(wagesN))}</PctCell>
          </Row>
          <TotalRow label="Total Payroll 20%" value={money(wagesN)} pct={pct(pctOf(wagesN))} />

          {/* Food Cost */}
          <SectionHeader label="Food Cost" />
          {foodVendors.map((v) => (
            <Row key={v.id} label={v.name}>
              <AmountInput value={amounts[v.id] ?? ""} onChange={(s) => setAmounts((a) => ({ ...a, [v.id]: s }))} />
              <PctCell>{pct(pctOf(parseNum(amounts[v.id] ?? "")))}</PctCell>
              <button
                aria-label={`Remove ${v.name}`}
                className="ml-2 text-muted-foreground hover:text-destructive"
                onClick={() => setHiddenVendors((s) => new Set(s).add(v.id))}
              >
                <X className="h-4 w-4" />
              </button>
            </Row>
          ))}
          <AddVendorRow
            value={newFoodVendor}
            onChange={setNewFoodVendor}
            onAdd={() => handleAddVendor("food_cost", newFoodVendor)}
          />
          <TotalRow label="Food Cost - Goal 33%" value={money(foodCostTotal)} pct={pct(pctOf(foodCostTotal))} />

          {/* Paper Supplies */}
          <SectionHeader label="Paper Supplies" />
          {paperVendors.map((v) => (
            <Row key={v.id} label={v.name}>
              <AmountInput value={amounts[v.id] ?? ""} onChange={(s) => setAmounts((a) => ({ ...a, [v.id]: s }))} />
              <PctCell>{pct(pctOf(parseNum(amounts[v.id] ?? "")))}</PctCell>
              <button
                aria-label={`Remove ${v.name}`}
                className="ml-2 text-muted-foreground hover:text-destructive"
                onClick={() => setHiddenVendors((s) => new Set(s).add(v.id))}
              >
                <X className="h-4 w-4" />
              </button>
            </Row>
          ))}
          <AddVendorRow
            value={newPaperVendor}
            onChange={setNewPaperVendor}
            onAdd={() => handleAddVendor("paper_supplies", newPaperVendor)}
          />
          <TotalRow label="Total (3%)" value={money(paperTotal)} pct={pct(pctOf(paperTotal))} />

          {/* Repairs */}
          <Row label="Total Repairs 1%">
            <AmountInput value={repairs} onChange={setRepairs} />
            <PctCell>{pct(pctOf(repairsN))}</PctCell>
          </Row>

          {/* Total */}
          <div className="bg-foreground text-background px-6 py-4 flex items-center justify-between">
            <span className="font-semibold">Total Cost of Goods</span>
            <div className="flex items-center gap-6">
              <span className="font-semibold tabular-nums">{money(totalCogs)}</span>
              <span className="text-sm tabular-nums w-16 text-right">{pct(pctOf(totalCogs))}</span>
            </div>
          </div>
        </div>
      </Card>
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
  return <div className="px-6 py-3 font-semibold text-foreground bg-muted/30">{label}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-2.5 flex items-center justify-between gap-4">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

function TotalRow({ label, value, pct: pctStr }: { label: string; value: string; pct?: string }) {
  return (
    <div className="px-6 py-3 bg-muted/50 flex items-center justify-between font-semibold">
      <span>{label}</span>
      <div className="flex items-center gap-6">
        <span className="tabular-nums">{value}</span>
        <span className="text-sm tabular-nums w-16 text-right">{pctStr ?? ""}</span>
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
    <div className="px-6 py-2.5 flex items-center gap-2">
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
