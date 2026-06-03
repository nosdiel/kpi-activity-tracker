import { createFileRoute } from "@tanstack/react-router";
import { GenericTable } from "@/components/GenericTable";

export const Route = createFileRoute("/_authenticated/targets")({
  head: () => ({ meta: [{ title: "Weekly Targets — NiNi KPI" }] }),
  component: () => (
    <GenericTable
      table="weekly_targets"
      title="Weekly Targets"
      description="Sales / customer / dessert targets per location per week."
      template={{
        location_id: "<uuid>",
        week_start_date: new Date().toISOString().slice(0, 10),
        sales_target: 0,
        customer_target: 0,
        dessert_target: 0,
      }}
      orderBy="week_start_date"
    />
  ),
});
