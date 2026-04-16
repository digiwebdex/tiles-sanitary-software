import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useDealerId } from "@/hooks/useDealerId";
import { projectService, type Project, type ProjectSite, type ProjectStatus } from "@/services/projectService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, MapPin, Search, Folder, FolderOpen } from "lucide-react";
import { ProjectFormDialog } from "@/components/project/ProjectFormDialog";
import { SiteFormDialog } from "@/components/project/SiteFormDialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const statusVariant = (s: ProjectStatus): "default" | "secondary" | "outline" | "destructive" => {
  switch (s) {
    case "active": return "default";
    case "on_hold": return "secondary";
    case "completed": return "outline";
    case "cancelled": return "destructive";
    default: return "outline";
  }
};

export default function ProjectList() {
  const dealerId = useDealerId();
  const { isDealerAdmin, isSuperAdmin } = useAuth();
  const canManage = isDealerAdmin || isSuperAdmin;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<ProjectSite | null>(null);
  const [siteDialogProject, setSiteDialogProject] = useState<{ id: string; customerId: string } | null>(null);

  const projectsQ = useQuery({
    queryKey: ["projects", dealerId, search, statusFilter],
    queryFn: () => projectService.list(dealerId, { search, status: statusFilter }),
  });
  const projects = projectsQ.data ?? [];

  const sitesQ = useQuery({
    queryKey: ["sites", dealerId, expandedProjectId],
    queryFn: () => projectService.listSites(dealerId, expandedProjectId!),
    enabled: !!expandedProjectId,
  });

  const deleteProjectMut = useMutation({
    mutationFn: (id: string) => projectService.remove(id, dealerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSiteMut = useMutation({
    mutationFn: (id: string) => projectService.removeSite(id, dealerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      toast.success("Site deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDeleteProject = (p: Project) => {
    if (!confirm(`Delete project "${p.project_name}"? This will also remove its sites. Linked quotations/sales will keep history but lose the project link.`)) return;
    deleteProjectMut.mutate(p.id);
  };

  const handleDeleteSite = (s: ProjectSite) => {
    if (!confirm(`Delete site "${s.site_name}"?`)) return;
    deleteSiteMut.mutate(s.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">Group quotations, sales and deliveries by project &amp; site.</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditingProject(null); setProjectDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Project
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4 grid md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search project name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter || "__all"} onValueChange={(v) => setStatusFilter(v === "__all" ? "" : (v as ProjectStatus))}>
            <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_hold">On hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {projectsQ.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Folder className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No projects yet. Click "New Project" to start.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => {
            const isExpanded = expandedProjectId === p.id;
            const sites = isExpanded ? sitesQ.data ?? [] : [];
            return (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div
                      className="flex items-start gap-2 cursor-pointer"
                      onClick={() => setExpandedProjectId(isExpanded ? null : p.id)}
                    >
                      {isExpanded ? <FolderOpen className="h-5 w-5 text-primary mt-0.5" /> : <Folder className="h-5 w-5 text-muted-foreground mt-0.5" />}
                      <div>
                        <CardTitle className="text-base">{p.project_name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono">{p.project_code}</span>
                          {p.customer && <> · {p.customer.name}</>}
                          {p.start_date && <> · Started {p.start_date}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(p.status)} className="capitalize">
                        {p.status.replace("_", " ")}
                      </Badge>
                      {canManage && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditingProject(p); setProjectDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteProject(p)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    {p.notes && <p className="text-xs text-muted-foreground mb-3 italic">{p.notes}</p>}

                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold flex items-center gap-1">
                          <MapPin className="h-4 w-4" /> Delivery Sites
                        </h4>
                        {canManage && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingSite(null);
                              setSiteDialogProject({ id: p.id, customerId: p.customer_id });
                              setSiteDialogOpen(true);
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add Site
                          </Button>
                        )}
                      </div>
                      {sitesQ.isLoading ? (
                        <p className="text-xs text-muted-foreground">Loading sites…</p>
                      ) : sites.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No sites yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {sites.map((s) => (
                            <div key={s.id} className="flex items-start justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                              <div>
                                <div className="font-medium flex items-center gap-2">
                                  {s.site_name}
                                  {s.status === "inactive" && (
                                    <Badge variant="outline" className="text-xs">inactive</Badge>
                                  )}
                                </div>
                                {s.address && <div className="text-xs text-muted-foreground">{s.address}</div>}
                                {(s.contact_person || s.contact_phone) && (
                                  <div className="text-xs text-muted-foreground">
                                    {s.contact_person}{s.contact_person && s.contact_phone ? " · " : ""}{s.contact_phone}
                                  </div>
                                )}
                              </div>
                              {canManage && (
                                <div className="flex">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setEditingSite(s);
                                      setSiteDialogProject({ id: p.id, customerId: p.customer_id });
                                      setSiteDialogOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteSite(s)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ProjectFormDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        dealerId={dealerId}
        initial={editingProject}
      />
      {siteDialogProject && (
        <SiteFormDialog
          open={siteDialogOpen}
          onOpenChange={setSiteDialogOpen}
          dealerId={dealerId}
          projectId={siteDialogProject.id}
          customerId={siteDialogProject.customerId}
          initial={editingSite}
        />
      )}
    </div>
  );
}
