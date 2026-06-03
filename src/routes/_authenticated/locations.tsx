import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/locations")({
  head: () => ({ meta: [{ title: "Locations — NiNi KPI" }] }),
  component: LocationsPage,
});

type LocationRow = {
  id: string;
  name: string;
  active: boolean | null;
  [k: string]: unknown;
};

function LocationsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<LocationRow | null>(null);

  const q = useQuery({
    queryKey: ["locations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as LocationRow[];
    },
  });

  const createMut = useMutation({
    mutationFn: async (payload: { name: string }) => {
      const { error } = await supabase.from("locations").insert({ name: payload.name, active: true });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Location added"); setName(""); qc.invalidateQueries({ queryKey: ["locations"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async (row: LocationRow) => {
      const { error } = await supabase.from("locations").update({ name: row.name, active: row.active }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setEditing(null); qc.invalidateQueries({ queryKey: ["locations"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Locations</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a location</CardTitle>
          <CardDescription>Locations enable per-store sales, targets, and P&L tracking.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-3"
            onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMut.mutate({ name: name.trim() }); }}
          >
            <Input placeholder="e.g. NiNi Downtown" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? "Adding..." : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All locations</CardTitle>
          <CardDescription>{q.data?.length ?? 0} total</CardDescription>
        </CardHeader>
        <CardContent>
          {q.error ? (
            <p className="text-sm text-destructive">{(q.error as Error).message}</p>
          ) : q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (q.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No locations yet. Add one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[160px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data ?? []).map((row) => {
                  const isEditing = editing?.id === row.id;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        {isEditing ? (
                          <Input value={editing!.name} onChange={(e) => setEditing({ ...editing!, name: e.target.value })} />
                        ) : (
                          row.name
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={Boolean(isEditing ? editing!.active : row.active)}
                            onCheckedChange={(v) => {
                              if (isEditing) setEditing({ ...editing!, active: v });
                              else updateMut.mutate({ ...row, active: v });
                            }}
                          />
                          <Label className="text-xs text-muted-foreground">
                            {(isEditing ? editing!.active : row.active) ? "active" : "inactive"}
                          </Label>
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {isEditing ? (
                          <>
                            <Button size="sm" onClick={() => updateMut.mutate(editing!)} disabled={updateMut.isPending}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>Edit</Button>
                        )}
                      </TableCell>
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
