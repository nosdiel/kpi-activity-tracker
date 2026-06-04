import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({ meta: [{ title: "Role Permissions — NiNi KPI" }] }),
  component: PermissionsPage,
});

const SECTIONS = [
  { key: "daily_sales", label: "Daily Sales" },
  { key: "weekly_pnl", label: "Weekly PNL" },
  { key: "bonus_calc", label: "Bonus Calculator" },
  { key: "targets", label: "Targets" },
  { key: "locations", label: "Locations" },
  { key: "desserts", label: "Dessert of Month" },
  { key: "square", label: "Square Sync" },
  { key: "toast", label: "Toast Sync" },
  { key: "users", label: "Users" },
  { key: "role_permissions", label: "Role Permissions" },
  { key: "who_to_call", label: "Who To Call" },
] as const;

const ROLES = [
  { key: "admin", label: "Admin" },
  { key: "regional_manager", label: "Regional Manager" },
  { key: "store_manager", label: "Store Manager" },
] as const;

type PermRow = { role: string; section: string };

function PermissionsPage() {
  const qc = useQueryClient();

  const permsQ = useQuery({
    queryKey: ["role_permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("role,section");
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });

  const allowed = new Set(
    (permsQ.data ?? []).map((r) => `${r.role}:${r.section}`),
  );

  const toggleMut = useMutation({
    mutationFn: async ({ role, section, on }: { role: string; section: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role, section });
        if (error && !String(error.message).includes("duplicate")) throw error;
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role", role)
          .eq("section", section);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role_permissions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Role Permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which sections each role can see and access. Super Admin always has full access.
        </p>
      </div>

      <Card>
        <CardHeader className="sr-only">
          <CardTitle>Permissions</CardTitle>
          <CardDescription>Toggle access by role.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {permsQ.error ? (
            <p className="p-4 text-sm text-destructive">{(permsQ.error as Error).message}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left font-semibold">Section</th>
                    {ROLES.map((r) => (
                      <th key={r.key} className="px-4 py-3 text-center font-semibold text-muted-foreground">
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SECTIONS.map((s) => (
                    <tr key={s.key} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{s.label}</td>
                      {ROLES.map((r) => {
                        const isOn = allowed.has(`${r.key}:${s.key}`);
                        return (
                          <td key={r.key} className="px-4 py-3 text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={isOn}
                                disabled={toggleMut.isPending}
                                onCheckedChange={(v) =>
                                  toggleMut.mutate({
                                    role: r.key,
                                    section: s.key,
                                    on: Boolean(v),
                                  })
                                }
                                className="h-5 w-5 rounded-full data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
