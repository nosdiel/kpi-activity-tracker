import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Props = {
  table: string;
  title: string;
  description?: string;
  /** initial JSON template shown in the new-row textarea */
  template?: Record<string, unknown>;
  /** order rows by this column desc */
  orderBy?: string;
  /** primary key column for deletes (default: id) */
  pk?: string;
};

export function GenericTable({ table, title, description, template, orderBy, pk = "id" }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(JSON.stringify(template ?? {}, null, 2));
  const [showAdd, setShowAdd] = useState(false);

  const q = useQuery({
    queryKey: [table, "list", orderBy],
    queryFn: async () => {
      let query = supabase.from(table).select("*").limit(200);
      if (orderBy) query = query.order(orderBy, { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const columns = useMemo(() => {
    const set = new Set<string>();
    (q.data ?? []).forEach((row) => Object.keys(row).forEach((k) => set.add(k)));
    return [...set];
  }, [q.data]);

  const insertMut = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from(table).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Row added");
      setShowAdd(false);
      setDraft(JSON.stringify(template ?? {}, null, 2));
      qc.invalidateQueries({ queryKey: [table, "list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: unknown) => {
      const { error } = await supabase.from(table).delete().eq(pk, id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Row deleted");
      qc.invalidateQueries({ queryKey: [table, "list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAdd = () => {
    try {
      const parsed = JSON.parse(draft);
      insertMut.mutate(parsed);
    } catch {
      toast.error("Invalid JSON");
    }
  };

  const fmt = (v: unknown) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return JSON.stringify(v);
    if (typeof v === "boolean") return v ? "yes" : "no";
    return String(v);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">NiNi - KPI</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        <Button onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? "Cancel" : "Add row"}
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardHeader>
            <CardTitle>New row</CardTitle>
            <CardDescription>Edit JSON, then submit. Unknown fields will be rejected by the database.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              className="font-mono text-xs min-h-[180px]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button onClick={handleAdd} disabled={insertMut.isPending}>
              {insertMut.isPending ? "Saving..." : "Save"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rows</CardTitle>
          <CardDescription>{q.data?.length ?? 0} record(s)</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {q.error ? (
            <p className="text-sm text-destructive">{(q.error as Error).message}</p>
          ) : q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (q.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => <TableHead key={c}>{c}</TableHead>)}
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data ?? []).map((row, i) => (
                  <TableRow key={String(row[pk] ?? i)}>
                    {columns.map((c) => (
                      <TableCell key={c} className="max-w-[280px] truncate text-xs">
                        {fmt(row[c])}
                      </TableCell>
                    ))}
                    <TableCell>
                      {row[pk] !== undefined && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Delete this row?")) deleteMut.mutate(row[pk]);
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
