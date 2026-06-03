import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/pnl-qtr")({
  head: () => ({ meta: [{ title: "P&L Quarterly — NiNi KPI" }] }),
  component: QtrPage,
});

const QUARTERS = [
  { id: "Q1", months: [0, 1, 2] },
  { id: "Q2", months: [3, 4, 5] },
  { id: "Q3", months: [6, 7, 8] },
  { id: "Q4", months: [9, 10, 11] },
];

function QtrPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));

  const q = useQuery({
    queryKey: ["weekly_pnl", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_pnl")
        .select("*")
        .gte("week_start_date", `${year}-01-01`)
        .lte("week_start_date", `${year}-12-31`);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const rollup = useMemo(() => {
    const rows = q.data ?? [];
    const numericKeys = new Set<string>();
    rows.forEach((r) => Object.entries(r).forEach(([k, v]) => {
      if (typeof v === "number") numericKeys.add(k);
    }));
    return QUARTERS.map((qt) => {
      const monthSet = new Set(qt.months);
      const subset = rows.filter((r) => {
        const d = new Date(String(r.week_start_date ?? ""));
        return !isNaN(d.getTime()) && monthSet.has(d.getMonth());
      });
      const sums: Record<string, number> = {};
      numericKeys.forEach((k) => {
        sums[k] = subset.reduce((a, r) => a + (Number(r[k]) || 0), 0);
      });
      return { quarter: qt.id, weeks: subset.length, sums };
    });
  }, [q.data]);

  const cols = Array.from(new Set(rollup.flatMap((r) => Object.keys(r.sums))));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">P&L — Quarterly</h1>
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quarter rollup</CardTitle>
          <CardDescription>Sums of all numeric weekly P&L columns, grouped by quarter.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {q.error ? (
            <p className="text-sm text-destructive">{(q.error as Error).message}</p>
          ) : q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : cols.length === 0 ? (
            <p className="text-sm text-muted-foreground">No weekly P&L rows for {year}. Add some on the P&L Weekly page.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quarter</TableHead>
                  <TableHead className="text-right">Weeks</TableHead>
                  {cols.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rollup.map((r) => (
                  <TableRow key={r.quarter}>
                    <TableCell>{r.quarter}</TableCell>
                    <TableCell className="text-right">{r.weeks}</TableCell>
                    {cols.map((c) => (
                      <TableCell key={c} className="text-right">
                        {r.sums[c] !== undefined ? r.sums[c].toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
