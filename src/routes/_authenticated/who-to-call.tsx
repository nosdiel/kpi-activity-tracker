import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/who-to-call")({
  head: () => ({ meta: [{ title: "Who to Call — NiNi KPI" }] }),
  component: WhoToCallPage,
});

type VendorRow = {
  id: string;
  location_id: string | null;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  notes: string | null;
  active: boolean | null;
};

type Location = { id: string; name: string };

type FormState = {
  id?: string;
  location_id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  category: string;
  notes: string;
  active: boolean;
};

const emptyForm: FormState = {
  location_id: "",
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  category: "",
  notes: "",
  active: true,
};

function WhoToCallPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filterLoc, setFilterLoc] = useState<string>("all");

  const locationsQ = useQuery({
    queryKey: ["locations-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id,name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Location[];
    },
  });

  const q = useQuery({
    queryKey: ["vendor-contacts", filterLoc],
    queryFn: async () => {
      let qb = supabase.from("vendor_contacts").select("*").order("name");
      if (filterLoc !== "all") qb = qb.eq("location_id", filterLoc);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as VendorRow[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        location_id: f.location_id || null,
        name: f.name.trim(),
        contact_person: f.contact_person.trim() || null,
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        category: f.category.trim() || null,
        notes: f.notes.trim() || null,
        active: f.active,
      };
      if (f.id) {
        const { error } = await supabase.from("vendor_contacts").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vendor_contacts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Contact updated" : "Contact added");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["vendor-contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendor_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact deleted");
      qc.invalidateQueries({ queryKey: ["vendor-contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (row: VendorRow) => {
    setForm({
      id: row.id,
      location_id: row.location_id ?? "",
      name: row.name ?? "",
      contact_person: row.contact_person ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      category: row.category ?? "",
      notes: row.notes ?? "",
      active: row.active ?? true,
    });
    setOpen(true);
  };

  const locName = (id: string | null) =>
    id ? (locationsQ.data ?? []).find((l) => l.id === id)?.name ?? "—" : "All locations";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Who to Call</h1>
          <p className="text-sm text-muted-foreground mt-1">Vendor and emergency contacts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterLoc} onValueChange={setFilterLoc}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {(locationsQ.data ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> New contact
          </Button>
        </div>
      </div>

      {q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-sm text-muted-foreground text-center py-8">
                  No contacts yet. Click "New contact" to add one.
                </TableCell>
              </TableRow>
            ) : (
              (q.data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.category ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.contact_person ?? "—"}</TableCell>
                  <TableCell>
                    {row.phone ? (
                      <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 hover:underline">
                        <Phone className="h-3 w-3" /> {row.phone}
                      </a>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {row.email ? (
                      <a href={`mailto:${row.email}`} className="inline-flex items-center gap-1 hover:underline">
                        <Mail className="h-3 w-3" /> {row.email}
                      </a>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{locName(row.location_id)}</TableCell>
                  <TableCell>
                    {row.active ? (
                      <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete contact "${row.name}"?`)) deleteMut.mutate(row.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit contact" : "New contact"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) saveMut.mutate(form); }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus required />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Plumber, Produce, IT"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contact person</Label>
              <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={form.location_id || "__none__"}
                onValueChange={(v) => setForm({ ...form, location_id: v === "__none__" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— All locations —</SelectItem>
                  {(locationsQ.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
