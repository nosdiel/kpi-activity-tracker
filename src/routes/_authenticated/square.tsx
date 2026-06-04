import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  syncSquare,
  syncToast,
  updateLocationPosCredentials,
  getLocationsPosStatus,
  backfillActualSales,
  backfillSalesRange,
  clearSyncErrors,
} from "@/lib/api/pos-sync.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/square")({
  head: () => ({ meta: [{ title: "Square Sync — NiNi KPI" }] }),
  component: () => <PosPage source="square" />,
});

type LocStatus = {
  id: string;
  name: string;
  provider: "square" | "toast" | null;
  square_location_id: string | null;
  square_token_set: boolean;
  toast_credential_name: string | null;
  toast_api_url: string | null;
  toast_restaurant_guid: string | null;
  toast_client_id: string | null;
  toast_secret_set: boolean;
};

const TOAST_DEFAULT_URL = "https://ws-api.toasttab.com";

export function PosPage({ source }: { source: "square" | "toast" }) {
  const qc = useQueryClient();
  const syncFn = useServerFn(source === "square" ? syncSquare : syncToast);
  const updateCreds = useServerFn(updateLocationPosCredentials);
  const statusFn = useServerFn(getLocationsPosStatus);
  const backfillFn = useServerFn(backfillActualSales);
  const backfillRangeFn = useServerFn(backfillSalesRange);
  const clearErrorsFn = useServerFn(clearSyncErrors);
  const [date, setDate] = useState("");
  const [editing, setEditing] = useState<LocStatus | null>(null);
  const [form, setForm] = useState({
    square_location_id: "",
    square_access_token: "",
    toast_credential_name: "",
    toast_api_url: TOAST_DEFAULT_URL,
    toast_restaurant_guid: "",
    toast_client_id: "",
    toast_client_secret: "",
  });

  const locsQ = useQuery({
    queryKey: ["pos_status"],
    queryFn: () => statusFn() as Promise<LocStatus[]>,
  });

  const logsQ = useQuery({
    queryKey: ["pos_sync_log", source],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_sync_log")
        .select("*")
        .eq("source", source)
        .eq("status", "error")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data ?? [];
    },
  });

  const credsMut = useMutation({
    mutationFn: async (payload: any) => updateCreds({ data: payload }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["pos_status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMut = useMutation({
    mutationFn: async (location_id?: string) =>
      syncFn({ data: { business_date: date || undefined, location_id } }),
    onSuccess: (res: any) => {
      const ok = res.results.filter((r: any) => r.status === "ok").length;
      const err = res.results.length - ok;
      toast.success(`Synced ${ok} location(s)${err ? `, ${err} failed` : ""}`);
      qc.invalidateQueries({ queryKey: ["pos_sync_log"] });
      qc.invalidateQueries({ queryKey: ["dashboard-sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard-ly-sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const backfillMut = useMutation({
    mutationFn: async () => backfillFn() as Promise<{ scanned: number; updated: number }>,
    onSuccess: (res) => {
      toast.success(`Backfilled ${res.updated} row(s) (scanned ${res.scanned})`);
      qc.invalidateQueries({ queryKey: ["dashboard-sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard-ly-sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const backfillRangeMut = useMutation({
    mutationFn: async () =>
      backfillRangeFn({ data: { source, days: 365 } }) as Promise<{
        days: number;
        processed: number;
        inserted: number;
        errors: Array<{ location_id: string; business_date: string; message: string }>;
      }>,
    onSuccess: (res) => {
      const errCount = res.errors?.length ?? 0;
      toast.success(
        `Backfilled ${res.inserted} day(s) over ${res.days}${errCount ? `, ${errCount} failed` : ""}`
      );
      qc.invalidateQueries({ queryKey: ["pos_sync_log"] });
      qc.invalidateQueries({ queryKey: ["dashboard-sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard-ly-sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const title = source === "square" ? "Square Sync" : "Toast Sync";
  const idLabel = source === "square" ? "Square Location ID" : "Toast Restaurant GUID";
  const rows = (locsQ.data ?? []).filter(
    (l) => l.provider === source || (source === "square" ? l.square_location_id : l.toast_restaurant_guid)
  );

  const openEdit = (loc: LocStatus) => {
    setEditing(loc);
    setForm({
      square_location_id: loc.square_location_id ?? "",
      square_access_token: "",
      toast_credential_name: loc.toast_credential_name ?? "",
      toast_api_url: loc.toast_api_url ?? TOAST_DEFAULT_URL,
      toast_restaurant_guid: loc.toast_restaurant_guid ?? "",
      toast_client_id: loc.toast_client_id ?? "",
      toast_client_secret: "",
    });
  };

  const isReady = (loc: LocStatus) =>
    source === "square"
      ? Boolean(loc.square_location_id && loc.square_token_set)
      : Boolean(loc.toast_restaurant_guid && loc.toast_client_id && loc.toast_secret_set);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pull daily sales from {source === "square" ? "Square" : "Toast"} (production). Each
          location has its own API credentials.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Locations</CardTitle>
          <CardDescription>
            Add the {idLabel} and {source === "square" ? "access token" : "client ID + secret"} for
            each location that uses {source === "square" ? "Square" : "Toast"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Business date (defaults to yesterday)</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button onClick={() => syncMut.mutate(undefined)} disabled={syncMut.isPending}>
              {syncMut.isPending ? "Syncing..." : "Sync all"}
            </Button>
            <Button
              variant="outline"
              onClick={() => backfillMut.mutate()}
              disabled={backfillMut.isPending}
            >
              {backfillMut.isPending ? "Backfilling..." : "Backfill actual_sales"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => backfillRangeMut.mutate()}
              disabled={backfillRangeMut.isPending}
            >
              {backfillRangeMut.isPending ? "Backfilling 365 days..." : "Backfill last 365 days"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Only locations with complete credentials are synced.
            </p>
          </div>

          {locsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>{idLabel}</TableHead>
                  <TableHead>Credentials</TableHead>
                  <TableHead className="w-56 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(locsQ.data ?? []).map((loc) => {
                  const externalId =
                    source === "square" ? loc.square_location_id : loc.toast_restaurant_guid;
                  const ready = isReady(loc);
                  return (
                    <TableRow key={loc.id}>
                      <TableCell className="font-medium">{loc.name}</TableCell>
                      <TableCell className="text-xs">{externalId ?? "—"}</TableCell>
                      <TableCell>
                        {ready ? (
                          <Badge variant="default">Ready</Badge>
                        ) : externalId || (source === "toast" && loc.toast_client_id) ? (
                          <Badge variant="destructive">Incomplete</Badge>
                        ) : (
                          <Badge variant="secondary">Not set</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(loc)}>
                          {ready ? "Edit" : "Add credentials"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => syncMut.mutate(loc.id)}
                          disabled={syncMut.isPending || !ready}
                        >
                          Sync
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(logsQ.data ?? []).length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Sync errors</CardTitle>
              <CardDescription>Last 20 failed syncs.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                supabase
                  .from("pos_sync_log")
                  .delete()
                  .eq("source", source)
                  .eq("status", "error")
                  .then(({ error }) => {
                    if (error) toast.error(error.message);
                    else {
                      toast.success("Errors cleared");
                      qc.invalidateQueries({ queryKey: ["pos_sync_log"] });
                    }
                  });
              }}
            >
              Clear errors
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logsQ.data ?? []).map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">
                      {new Date(l.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">{l.business_date}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{l.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {l.total_cents != null ? `$${(l.total_cents / 100).toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                      {l.message ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}


      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {source === "square" ? "Square" : "Toast"} credentials — {editing?.name}
            </DialogTitle>
            <DialogDescription>
              Secrets are stored encrypted on the server and never returned to the browser. Leave
              a secret blank to keep the current value.
            </DialogDescription>
          </DialogHeader>

          {source === "square" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Square Location ID</Label>
                <Input
                  value={form.square_location_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, square_location_id: e.target.value }))
                  }
                  placeholder="L0123ABCDEFGH"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Square Access Token (production){" "}
                  {editing?.square_token_set && (
                    <span className="text-xs text-muted-foreground">— currently set</span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={form.square_access_token}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, square_access_token: e.target.value }))
                  }
                  placeholder="EAAA…"
                  autoComplete="off"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Credential set name</Label>
                <Input
                  value={form.toast_credential_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, toast_credential_name: e.target.value }))
                  }
                  placeholder="e.g. NiNi Manager"
                />
                <p className="text-xs text-muted-foreground">
                  Matches the credential set name in Toast Web (Integrations → API access).
                </p>
              </div>
              <div className="space-y-2">
                <Label>API access URL</Label>
                <Input
                  value={form.toast_api_url}
                  onChange={(e) => setForm((f) => ({ ...f, toast_api_url: e.target.value }))}
                  placeholder={TOAST_DEFAULT_URL}
                />
              </div>
              <div className="space-y-2">
                <Label>API access type</Label>
                <Input value="TOAST_MACHINE_CLIENT" readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label>Toast Restaurant GUID</Label>
                <Input
                  value={form.toast_restaurant_guid}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, toast_restaurant_guid: e.target.value }))
                  }
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Client ID</Label>
                <Input
                  value={form.toast_client_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, toast_client_id: e.target.value }))
                  }
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Client secret (production){" "}
                  {editing?.toast_secret_set && (
                    <span className="text-xs text-muted-foreground">— currently set</span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={form.toast_client_secret}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, toast_client_secret: e.target.value }))
                  }
                  autoComplete="off"
                  placeholder="Paste secret (leave blank to keep current)"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                if (!editing) return;
                const payload: any = { location_id: editing.id, provider: source };
                if (source === "square") {
                  payload.square_location_id = form.square_location_id;
                  if (form.square_access_token) payload.square_access_token = form.square_access_token;
                } else {
                  payload.toast_credential_name = form.toast_credential_name;
                  payload.toast_api_url = form.toast_api_url || TOAST_DEFAULT_URL;
                  payload.toast_restaurant_guid = form.toast_restaurant_guid;
                  payload.toast_client_id = form.toast_client_id;
                  if (form.toast_client_secret) payload.toast_client_secret = form.toast_client_secret;
                }
                credsMut.mutate(payload);
              }}
              disabled={credsMut.isPending}
            >
              {credsMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
