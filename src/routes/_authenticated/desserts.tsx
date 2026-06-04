import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listPosMenuItems } from "@/lib/api/pos-sync.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Check, ChevronsUpDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/desserts")({
  head: () => ({ meta: [{ title: "Trackable Items — NiNi KPI" }] }),
  component: TrackableItemsPage,
});

type ItemRow = {
  id: string;
  name: string;
  location_id: string;
  active_from: string | null;
  active_to: string | null;
  pos_product: string | null;
};

type LocationRow = { id: string; name: string };

type FormState = {
  id?: string;
  name: string;
  location_id: string;
  active_from: string;
  active_to: string;
  pos_product: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  location_id: "",
  active_from: "",
  active_to: "",
  pos_product: "",
};

function isActive(from: string | null, to: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  if (from && today < from) return false;
  if (to && today > to) return false;
  return true;
}

function TrackableItemsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const locationsQ = useQuery({
    queryKey: ["locations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as LocationRow[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ["trackable_items", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trackable_items")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const locName = useMemo(() => {
    const m = new Map<string, string>();
    (locationsQ.data ?? []).forEach((l) => m.set(l.id, l.name));
    return m;
  }, [locationsQ.data]);

  const listMenuItems = useServerFn(listPosMenuItems);
  const [posOpen, setPosOpen] = useState(false);
  const menuQ = useQuery({
    queryKey: ["pos-menu-items", form.location_id],
    queryFn: () => listMenuItems({ data: { location_id: form.location_id } }),
    enabled: open && !!form.location_id,
    staleTime: 5 * 60_000,
  });
  const menuItems = menuQ.data?.items ?? [];


  const saveMut = useMutation({
    mutationFn: async (f: FormState) => {
      const name = f.name.trim();
      if (!name) throw new Error("Name is required");
      if (!f.location_id) throw new Error("Location is required");
      const payload = {
        name,
        location_id: f.location_id,
        active_from: f.active_from || null,
        active_to: f.active_to || null,
        pos_product: f.pos_product.trim() || null,
      };
      if (f.id) {
        const { error } = await supabase.from("trackable_items").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("trackable_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Item updated" : "Item added");
      setOpen(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["trackable_items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trackable_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item deleted");
      qc.invalidateQueries({ queryKey: ["trackable_items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setForm(EMPTY_FORM); setOpen(true); };
  const openEdit = (r: ItemRow) => {
    setForm({
      id: r.id,
      name: r.name,
      location_id: r.location_id,
      active_from: r.active_from ?? "",
      active_to: r.active_to ?? "",
      pos_product: r.pos_product ?? "",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Trackable Items</h1>
          <p className="text-sm text-muted-foreground mt-1">Items tracked per location with active windows.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> New item
        </Button>
      </div>

      {itemsQ.error ? (
        <p className="text-sm text-destructive">{(itemsQ.error as Error).message}</p>
      ) : itemsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Active window</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(itemsQ.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground text-center py-8">
                  No items yet. Click "New item" to add one.
                </TableCell>
              </TableRow>
            ) : (
              (itemsQ.data ?? []).map((row) => {
                const active = isActive(row.active_from, row.active_to);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{locName.get(row.location_id) ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.active_from ?? "—"} → {row.active_to ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={active ? "default" : "secondary"}>
                        {active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => delMut.mutate(row.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }}
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pick a location" /></SelectTrigger>
                <SelectContent>
                  {(locationsQ.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Active from</Label>
                <Input type="date" value={form.active_from} onChange={(e) => setForm({ ...form, active_from: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Active to</Label>
                <Input type="date" value={form.active_to} onChange={(e) => setForm({ ...form, active_to: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>POS product (optional)</Label>
              <Input
                value={form.pos_product}
                onChange={(e) => setForm({ ...form, pos_product: e.target.value })}
                placeholder="e.g. Chicken - Croquette"
              />
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
