import { createFileRoute } from "@tanstack/react-router";
import { GenericTable } from "@/components/GenericTable";

export const Route = createFileRoute("/_authenticated/who-to-call")({
  head: () => ({ meta: [{ title: "Who to Call — NiNi KPI" }] }),
  component: () => (
    <GenericTable
      table="vendor_contacts"
      title="Who to Call"
      description="Vendor and emergency contacts."
      template={{
        location_id: "<uuid-or-null>",
        vendor_name: "",
        contact_name: "",
        phone: "",
        email: "",
        category: "",
        notes: "",
      }}
      orderBy="vendor_name"
    />
  ),
});
