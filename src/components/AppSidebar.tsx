import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  BarChart3, Target, FileBarChart, CalendarRange,
  Award, Phone, LogOut, Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/targets", label: "Targets", icon: Target },
  { to: "/pnl", label: "P&L Weekly", icon: FileBarChart },
  { to: "/pnl-qtr", label: "P&L Quarterly", icon: CalendarRange },
  { to: "/pnl-bonus", label: "Bonus Calculator", icon: Award },
  { to: "/who-to-call", label: "Who to Call", icon: Phone },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const settingsPaths = ["/settings", "/desserts", "/square", "/toast", "/users", "/permissions", "/locations"];

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="px-5 py-5 border-b">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">NiNi</p>
        <p className="text-lg font-semibold">KPI Dashboard</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = to === "/settings" ? settingsPaths.includes(pathname) : pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={handleLogout}
        className="m-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </aside>
  );
}
