import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { quarterWeekRange, weekDates } from "@/lib/fiscal";

export const Route = createFileRoute("/_authenticated/targets")({
  head: () => ({ meta: [{ title: "Weekly Targets — NiNi KPI" }] }),
  component: TargetsPage,
});

type Location = { id: string; name: string };
type FY = { fiscal_year: number; start_date: string };
type TargetRow = {
  id: string;
  location_id: string;
  fiscal_year: number;
  fiscal_week: number;
  target_pct_over_ly: number | null;
};

function TargetsPage() {
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState("");
  const [fy, setFy] = useState<number | null>(null);
  const [quarter, setQuarter] = useState<number>(1);
  const [pct, setPct] = useState<string>("5");
  const [applyToAll, setApplyToAll] = useState(false);
  const [perWeek, setPerWeek] = useState<Record<number, string>>({});

  const locationsQ = useQuery({
    queryKey: ["locations-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations").select("id,name").eq("active", true).order("name");
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
    if (fy === null && fyQ.data?.[0]) setFy(fyQ.data[0].fiscal_year);
  }, [fyQ.data, fy]);

  const fyRow = useMemo(() => fyQ.data?.find((r) => r.fiscal_year === fy) ?? null, [fyQ.data, fy]);
  const qRange = quarterWeekRange(quarter);
  const weeks = Array.from({ length: qRange.end - qRange.start + 1 }, (_, i) => qRange.start + i);

  const targetsQ = useQuery({
    queryKey: ["weekly-targets", locationId, fy],
    enabled: !!locationId && !!fy,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_targets")
        .select("id,location_id,fiscal_year,fiscal_week,target_pct_over_ly")
        .eq("location_id", locationId)
        .eq("fiscal_year", fy);
      if (error) throw error;
      return (data ?? []) as TargetRow[];
    },
  });

  const byWeek = useMemo(() => {
    const m = new Map<number, TargetRow>();
    (targetsQ.data ?? []).forEach((r) => m.set(r.fiscal_week, r));
    return m;
  }, [targetsQ.data]);

  // Seed perWeek inputs from saved data when filters change
  useEffect(() => {
    const next: Record<number, string> = {};
    weeks.forEach((w) => {
      const v = byWeek.get(w)?.target_pct_over_ly;
      next[w] = v == null ? "" : String(v);
    });
    setPerWeek(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, fy, quarter, targetsQ.data]);

  const upsertMut = useMutation({
    mutationFn: async (rows: Array<{ fiscal_week: number; target_pct_over_ly: number }>) => {
      if (!locationId || !fy) throw new Error("Pick a location and fiscal year first");
      const payload = rows.map((r) => ({
        location_id: locationId,
        fiscal_year: fy,
        fiscal_week: r.fiscal_week,
        target_pct_over_ly: r.target_pct_over_ly,
      }));
      const { error } = await supabase
        .from("weekly_targets")
        .upsert(payload, { onConflict: "location_id,fiscal_year,fiscal_week" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Targets saved");
      qc.invalidateQueries({ queryKey: ["weekly-targets"] });
      qc.invalidateQueries({ queryKey: ["dashboard-target"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleApplyAll = () => {
    const n = Number(pct);
    if (!Number.isFinite(n)) { toast.error("Enter a valid number"); return; }
    upsertMut.mutate(weeks.map((w) => ({ fiscal_week: w, target_pct_over_ly: n })));
  };

  const handleSaveOne = (w: number) => {
    const raw = perWeek[w];
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) { toast.error("Enter a valid number"); return; }
    upsertMut.mutate([{ fiscal_week: w, target_pct_over_ly: n }]);
  };

  const fmtRange = (w: number) => {
    if (!fyRow) return "";
    const wd = weekDates(fyRow.start_date, w);
    if (wd.length !== 7) return "";
    const f = (iso: string) => {
      const d = new Date(`${iso}T00:00:00Z`);
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    };
    return `${f(wd[0])}–${f(wd[6])}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Weekly Sales Targets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set the sales target as a percentage over last year sales (e.g. <code>5</code> = +5% over LY).
        </p>
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
          <Field label="Fiscal Quarter">
            <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((q) => {
                  const r = quarterWeekRange(q);
                  return <SelectItem key={q} value={String(q)}>Q{q} (Weeks {r.start}–{r.end})</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </Field>
          <Field label="% over LY (bulk)">
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="5"
              />
              <Button
                variant="secondary"
                onClick={() => setApplyToAll(true)}
                disabled={upsertMut.isPending}
                title="Apply to every week in this quarter"
              >
                Apply
              </Button>
            </div>
          </Field>
        </CardContent>
      </Card>

      {applyToAll && (
        <Card>
          <CardHeader>
            <CardTitle>Apply {pct}% to all weeks in Q{quarter}?</CardTitle>
            <CardDescription>This will overwrite any existing % set for weeks {qRange.start}–{qRange.end} at this location.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={() => { handleApplyAll(); setApplyToAll(false); }} disabled={upsertMut.isPending}>
              Yes, apply to all
            </Button>
            <Button variant="ghost" onClick={() => setApplyToAll(false)}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Q{quarter} Weeks</CardTitle>
          <CardDescription>
            {locationsQ.data?.find((l) => l.id === locationId)?.name ?? "—"} · FY {fy ?? "—"}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>% over LY</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.map((w) => (
                <TableRow key={w}>
                  <TableCell className="font-medium">Week {w}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{fmtRange(w)}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      className="max-w-[140px]"
                      value={perWeek[w] ?? ""}
                      onChange={(e) => setPerWeek((p) => ({ ...p, [w]: e.target.value }))}
                      placeholder="e.g. 5"
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => handleSaveOne(w)} disabled={upsertMut.isPending}>
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
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
