import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listMyPortalRequests, type PortalRequestStatus } from "@/services/portalService";
import { PortalListSkeleton } from "./PortalLayout";
import PortalRequestDialog from "./PortalRequestDialog";
import { Plus } from "lucide-react";

const statusVariant = (s: PortalRequestStatus): "default" | "secondary" | "outline" | "destructive" => {
  if (s === "converted") return "default";
  if (s === "reviewed") return "secondary";
  if (s === "closed") return "outline";
  return "secondary";
};

export default function PortalRequestsPage() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "requests"],
    queryFn: listMyPortalRequests,
  });

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle>My Requests</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New request
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <PortalListSkeleton />
        ) : (data ?? []).length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-sm text-muted-foreground">
              No requests yet. Submit a reorder or quote request and your dealer will review it.
            </p>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Submit your first request
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {(data ?? []).map((r) => (
              <div key={r.id} className="border border-border rounded-md p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium capitalize">
                      {r.request_type === "reorder" ? "Reorder" : "Quote"} request
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()} · {r.items.length} item(s)
                    </div>
                  </div>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </div>
                {r.message && <p className="text-sm mt-2 text-muted-foreground">{r.message}</p>}
                {r.review_note && (
                  <p className="text-xs mt-2 p-2 bg-muted rounded">
                    <span className="font-semibold">Dealer note:</span> {r.review_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <PortalRequestDialog open={open} onOpenChange={setOpen} requestType="quote" />
    </Card>
  );
}
