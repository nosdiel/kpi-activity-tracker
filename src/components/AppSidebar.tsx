import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  BarChart3, MapPin, IceCream, Target, FileBarChart, CalendarRange,
  Award, Users, Shield, Phone, ArrowDownToLine, Utensils, LogOut,
  Settings, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const mainNav = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/targets", label: "Targets", icon: Target },
  { to: "/pnl", label: "P&L Weekly", icon: FileBarChart },
  { to: "/pnl-qtr", label: "P&L Quarterly", icon: CalendarRange },
  { to: "/pnl-bonus", label: "Bonus Calculator", icon: Award },
  { to: "/who-to-call", label: "Who to Call", icon: Phone },
] as const;

const settingsNav = [
  { to: "/desserts", label: "Trackable Items", icon: IceCream },
  { to: "/square", label: "Square API", icon: ArrowDownToLine },
  { to: "/toast", label: "Toast API", icon: Utensils },
  { to: "/users", label: "Users", icon: Users },
  { to: "/permissions", label: "Permissions", icon: Shield },
  { to: "/locations", label: "Locations", icon: MapPin },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const settingsActive = settingsNav.some((i) => pathname === i.to) || pathname === "/settings";
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const linkCls = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
    );

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="px-5 py-5 border-b">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">NiNi</p>
        <p className="text-lg font-semibold">KPI Dashboard</p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {mainNav.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={linkCls(pathname === to)}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}

        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          className={linkCls(settingsActive && !settingsOpen) + " w-full justify-between"}
        >
          <span className="flex items-center gap-3">
            <Settings className="h-4 w-4" />
            Settings
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", settingsOpen && "rotate-180")} />
        </button>
        {settingsOpen && (
          <div className="ml-3 mt-1 border-l border-border pl-2 space-y-0.5">
            {settingsNav.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className={linkCls(pathname === to)}>
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>
        )}
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
