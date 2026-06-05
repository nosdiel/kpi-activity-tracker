import { createFileRoute } from "@tanstack/react-router";
import { GenericTable } from "@/components/GenericTable";

export const Route = createFileRoute("/_authenticated/targets")({
  head: () => ({ meta: [{ title: "Weekly Targets — NiNi KPI" }] }),
  component: () => (
    <GenericTable
      table="weekly_targets"
      title="Weekly Targets"
      description="Set the sales target as a percentage over last year sales (e.g. 5 = +5% over LY)."
      template={{
        location_id: "<uuid>",
        fiscal_year: new Date().getUTCFullYear(),
        fiscal_week: 1,
        target_pct_over_ly: 0,
        customer_target: 0,
        dessert_target: 0,
      }}
      orderBy="fiscal_year"
    />
  ),
});
