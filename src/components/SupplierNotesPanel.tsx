import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Plus, Pencil, Trash2, X, Save } from "lucide-react";
import { supplierNotesService, type SupplierNote } from "@/services/supplierNotesService";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

interface Props {
  dealerId: string;
  supplierId: string;
}

/**
 * Internal owner/admin notes about supplier performance.
 * Advisory-only — does not affect reliability score.
 */
export function SupplierNotesPanel({ dealerId, supplierId }: Props) {
  const qc = useQueryClient();
  const { canManageUsers: isAdmin } = usePermissions();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["supplier-notes", dealerId, supplierId],
    queryFn: () => supplierNotesService.list(dealerId, supplierId),
    enabled: !!dealerId && !!supplierId && isAdmin,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["supplier-notes", dealerId, supplierId] });

  const createMut = useMutation({
    mutationFn: () => supplierNotesService.create({ dealerId, supplierId, note: draft }),
    onSuccess: () => {
      setDraft("");
      invalidate();
      toast.success("Note added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      supplierNotesService.update(editingId!, { dealerId, supplierId, note: editingText }),
    onSuccess: () => {
      setEditingId(null);
      setEditingText("");
      invalidate();
      toast.success("Note updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => supplierNotesService.delete(id, dealerId, supplierId),
    onSuccess: () => {
      invalidate();
      toast.success("Note deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return null;

  const startEdit = (n: SupplierNote) => {
    setEditingId(n.id);
    setEditingText(n.note);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <StickyNote className="h-4 w-4" /> Performance Notes
          <span className="text-[11px] font-normal text-muted-foreground ml-1">
            (advisory · doesn't affect score)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an internal note about this supplier (e.g. quality issue, price negotiation, payment terms)…"
            rows={2}
            maxLength={2000}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{draft.length}/2000</span>
            <Button
              size="sm"
              onClick={() => createMut.mutate()}
              disabled={!draft.trim() || createMut.isPending}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Note
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading notes…</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No notes yet. Notes are visible only to admins.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border bg-muted/20 px-3 py-2">
                {editingId === n.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={2}
                      maxLength={2000}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setEditingText("");
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateMut.mutate()}
                        disabled={!editingText.trim() || updateMut.isPending}
                      >
                        <Save className="h-3.5 w-3.5 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{n.note}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        Updated {new Date(n.updated_at).toLocaleString()}
                        {n.updated_at !== n.created_at && " · edited"}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => startEdit(n)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Delete this note?")) deleteMut.mutate(n.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default SupplierNotesPanel;
