import { createFileRoute } from "@tanstack/react-router";
import { PosPage } from "./square";

export const Route = createFileRoute("/_authenticated/toast")({
  head: () => ({ meta: [{ title: "Toast Sync — NiNi KPI" }] }),
  component: () => <PosPage source="toast" />,
});
