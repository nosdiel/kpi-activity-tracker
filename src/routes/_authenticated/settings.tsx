import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage your account and application preferences.
      </p>
      <div className="mt-6 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Settings options coming soon.
      </div>
    </div>
  );
}
