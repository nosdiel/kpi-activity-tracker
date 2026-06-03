import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — NiNi KPI" }] }),
  component: DashboardPage,
});

type Location = { id: string; name: string };
type DailySale = {
  business_date: string;
  actual_sales: number;
  actual_customer_count: number;
  last_year_sales: number;
  last_year_customer_count: number;
  dessert_count: number;
  location_id: string;
};

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtNum = (n: number) => n.toLocaleString("en-US");
const fmtPct = (n: number) =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function DashboardPage() {
  const [locationId, setLocationId] = useState<string>("all");
  const [days, setDays] = useState<number>(7);

  const locationsQuery = useQuery({
    queryKey: ["locations"],
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

  const since = useMemo(() => isoDaysAgo(days - 1), [days]);

  const salesQuery = useQuery({
    queryKey: ["daily_sales", since, locationId],
    queryFn: async () => {
      let q = supabase
        .from("daily_sales")
        .select(
          "business_date,actual_sales,actual_customer_count,last_year_sales,last_year_customer_count,dessert_count,location_id",
        )
        .gte("business_date", since)
        .order("business_date", { ascending: true });
      if (locationId !== "all") q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DailySale[];
    },
  });

  const rows = salesQuery.data ?? [];

  const totals = useMemo(() => {
    const t = rows.reduce(
      (a, r) => {
        a.sales += Number(r.actual_sales) || 0;
        a.lySales += Number(r.last_year_sales) || 0;
        a.cust += Number(r.actual_customer_count) || 0;
        a.lyCust += Number(r.last_year_customer_count) || 0;
        a.desserts += Number(r.dessert_count) || 0;
        return a;
      },
      { sales: 0, lySales: 0, cust: 0, lyCust: 0, desserts: 0 },
    );
    return {
      ...t,
      vsLy: t.lySales > 0 ? (t.sales - t.lySales) / t.lySales : 0,
      avgTicket: t.cust > 0 ? t.sales / t.cust : 0,
    };
  }, [rows]);

  // Aggregate per day (sum across locations when "all")
  const chartData = useMemo(() => {
    const map = new Map<string, { date: string; actual: number; ly: number }>();
    for (const r of rows) {
      const k = r.business_date;
      const cur = map.get(k) ?? { date: k, actual: 0, ly: 0 };
      cur.actual += Number(r.actual_sales) || 0;
      cur.ly += Number(r.last_year_sales) || 0;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const locName = (id: string) =>
    locationsQuery.data?.find((l) => l.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Daily Sales Activity</h1>
        </div>
        <div className="flex gap-3">
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {(locationsQuery.data ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Sales" value={fmtMoney(totals.sales)} sub={`LY ${fmtMoney(totals.lySales)}`} />
        <Kpi title="vs LY" value={totals.lySales ? fmtPct(totals.vsLy) : "—"} sub="Sales change" />
        <Kpi title="Customers" value={fmtNum(totals.cust)} sub={`LY ${fmtNum(totals.lyCust)}`} />
        <Kpi title="Avg ticket" value={fmtMoney(totals.avgTicket)} sub={`${fmtNum(totals.desserts)} desserts`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales vs Last Year</CardTitle>
          <CardDescription>
            {days}-day window
            {locationId !== "all" ? ` · ${locName(locationId)}` : " · all locations"}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          {salesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : chartData.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Bar dataKey="actual" name="Actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ly" name="Last Year" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily breakdown</CardTitle>
          <CardDescription>Per-day actuals with last-year comparison</CardDescription>
        </CardHeader>
        <CardContent>
          {salesQuery.error ? (
            <p className="text-sm text-destructive">
              {(salesQuery.error as Error).message}
            </p>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {locationId === "all" && <TableHead>Location</TableHead>}
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">LY Sales</TableHead>
                  <TableHead className="text-right">vs LY</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead className="text-right">Avg ticket</TableHead>
                  <TableHead className="text-right">Desserts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows
                  .slice()
                  .sort((a, b) => b.business_date.localeCompare(a.business_date))
                  .map((r, i) => {
                    const vs = Number(r.last_year_sales) > 0
                      ? (Number(r.actual_sales) - Number(r.last_year_sales)) / Number(r.last_year_sales)
                      : null;
                    const ticket = Number(r.actual_customer_count) > 0
                      ? Number(r.actual_sales) / Number(r.actual_customer_count)
                      : 0;
                    return (
                      <TableRow key={`${r.business_date}-${r.location_id}-${i}`}>
                        <TableCell>{r.business_date}</TableCell>
                        {locationId === "all" && <TableCell>{locName(r.location_id)}</TableCell>}
                        <TableCell className="text-right">{fmtMoney(Number(r.actual_sales))}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {fmtMoney(Number(r.last_year_sales))}
                        </TableCell>
                        <TableCell className={`text-right ${vs === null ? "text-muted-foreground" : vs >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {vs === null ? "—" : fmtPct(vs)}
                        </TableCell>
                        <TableCell className="text-right">{fmtNum(Number(r.actual_customer_count))}</TableCell>
                        <TableCell className="text-right">{fmtMoney(ticket)}</TableCell>
                        <TableCell className="text-right">{fmtNum(Number(r.dessert_count))}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {sub && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </CardContent>
      )}
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      No sales recorded for this period. Add a location and daily entries, or sync Square/Toast.
    </div>
  );
}
