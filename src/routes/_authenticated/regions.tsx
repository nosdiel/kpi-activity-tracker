import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/regions")({
  head: () => ({ meta: [{ title: "Regions — NiNi KPI" }] }),
  component: RegionsPage,
});

type RegionRow = { id: string; name: string };

function RegionsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string }>({ name: "" });

  const q = useQuery({
    queryKey: ["regions", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("regions").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as RegionRow[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (f: { id?: string; name: string }) => {
      const name = f.name.trim();
      if (!name) throw new Error("Name is required");
      if (f.id) {
        const { error } = await supabase.from("regions").update({ name }).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("regions").insert({ name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Region updated" : "Region added");
      setOpen(false);
      setForm({ name: "" });
      qc.invalidateQueries({ queryKey: ["regions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("regions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Region deleted");
      qc.invalidateQueries({ queryKey: ["regions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Regions</h1>
          <p className="text-sm text-muted-foreground mt-1">Define the regions you can assign to locations.</p>
        </div>
        <Button onClick={() => { setForm({ name: "" }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New region
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
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-sm text-muted-foreground text-center py-8">
                  No regions yet. Click "New region" to add one.
                </TableCell>
              </TableRow>
            ) : (
              (q.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setForm({ id: row.id, name: row.name }); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => delMut.mutate(row.id)}>
                      <Trash2 className="h-4 w-4" />
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
            <DialogTitle>{form.id ? "Edit region" : "New region"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }}
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
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
