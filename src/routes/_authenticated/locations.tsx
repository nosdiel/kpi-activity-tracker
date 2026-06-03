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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil } from "lucide-react";
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
};

type FormState = {
  id?: string;
  name: string;
  region: string;
  timezone: string;
  address: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  region: "",
  timezone: "America/New_York",
  address: "",
  active: true,
};

function LocationsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const q = useQuery({
    queryKey: ["locations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as LocationRow[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        name: f.name.trim(),
        region: f.region.trim() || null,
        timezone: f.timezone.trim() || null,
        address: f.address.trim() || null,
        active: f.active,
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

  const openNew = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (row: LocationRow) => {
    setForm({
      id: row.id,
      name: row.name ?? "",
      region: row.region ?? "",
      timezone: row.timezone ?? "America/New_York",
      address: row.address ?? "",
      active: row.active ?? true,
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
              <TableHead className="w-[60px]"></TableHead>
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
                    <Button size="icon" variant="ghost" onClick={() => openEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
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
                <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
              </div>
            </div>
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
