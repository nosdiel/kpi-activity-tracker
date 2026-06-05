import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listPosLocations,
  getPosMenu,
  runMarketBasketAnalysis,
} from "@/lib/api/marketing-matrix.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/marketing-matrix")({
  head: () => ({ meta: [{ title: "Marketing Matrix — NiNi KPI" }] }),
  component: MarketingMatrixPage,
});

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function MarketingMatrixPage() {
  const listFn = useServerFn(listPosLocations);
  const menuFn = useServerFn(getPosMenu);
  const runFn = useServerFn(runMarketBasketAnalysis);

  const locsQ = useQuery({ queryKey: ["mm-locations"], queryFn: () => listFn() });

  const [locationId, setLocationId] = useState<string>("");
  const [itemId, setItemId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(isoDaysAgo(14));
  const [endDate, setEndDate] = useState<string>(isoDaysAgo(1));

  useEffect(() => {
    if (!locationId && locsQ.data && locsQ.data.length > 0) setLocationId(locsQ.data[0].id);
  }, [locsQ.data, locationId]);

  const menuQ = useQuery({
    queryKey: ["mm-menu", locationId],
    queryFn: () => menuFn({ data: { location_id: locationId } }),
    enabled: !!locationId,
  });

  useEffect(() => {
    setItemId("");
  }, [locationId]);

  const runMut = useMutation({
    mutationFn: () => {
      const item = menuQ.data?.items.find((i) => i.id === itemId);
      if (!item) throw new Error("Pick an item");
      return runFn({
        data: {
          location_id: locationId,
          item_id: item.id,
          item_name: item.name,
          start_date: startDate,
          end_date: endDate,
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const result = runMut.data;
  const chartData = useMemo(() => {
    if (!result) return [];
    const map = new Map<string, { date: string; current: number; prior: number }>();
    result.current.daily.forEach((d, i) => {
      const key = `Day ${i + 1}`;
      map.set(key, { date: key, current: d.units, prior: 0 });
    });
    result.prior.daily.forEach((d, i) => {
      const key = `Day ${i + 1}`;
      const ex = map.get(key) ?? { date: key, current: 0, prior: 0 };
      ex.prior = d.units;
      map.set(key, ex);
    });
    return [...map.values()];
  }, [result]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Marketing Matrix</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Market Basket Analysis — see what guests bought alongside a marketed dish, and compare to the same window
          last year.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaign setup</CardTitle>
          <CardDescription>Pick a location, the marketed item, and the campaign window.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder={locsQ.isLoading ? "Loading…" : "Select location"} />
              </SelectTrigger>
              <SelectContent>
                {(locsQ.data ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} · {l.provider ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Marketed item</Label>
            <Select value={itemId} onValueChange={setItemId} disabled={!menuQ.data}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !locationId
                      ? "Select location first"
                      : menuQ.isLoading
                      ? "Loading menu…"
                      : menuQ.error
                      ? "Menu error"
                      : "Select item"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {(menuQ.data?.items ?? []).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {menuQ.error && (
              <p className="text-xs text-destructive">{(menuQ.error as Error).message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>End date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <div className="md:col-span-2 lg:col-span-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Compares against the same window 364 days earlier (week-aligned). Max 45 days per window.
            </p>
            <Button
              onClick={() => runMut.mutate()}
              disabled={!locationId || !itemId || runMut.isPending}
            >
              {runMut.isPending ? "Analyzing…" : "Run analysis"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {runMut.isPending && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Pulling orders from POS… this can take a minute for large windows.
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Units sold"
              value={result.current.units_sold.toString()}
              prior={`vs ${result.prior.units_sold} LY`}
              delta={result.current.units_sold - result.prior.units_sold}
            />
            <MetricCard
              label="Attach rate"
              value={fmtPct(result.current.attach_rate)}
              prior={`vs ${fmtPct(result.prior.attach_rate)} LY`}
              delta={result.current.attach_rate - result.prior.attach_rate}
              suffix="pp"
            />
            <MetricCard
              label="Avg check w/ item"
              value={fmtMoney(result.current.avg_check_with)}
              prior={`w/o: ${fmtMoney(result.current.avg_check_without)}`}
              delta={result.current.avg_check_with - result.current.avg_check_without}
              money
            />
            <MetricCard
              label="Add-on revenue"
              value={fmtMoney(result.current.addon_revenue)}
              prior={`vs ${fmtMoney(result.prior.addon_revenue)} LY`}
              delta={result.current.addon_revenue - result.prior.addon_revenue}
              money
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Units sold trend</CardTitle>
              <CardDescription>
                {result.item_name} — campaign window vs same window last year
              </CardDescription>
            </CardHeader>
            <CardContent style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="prior" name="Last year" fill="hsl(var(--muted-foreground))" />
                  <Bar dataKey="current" name="Campaign" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top co-purchased items</CardTitle>
              <CardDescription>
                Items most often appearing on the same check as {result.item_name} during the campaign window.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.current.co_items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No co-purchases found in this window.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Checks</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Attach rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.current.co_items.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{c.checks}</TableCell>
                        <TableCell className="text-right">{c.units}</TableCell>
                        <TableCell className="text-right">{fmtPct(c.attach_rate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  prior,
  delta,
  suffix,
  money,
}: {
  label: string;
  value: string;
  prior: string;
  delta: number;
  suffix?: string;
  money?: boolean;
}) {
  const positive = delta >= 0;
  const deltaStr = money
    ? `${positive ? "+" : ""}${fmtMoney(delta)}`
    : `${positive ? "+" : ""}${delta.toFixed(1)}${suffix ?? ""}`;
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold mt-1">{value}</p>
        <p className={`text-xs mt-1 ${positive ? "text-emerald-600" : "text-destructive"}`}>
          {deltaStr}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{prior}</p>
      </CardContent>
    </Card>
  );
}
