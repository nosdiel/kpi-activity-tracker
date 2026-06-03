import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({ meta: [{ title: "Permissions — NiNi KPI" }] }),
  component: PermissionsPage,
});

const ROLES = ["super_admin", "admin", "regional_manager", "store_manager"] as const;

function PermissionsPage() {
  const qc = useQueryClient();
  const [roleForm, setRoleForm] = useState({ user_id: "", role: "store_manager" as typeof ROLES[number] });
  const [locForm, setLocForm] = useState({ user_id: "", location_id: "" });

  const locations = useQuery({
    queryKey: ["locations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const roles = useQuery({
    queryKey: ["user_roles", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const userLocs = useQuery({
    queryKey: ["user_locations", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_locations").select("*");
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const addRole = useMutation({
    mutationFn: async () => {
      if (!roleForm.user_id.trim()) throw new Error("user_id required");
      const { error } = await supabase.from("user_roles").insert({ user_id: roleForm.user_id.trim(), role: roleForm.role });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role granted"); qc.invalidateQueries({ queryKey: ["user_roles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", row.user_id as never).eq("role", row.role as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role removed"); qc.invalidateQueries({ queryKey: ["user_roles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLoc = useMutation({
    mutationFn: async () => {
      if (!locForm.user_id.trim() || !locForm.location_id) throw new Error("user_id and location required");
      const { error } = await supabase.from("user_locations").insert({ user_id: locForm.user_id.trim(), location_id: locForm.location_id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Location assigned"); qc.invalidateQueries({ queryKey: ["user_locations"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeLoc = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const { error } = await supabase.from("user_locations").delete().eq("user_id", row.user_id as never).eq("location_id", row.location_id as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["user_locations"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const locName = new Map((locations.data ?? []).map((l: { id: string; name: string }) => [l.id, l.name]));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Permissions</h1>
        <p className="text-sm text-muted-foreground mt-1">Assign roles and location access. Get a user's ID from the Users page or Supabase Auth dashboard.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Grant role</CardTitle>
            <CardDescription>Map a user to one of the app roles.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); addRole.mutate(); }}>
              <div className="space-y-2">
                <Label>User ID (UUID)</Label>
                <Input value={roleForm.user_id} onChange={(e) => setRoleForm((f) => ({ ...f, user_id: e.target.value }))} placeholder="00000000-0000-..." />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={roleForm.role} onValueChange={(v) => setRoleForm((f) => ({ ...f, role: v as typeof ROLES[number] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={addRole.isPending}>{addRole.isPending ? "Granting..." : "Grant role"}</Button>
            </form>

            <div className="mt-6">
              <Table>
                <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {(roles.data ?? []).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{String(r.user_id).slice(0, 8)}…</TableCell>
                      <TableCell>{String(r.role)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => removeRole.mutate(r)}>Remove</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assign location</CardTitle>
            <CardDescription>Give a user access to a specific location's data.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); addLoc.mutate(); }}>
              <div className="space-y-2">
                <Label>User ID (UUID)</Label>
                <Input value={locForm.user_id} onChange={(e) => setLocForm((f) => ({ ...f, user_id: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={locForm.location_id} onValueChange={(v) => setLocForm((f) => ({ ...f, location_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pick a location" /></SelectTrigger>
                  <SelectContent>
                    {(locations.data ?? []).map((l: { id: string; name: string }) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={addLoc.isPending}>{addLoc.isPending ? "Assigning..." : "Assign"}</Button>
            </form>

            <div className="mt-6">
              <Table>
                <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Location</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {(userLocs.data ?? []).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{String(r.user_id).slice(0, 8)}…</TableCell>
                      <TableCell>{locName.get(String(r.location_id)) ?? String(r.location_id).slice(0, 8)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => removeLoc.mutate(r)}>Remove</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
