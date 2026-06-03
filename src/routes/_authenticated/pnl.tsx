import { createFileRoute } from "@tanstack/react-router";
import { GenericTable } from "@/components/GenericTable";

export const Route = createFileRoute("/_authenticated/pnl")({
  head: () => ({ meta: [{ title: "P&L Weekly — NiNi KPI" }] }),
  component: () => (
    <GenericTable
      table="weekly_pnl"
      title="P&L — Weekly"
      description="Weekly profit & loss per location."
      template={{
        location_id: "<uuid>",
        week_start_date: new Date().toISOString().slice(0, 10),
        revenue: 0,
        cogs: 0,
        labor: 0,
        operating_expenses: 0,
      }}
      orderBy="week_start_date"
    />
  ),
});
