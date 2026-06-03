import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/desserts", label: "Desserts" },
  { to: "/locations", label: "Locations" },
  { to: "/permissions", label: "Permissions" },
  { to: "/pnl", label: "P&L" },
  { to: "/pnl-bonus", label: "Bonus Calculator" },
  { to: "/pnl-qtr", label: "P&L Qtr" },
  { to: "/square", label: "Square" },
  { to: "/targets", label: "Targets" },
  { to: "/toast", label: "Toast" },
  { to: "/users", label: "Users" },
  { to: "/who-to-call", label: "Who to Call" },
] as const;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar p-4 md:flex md:flex-col">
        <div className="mb-6 px-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">NiNi</p>
          <h1 className="text-lg font-semibold text-sidebar-foreground">KPI</h1>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "rounded-md px-3 py-2 text-sm bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Button variant="ghost" size="sm" className="mt-4" onClick={handleSignOut}>
          Sign out
        </Button>
      </aside>
      <main className="flex-1 overflow-x-auto p-6 md:p-10">
        <Outlet />
      </main>
    </div>
  );
}
