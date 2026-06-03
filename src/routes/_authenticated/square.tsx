import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/square")({
  head: () => ({ meta: [{ title: "Square Sync — NiNi KPI" }] }),
  component: SquarePage,
});

function SquarePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Square Sync</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Not yet connected</CardTitle>
          <CardDescription>Hook this up to pull daily sales from Square automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>To enable Square import, you'll need to provide:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Square Access Token</strong> (from Square Developer Dashboard → Applications → Credentials)</li>
            <li><strong>Square Location ID(s)</strong> (one per NiNi location you want to sync)</li>
          </ul>
          <p>Ask me to "wire up Square import" and I'll create a server function that pulls yesterday's sales for each linked location and upserts them into <code>daily_sales</code>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
