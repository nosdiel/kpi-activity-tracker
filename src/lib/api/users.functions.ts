import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["super_admin", "admin", "regional_manager", "store_manager"] as const;

const CreateUserInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72).optional(),
  display_name: z.string().min(1).max(120).optional(),
  role: z.enum(ROLES),
  location_ids: z.array(z.string().uuid()).max(100).optional(),
  send_invite: z.boolean().optional(),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: admin role required");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);
    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      display_name: (u.user_metadata as { display_name?: string } | null)?.display_name ?? null,
      created_at: u.created_at,
    }));
  });

export const createUserWithRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateUserInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let newUserId: string;

    if (data.send_invite) {
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        data.email,
        { data: { display_name: data.display_name } }
      );
      if (error) throw new Error(error.message);
      newUserId = invited.user!.id;
    } else {
      const password = data.password ?? crypto.randomUUID() + "Aa1!";
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password,
        email_confirm: true,
        user_metadata: { display_name: data.display_name },
      });
      if (error) throw new Error(error.message);
      newUserId = created.user!.id;
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    if (data.location_ids && data.location_ids.length > 0) {
      const rows = data.location_ids.map((location_id) => ({ user_id: newUserId, location_id }));
      const { error: locErr } = await supabaseAdmin.from("user_locations").insert(rows);
      if (locErr) throw new Error(locErr.message);
    }

    return { user_id: newUserId, email: data.email };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      target_user_id: z.string().uuid(),
      role: z.enum(ROLES),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.target_user_id);
    if (delErr) throw new Error(delErr.message);

    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.target_user_id, role: data.role });
    if (insErr) throw new Error(insErr.message);

    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ target_user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.target_user_id === userId) throw new Error("Cannot delete yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.target_user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
