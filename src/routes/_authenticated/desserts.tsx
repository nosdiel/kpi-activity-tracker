import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/desserts")({
  head: () => ({ meta: [{ title: "Daily Sales Entry — NiNi KPI" }] }),
  component: DailyEntryPage,
});

function todayISO() { return new Date().toISOString().slice(0, 10); }

function DailyEntryPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    location_id: "",
    business_date: todayISO(),
    actual_sales: "",
    actual_customer_count: "",
    last_year_sales: "",
    last_year_customer_count: "",
    dessert_count: "",
  });

  const locationsQ = useQuery({
    queryKey: ["locations", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id,name").eq("active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const insertMut = useMutation({
    mutationFn: async () => {
      if (!form.location_id) throw new Error("Pick a location");
      const payload: Record<string, unknown> = {
        location_id: form.location_id,
        business_date: form.business_date,
        actual_sales: Number(form.actual_sales) || 0,
        actual_customer_count: Number(form.actual_customer_count) || 0,
        last_year_sales: Number(form.last_year_sales) || 0,
        last_year_customer_count: Number(form.last_year_customer_count) || 0,
        dessert_count: Number(form.dessert_count) || 0,
        source: "manual",
      };
      // Upsert by (location_id, business_date) so re-entering edits in place.
      const { error } = await supabase.from("daily_sales").upsert(payload, {
        onConflict: "location_id,business_date",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Daily sales saved");
      setForm((f) => ({
        ...f,
        actual_sales: "", actual_customer_count: "",
        last_year_sales: "", last_year_customer_count: "",
        dessert_count: "",
      }));
      qc.invalidateQueries({ queryKey: ["daily_sales"] });
      qc.invalidateQueries({ queryKey: ["recent_sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recentQ = useQuery({
    queryKey: ["recent_sales", form.location_id],
    queryFn: async () => {
      let q = supabase.from("daily_sales")
        .select("business_date,actual_sales,actual_customer_count,dessert_count,location_id")
        .order("business_date", { ascending: false })
        .limit(10);
      if (form.location_id) q = q.eq("location_id", form.location_id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Daily Sales Entry</h1>
        <p className="text-sm text-muted-foreground mt-1">Record actuals + LY comparison for any date and location. Re-entering the same date overwrites.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>New entry</CardTitle></CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => { e.preventDefault(); insertMut.mutate(); }}
          >
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={form.location_id} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Pick a location" /></SelectTrigger>
                <SelectContent>
                  {(locationsQ.data ?? []).map((l: { id: string; name: string }) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Business date</Label>
              <Input type="date" value={form.business_date} onChange={set("business_date")} />
            </div>
            <div />
            <div className="space-y-2"><Label>Actual sales ($)</Label><Input inputMode="decimal" value={form.actual_sales} onChange={set("actual_sales")} /></div>
            <div className="space-y-2"><Label>Actual customers</Label><Input inputMode="numeric" value={form.actual_customer_count} onChange={set("actual_customer_count")} /></div>
            <div className="space-y-2"><Label>Desserts sold</Label><Input inputMode="numeric" value={form.dessert_count} onChange={set("dessert_count")} /></div>
            <div className="space-y-2"><Label>Last year sales ($)</Label><Input inputMode="decimal" value={form.last_year_sales} onChange={set("last_year_sales")} /></div>
            <div className="space-y-2"><Label>Last year customers</Label><Input inputMode="numeric" value={form.last_year_customer_count} onChange={set("last_year_customer_count")} /></div>
            <div className="flex items-end">
              <Button type="submit" disabled={insertMut.isPending} className="w-full">
                {insertMut.isPending ? "Saving..." : "Save entry"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent entries</CardTitle>
          <CardDescription>Last 10 records{form.location_id ? " for this location" : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          {recentQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (recentQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Date</th>
                  <th className="text-right">Sales</th>
                  <th className="text-right">Customers</th>
                  <th className="text-right">Desserts</th>
                </tr>
              </thead>
              <tbody>
                {(recentQ.data ?? []).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2">{r.business_date as string}</td>
                    <td className="text-right">${Number(r.actual_sales).toLocaleString()}</td>
                    <td className="text-right">{Number(r.actual_customer_count).toLocaleString()}</td>
                    <td className="text-right">{Number(r.dessert_count).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
