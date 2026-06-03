import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Cake,
  MapPin,
  ShieldCheck,
  FileBarChart,
  Calculator,
  Square as SquareIcon,
  Target,
  Utensils,
  Users,
  PhoneCall,
  Settings,
  LogOut,
} from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/desserts", label: "Desserts", icon: Cake },
  { to: "/locations", label: "Locations", icon: MapPin },
  { to: "/permissions", label: "Permissions", icon: ShieldCheck },
  { to: "/pnl", label: "P&L", icon: FileBarChart },
  { to: "/pnl-bonus", label: "Bonus Calculator", icon: Calculator },
  { to: "/square", label: "Square", icon: SquareIcon },
  { to: "/targets", label: "Targets", icon: Target },
  { to: "/toast", label: "Toast", icon: Utensils },
  { to: "/users", label: "Users", icon: Users },
  { to: "/who-to-call", label: "Who to Call", icon: PhoneCall },
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
    <div className="flex h-screen bg-background">
      <aside
        className="hidden w-60 shrink-0 p-4 md:flex md:flex-col md:sticky md:top-0 md:h-screen"
        style={{ backgroundColor: "#0a2a5e", color: "#ffffff" }}
      >
        <div className="mb-6 px-2">
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">NiNi</p>
          <h1 className="text-lg font-semibold text-white">KPI</h1>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
                activeProps={{
                  className:
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white bg-[#1e6fd9]",
                }}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 flex flex-col gap-1 border-t border-white/10 pt-3">
          <Link
            to="/settings"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            activeProps={{
              className:
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white bg-[#1e6fd9]",
            }}
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-3 text-white/80 hover:bg-white/10 hover:text-white"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-6 md:p-10">
        <Outlet />
      </main>
    </div>
  );
}
