import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NiNi - KPI" },
      { name: "description", content: "Daily Sales Activity KPI dashboard" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="space-y-3">
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">NiNi</p>
        <h1 className="text-5xl font-bold tracking-tight text-foreground">KPI Dashboard</h1>
        <p className="max-w-md text-muted-foreground">
          Daily sales activity, P&amp;L, targets, and ops — all in one place.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          to="/auth"
          className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign in
        </Link>
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium hover:bg-accent"
        >
          Open dashboard
        </Link>
      </div>
    </div>
  );
}
