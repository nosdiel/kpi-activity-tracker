import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/desserts")({
  head: () => ({ meta: [{ title: "Desserts — NiNi KPI" }] }),
  component: dessertsPage,
});

function dessertsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Desserts</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Desserts</CardTitle>
          <CardDescription>Stub page — wire up server functions next.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Read/write through <code>createServerFn</code> handlers using <code>requireSupabaseAuth</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
