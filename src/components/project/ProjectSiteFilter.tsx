import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { projectService } from "@/services/projectService";

interface Props {
  dealerId: string;
  projectId: string | null;
  siteId: string | null;
  onChange: (next: { projectId: string | null; siteId: string | null }) => void;
  className?: string;
}

const NONE = "__all";

/**
 * Compact Project + Site filter for list pages (quotations / sales / challans / deliveries).
 * - Both filters are independent: clearing project also clears site.
 * - Only active projects / active sites are shown.
 */
export function ProjectSiteFilter({ dealerId, projectId, siteId, onChange, className }: Props) {
  const projectsQ = useQuery({
    queryKey: ["projects-filter", dealerId],
    queryFn: () => projectService.listForPicker(dealerId, null),
    enabled: !!dealerId,
  });
  const sitesQ = useQuery({
    queryKey: ["sites-filter", dealerId, projectId],
    queryFn: () => projectService.listSitesForPicker(dealerId, projectId!),
    enabled: !!dealerId && !!projectId,
  });

  const projects = projectsQ.data ?? [];
  const sites = sitesQ.data ?? [];

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <Select
        value={projectId ?? NONE}
        onValueChange={(v) => onChange({ projectId: v === NONE ? null : v, siteId: null })}
      >
        <SelectTrigger className="w-44 h-9">
          <SelectValue placeholder="All projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>All projects</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.project_code} · {p.project_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={siteId ?? NONE}
        onValueChange={(v) => onChange({ projectId, siteId: v === NONE ? null : v })}
        disabled={!projectId}
      >
        <SelectTrigger className="w-44 h-9">
          <SelectValue placeholder={projectId ? "All sites" : "Pick project"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>All sites</SelectItem>
          {sites.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default ProjectSiteFilter;
