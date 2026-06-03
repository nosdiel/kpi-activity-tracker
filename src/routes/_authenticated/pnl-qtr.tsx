import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/pnl-qtr")({
  head: () => ({ meta: [{ title: "Pnl Qtr — NiNi KPI" }] }),
  component: pnl_qtrPage,
});

function pnl_qtrPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pnl Qtr</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Pnl Qtr</CardTitle>
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
