import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { listPortalProjects, listPortalSites } from "@/services/portalService";
import { PortalListSkeleton } from "./PortalLayout";

export default function PortalProjectsPage() {
  const { context } = usePortalAuth();
  const customerId = context?.customer_id ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

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

  const filteredProjects = useMemo(() => {
    const rows = projectsQ.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (!q) return true;
      return (
        (p.project_name ?? "").toLowerCase().includes(q) ||
        (p.project_code ?? "").toLowerCase().includes(q)
      );
    });
  }, [projectsQ.data, search, status]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle>My Projects</CardTitle>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="Search name or code…"
                className="h-8 w-[180px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {projectsQ.isLoading ? (
            <PortalListSkeleton />
          ) : filteredProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects match.</p>
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
                  {filteredProjects.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell className="font-mono text-xs">
                        <Link to={`/portal/projects/${p.id}`} className="hover:underline">
                          {p.project_code}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link to={`/portal/projects/${p.id}`} className="hover:underline">
                          {p.project_name}
                        </Link>
                      </TableCell>
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
