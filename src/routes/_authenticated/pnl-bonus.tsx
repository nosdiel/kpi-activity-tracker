import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/pnl-bonus")({
  head: () => ({ meta: [{ title: "Bonus Calculator — NiNi KPI" }] }),
  component: BonusPage,
});

function BonusPage() {
  const [pct, setPct] = useState("10");

  const locationsQ = useQuery({
    queryKey: ["locations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id,name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const pnlQ = useQuery({
    queryKey: ["weekly_pnl", "bonus"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 365);
      const { data, error } = await supabase
        .from("weekly_pnl")
        .select("*")
        .gte("week_start_date", since.toISOString().slice(0, 10));
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const computed = useMemo(() => {
    const rows = pnlQ.data ?? [];
    const locMap = new Map((locationsQ.data ?? []).map((l: { id: string; name: string }) => [l.id, l.name]));
    const byLoc = new Map<string, { revenue: number; cogs: number; labor: number; opex: number }>();
    for (const r of rows) {
      const id = String(r.location_id ?? "");
      const cur = byLoc.get(id) ?? { revenue: 0, cogs: 0, labor: 0, opex: 0 };
      cur.revenue += Number(r.revenue) || 0;
      cur.cogs += Number(r.cogs) || 0;
      cur.labor += Number(r.labor) || 0;
      cur.opex += Number(r.operating_expenses) || 0;
      byLoc.set(id, cur);
    }
    const p = Number(pct) / 100;
    return [...byLoc.entries()].map(([id, s]) => {
      const profit = s.revenue - s.cogs - s.labor - s.opex;
      return {
        location: locMap.get(id) ?? id.slice(0, 8),
        revenue: s.revenue,
        profit,
        bonus: profit > 0 ? profit * p : 0,
      };
    }).sort((a, b) => b.profit - a.profit);
  }, [pnlQ.data, locationsQ.data, pct]);

  const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Bonus Calculator</h1>
        <p className="text-sm text-muted-foreground mt-1">Trailing 12 months. Bonus = profit × bonus %.</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex items-end gap-4">
          <div className="space-y-2">
            <Label>Bonus %</Label>
            <Input className="w-32" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per location</CardTitle>
          <CardDescription>{computed.length} locations</CardDescription>
        </CardHeader>
        <CardContent>
          {pnlQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : computed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No P&L data in the last 12 months.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computed.map((r) => (
                  <TableRow key={r.location}>
                    <TableCell>{r.location}</TableCell>
                    <TableCell className="text-right">{money(r.revenue)}</TableCell>
                    <TableCell className={`text-right ${r.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>{money(r.profit)}</TableCell>
                    <TableCell className="text-right font-medium">{money(r.bonus)}</TableCell>
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
