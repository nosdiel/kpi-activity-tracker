import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/toast")({
  head: () => ({ meta: [{ title: "Toast Sync — NiNi KPI" }] }),
  component: ToastPage,
});

function ToastPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Toast Sync</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Not yet connected</CardTitle>
          <CardDescription>Pull daily sales from Toast POS.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>To enable Toast import, you'll need:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Toast Client ID</strong> and <strong>Client Secret</strong> (from Toast → Integrations → API Access)</li>
            <li><strong>Restaurant GUID(s)</strong> per NiNi location</li>
          </ul>
          <p>Ask me to "wire up Toast import" and I'll add the server function and credential storage.</p>
        </CardContent>
      </Card>
    </div>
  );
}
