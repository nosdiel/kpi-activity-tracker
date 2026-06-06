import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/locations")({
  head: () => ({ meta: [{ title: "Locations — NiNi KPI" }] }),
  component: LocationsPage,
});

type LocationRow = {
  id: string;
  name: string;
  region: string | null;
  timezone: string | null;
  address: string | null;
  active: boolean | null;
  payroll_pct_of_sales: number | null;
  food_cost_pct_of_sales: number | null;
  paper_goods_pct_of_sales: number | null;
};

type FormState = {
  id?: string;
  name: string;
  region: string;
  timezone: string;
  address: string;
  active: boolean;
  payroll_pct_of_sales: string;
  food_cost_pct_of_sales: string;
  paper_goods_pct_of_sales: string;
};

const emptyForm: FormState = {
  name: "",
  region: "",
  timezone: "America/New_York",
  address: "",
  active: true,
  payroll_pct_of_sales: "",
  food_cost_pct_of_sales: "",
  paper_goods_pct_of_sales: "",
};

function LocationsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const q = useQuery({
    queryKey: ["locations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id,name,region,timezone,address,active,payroll_pct_of_sales,food_cost_pct_of_sales,paper_goods_pct_of_sales")
        .order("name");
      if (error) throw error;
      return (data ?? []) as LocationRow[];
    },
  });

  const regionsQ = useQuery({
    queryKey: ["regions", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("regions").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (f: FormState) => {
      const toNum = (s: string) => {
        const t = s.trim();
        if (t === "") return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
      };
      const payload = {
        name: f.name.trim(),
        region: f.region.trim() || null,
        timezone: f.timezone.trim() || null,
        address: f.address.trim() || null,
        active: f.active,
        payroll_pct_of_sales: toNum(f.payroll_pct_of_sales),
        food_cost_pct_of_sales: toNum(f.food_cost_pct_of_sales),
        paper_goods_pct_of_sales: toNum(f.paper_goods_pct_of_sales),
      };
      if (f.id) {
        const { error } = await supabase.from("locations").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("locations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Location updated" : "Location added");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location deleted");
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (row: LocationRow) => {
    setForm({
      id: row.id,
      name: row.name ?? "",
      region: row.region ?? "",
      timezone: row.timezone ?? "America/New_York",
      address: row.address ?? "",
      active: row.active ?? true,
      payroll_pct_of_sales: row.payroll_pct_of_sales == null ? "" : String(row.payroll_pct_of_sales),
      food_cost_pct_of_sales: row.food_cost_pct_of_sales == null ? "" : String(row.food_cost_pct_of_sales),
      paper_goods_pct_of_sales: row.paper_goods_pct_of_sales == null ? "" : String(row.paper_goods_pct_of_sales),
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Locations</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage restaurant and bakery locations.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> New location
        </Button>
      </div>

      {q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground text-center py-8">
                  No locations yet. Click "New location" to add one.
                </TableCell>
              </TableRow>
            ) : (
              (q.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.region ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.timezone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.address ?? "—"}</TableCell>
                  <TableCell>
                    {row.active ? (
                      <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{row.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes the location and any related data (sales, targets, etc.) that cascade from it. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMut.mutate(row.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit location" : "New location"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) saveMut.mutate(form); }}
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Region</Label>
                <Select
                  value={form.region || "__none__"}
                  onValueChange={(v) => setForm({ ...form, region: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={regionsQ.isLoading ? "Loading..." : "Select a region"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(regionsQ.data ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(regionsQ.data ?? []).length === 0 && !regionsQ.isLoading && (
                  <p className="text-xs text-muted-foreground">
                    No regions yet. Add them in Settings → Regions.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Payroll Goal (% of Sales)</Label>
                <Input
                  type="number" step="0.01" min="0" max="100" placeholder="e.g. 28.5"
                  value={form.payroll_pct_of_sales}
                  onChange={(e) => setForm({ ...form, payroll_pct_of_sales: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Food Cost Goal (% of Sales)</Label>
                <Input
                  type="number" step="0.01" min="0" max="100" placeholder="e.g. 30"
                  value={form.food_cost_pct_of_sales}
                  onChange={(e) => setForm({ ...form, food_cost_pct_of_sales: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Paper Goods Goal (% of Sales)</Label>
                <Input
                  type="number" step="0.01" min="0" max="100" placeholder="e.g. 3"
                  value={form.paper_goods_pct_of_sales}
                  onChange={(e) => setForm({ ...form, paper_goods_pct_of_sales: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Used in QTR Report: Goal = % × Actual Sales.</p>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
