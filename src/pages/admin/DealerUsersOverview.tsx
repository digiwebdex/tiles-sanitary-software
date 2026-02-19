import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const DealerUsersOverview = () => {
  const { data: dealers = [], isLoading } = useQuery({
    queryKey: ["admin-dealer-users"],
    queryFn: async () => {
      // Get all dealers
      const { data: dealerData, error: dErr } = await supabase
        .from("dealers")
        .select("id, name, status")
        .order("name");
      if (dErr) throw new Error(dErr.message);

      // Get all profiles with dealer_id
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, name, email, dealer_id, status");
      if (pErr) throw new Error(pErr.message);

      // Get all user roles
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw new Error(rErr.message);

      const roleMap = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => {
        const existing = roleMap.get(r.user_id) ?? [];
        existing.push(r.role);
        roleMap.set(r.user_id, existing);
      });

      return (dealerData ?? []).map((d: any) => {
        const users = (profiles ?? [])
          .filter((p: any) => p.dealer_id === d.id)
          .map((p: any) => ({
            ...p,
            roles: roleMap.get(p.id) ?? [],
          }));
        return { ...d, users, userCount: users.length };
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dealer Users Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : dealers.length === 0 ? (
          <p className="text-muted-foreground text-center">No dealers</p>
        ) : (
          dealers.map((dealer: any) => (
            <div key={dealer.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-foreground">{dealer.name}</h3>
                <Badge variant="outline" className="text-xs">{dealer.userCount} user{dealer.userCount !== 1 ? "s" : ""}</Badge>
                <Badge
                  variant={dealer.status === "active" ? "default" : "destructive"}
                  className="capitalize text-xs"
                >
                  {dealer.status ?? "active"}
                </Badge>
              </div>
              {dealer.users.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dealer.users.map((u: any) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {u.roles.length > 0
                                ? u.roles.map((r: string) => (
                                    <Badge key={r} variant="secondary" className="text-xs capitalize">
                                      {r.replace("_", " ")}
                                    </Badge>
                                  ))
                                : <span className="text-muted-foreground text-xs">—</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={u.status === "active" ? "default" : "destructive"}
                              className="capitalize text-xs"
                            >
                              {u.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pl-2">No users assigned</p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default DealerUsersOverview;
