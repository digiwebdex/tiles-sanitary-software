import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { listPortalProjects, listPortalSites } from "@/services/portalService";
import { PortalListSkeleton } from "./PortalLayout";

export default function PortalProjectsPage() {
  const { context } = usePortalAuth();
  const customerId = context?.customer_id ?? "";

  const projectsQ = useQuery({
    queryKey: ["portal", "projects", customerId],
    queryFn: () => listPortalProjects(customerId),
    enabled: !!customerId,
  });
  const sitesQ = useQuery({
    queryKey: ["portal", "sites", customerId],
    queryFn: () => listPortalSites(customerId),
    enabled: !!customerId,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {projectsQ.isLoading ? (
            <PortalListSkeleton />
          ) : (projectsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Expected end</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectsQ.data!.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.project_code}</TableCell>
                      <TableCell className="font-medium">{p.project_name}</TableCell>
                      <TableCell>{p.start_date ?? "—"}</TableCell>
                      <TableCell>{p.expected_end_date ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "active" ? "default" : "secondary"}>
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
        </CardHeader>
        <CardContent>
          {sitesQ.isLoading ? (
            <PortalListSkeleton />
          ) : (sitesQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No sites yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sitesQ.data!.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.site_name}</TableCell>
                      <TableCell className="text-muted-foreground">{s.address ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "secondary"}>
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
