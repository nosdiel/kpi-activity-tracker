import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createUserWithRole, setUserRole, deleteUser } from "@/lib/api/users.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users — NiNi KPI" }] }),
  component: UsersPage,
});

const ROLES = ["super_admin", "admin", "regional_manager", "store_manager"] as const;
type Role = (typeof ROLES)[number];

function UsersPage() {
  const qc = useQueryClient();
  const createFn = useServerFn(createUserWithRole);
  const setRoleFn = useServerFn(setUserRole);
  const deleteFn = useServerFn(deleteUser);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    display_name: "",
    password: "",
    role: "store_manager" as Role,
    send_invite: true,
  });

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["profiles"] });
    qc.invalidateQueries({ queryKey: ["user_roles"] });
  };

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          email: form.email.trim(),
          display_name: form.display_name.trim() || undefined,
          password: form.send_invite ? undefined : form.password || undefined,
          role: form.role,
          send_invite: form.send_invite,
        },
      }),
    onSuccess: () => {
      toast.success(form.send_invite ? "Invite sent" : "User created");
      setOpen(false);
      setForm({ email: "", display_name: "", password: "", role: "store_manager", send_invite: true });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: ({ target_user_id, role }: { target_user_id: string; role: Role }) =>
      setRoleFn({ data: { target_user_id, role } }),
    onSuccess: () => {
      toast.success("Role updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (target_user_id: string) => deleteFn({ data: { target_user_id } }),
    onSuccess: () => {
      toast.success("User deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add team members and assign their role.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add user</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                Create an account and assign a role. Admin access required.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate();
              }}
            >
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Display name (optional)</Label>
                <Input
                  value={form.display_name}
                  onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="invite"
                  type="checkbox"
                  checked={form.send_invite}
                  onChange={(e) => setForm((f) => ({ ...f, send_invite: e.target.checked }))}
                />
                <Label htmlFor="invite" className="cursor-pointer">
                  Send email invite (user sets their own password)
                </Label>
              </div>
              {!form.send_invite && (
                <div className="space-y-2">
                  <Label>Temporary password</Label>
                  <Input
                    type="text"
                    minLength={8}
                    required
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending ? "Saving..." : "Create user"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
            <p className="text-sm text-muted-foreground">
              No users visible. RLS may be restricting this list to admins.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profilesQ.data ?? []).map((p) => {
                  const uid = String(p.id ?? p.user_id ?? "");
                  const currentRole =
                    ((rolesQ.data ?? []).find((r) => r.user_id === uid)?.role as Role) ??
                    undefined;
                  const label = String(
                    p.email ?? p.display_name ?? p.full_name ?? uid.slice(0, 8)
                  );
                  return (
                    <TableRow key={uid}>
                      <TableCell>{label}</TableCell>
                      <TableCell>
                        <Select
                          value={currentRole ?? ""}
                          onValueChange={(v) =>
                            roleMut.mutate({ target_user_id: uid, role: v as Role })
                          }
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="No role" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Delete ${label}?`)) deleteMut.mutate(uid);
                          }}
                        >
                          Delete
                        </Button>
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
