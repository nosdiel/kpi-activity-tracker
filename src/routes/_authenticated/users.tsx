import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users — NiNi KPI" }] }),
  component: UsersPage,
});

function UsersPage() {
  const profilesQ = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const rolesQ = useQuery({
    queryKey: ["user_roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id,role");
      if (error) throw error;
      return data ?? [];
    },
  });

  const locsQ = useQuery({
    queryKey: ["user_locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_locations").select("user_id,location_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const locationsQ = useQuery({
    queryKey: ["locations", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id,name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const locName = new Map((locationsQ.data ?? []).map((l: { id: string; name: string }) => [l.id, l.name]));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">Profiles, roles, and location assignments. Manage assignments on the Permissions page.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>{profilesQ.data?.length ?? 0} users</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {profilesQ.error ? (
            <p className="text-sm text-destructive">{(profilesQ.error as Error).message}</p>
          ) : profilesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (profilesQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No users visible. RLS may be restricting this list to admins.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Locations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profilesQ.data ?? []).map((p) => {
                  const uid = String(p.id ?? p.user_id ?? "");
                  const roles = (rolesQ.data ?? []).filter((r) => r.user_id === uid).map((r) => r.role).join(", ") || "—";
                  const locs = (locsQ.data ?? []).filter((r) => r.user_id === uid).map((r) => locName.get(r.location_id) ?? r.location_id).join(", ") || "—";
                  const label = String(p.email ?? p.display_name ?? p.full_name ?? uid.slice(0, 8));
                  return (
                    <TableRow key={uid}>
                      <TableCell>{label}</TableCell>
                      <TableCell className="text-xs">{roles}</TableCell>
                      <TableCell className="text-xs">{locs}</TableCell>
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
