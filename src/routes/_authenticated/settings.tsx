import { createFileRoute, Link } from "@tanstack/react-router";
import { IceCream, ArrowDownToLine, Utensils, Users, Shield, MapPin, Target, Globe } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const groups = [
  {
    title: "API Integrations",
    description: "Connect each location's POS so we can pull sales and other data.",
    items: [
      { to: "/square", label: "Square API", icon: ArrowDownToLine, description: "Configure Square credentials and sync sales by location." },
      { to: "/toast", label: "Toast API", icon: Utensils, description: "Configure Toast credentials and sync sales by location." },
    ],
  },
  {
    title: "Organization",
    description: "Manage who has access and what they can see.",
    items: [
      { to: "/users", label: "Users", icon: Users, description: "Invite team members and manage accounts." },
      { to: "/permissions", label: "Permissions", icon: Shield, description: "Assign roles and access levels." },
      { to: "/locations", label: "Locations", icon: MapPin, description: "Add, edit, and activate store locations." },
      { to: "/regions", label: "Regions", icon: Globe, description: "Define the regions you can assign to locations." },
    ],
  },
  {
    title: "Data",
    description: "Configure what gets tracked across the app.",
    items: [
      { to: "/targets", label: "Sales Target", icon: Target, description: "Set sales targets by location and period." },
      { to: "/desserts", label: "Trackable Items", icon: IceCream, description: "Manage the items tracked in daily sales activity." },
    ],
  },
] as const;

function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage integrations, access, and tracked data.
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{group.title}</h2>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group rounded-lg border bg-card p-5 transition-colors hover:border-primary hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-medium">{item.label}</span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{item.description}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
