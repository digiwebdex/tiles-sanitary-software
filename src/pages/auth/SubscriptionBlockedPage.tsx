import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldOff, Clock, RefreshCw, Phone, Mail } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";

const SubscriptionBlockedPage = () => {
  const { accessLevel, subscription, profile, signOut } = useAuth();

  const isGrace = accessLevel === "grace";
  const isReadonly = accessLevel === "readonly";
  const isBlocked = accessLevel === "blocked";

  let graceRemaining = 0;
  let graceEnd: Date | null = null;
  if ((isGrace || isReadonly) && subscription?.end_date) {
    graceEnd = new Date(subscription.end_date);
    graceEnd.setDate(graceEnd.getDate() + 3);
    graceRemaining = Math.max(0, Math.ceil((graceEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  const endDateFormatted = subscription?.end_date
    ? format(parseISO(subscription.end_date), "dd MMM yyyy")
    : null;

  const config = isReadonly
    ? {
        icon: ShieldOff,
        iconColor: "text-destructive",
        bgColor: "bg-destructive/10",
        borderColor: "border-destructive/30",
        title: "Read-Only Mode Active",
        subtitle: "Your grace period has ended.",
        description:
          "You can only view the Dashboard and Reports. All data entry is disabled until your subscription is renewed.",
        badge: { label: "Read Only", className: "border-destructive/50 bg-destructive/10 text-destructive" },
      }
    : isGrace
    ? {
        icon: Clock,
        iconColor: "text-yellow-600 dark:text-yellow-400",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-400/30",
        title: "Subscription Expired — Grace Period",
        subtitle: `Expired on ${endDateFormatted ?? "—"}.`,
        description:
          "You have a 3-day grace window with full access. Please renew immediately to avoid data entry restrictions.",
        badge: {
          label: `${graceRemaining} day${graceRemaining !== 1 ? "s" : ""} remaining`,
          className: "border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
        },
      }
    : {
        icon: AlertTriangle,
        iconColor: "text-destructive",
        bgColor: "bg-destructive/10",
        borderColor: "border-destructive/30",
        title: "Subscription Required",
        subtitle: "No active subscription found.",
        description:
          "Your account does not have an active subscription. Please contact your administrator to activate one.",
        badge: null,
      };

  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">

        {/* Main Card */}
        <div className={`rounded-2xl border ${config.borderColor} bg-card shadow-lg overflow-hidden`}>
          {/* Top colour strip */}
          <div className={`h-1.5 w-full ${isGrace ? "bg-yellow-400" : "bg-destructive"}`} />

          <div className="p-8 text-center space-y-4">
            {/* Icon */}
            <div className={`mx-auto w-16 h-16 rounded-full ${config.bgColor} flex items-center justify-center`}>
              <Icon className={`h-8 w-8 ${config.iconColor}`} />
            </div>

            {/* Heading */}
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-foreground">{config.title}</h1>
              <p className="text-sm text-muted-foreground">{config.subtitle}</p>
            </div>

            {/* Badge */}
            {config.badge && (
              <Badge variant="outline" className={`text-xs px-3 py-1 ${config.badge.className}`}>
                {isGrace && <Clock className="mr-1 h-3 w-3" />}
                {config.badge.label}
              </Badge>
            )}

            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed">{config.description}</p>

            {/* Subscription info */}
            {subscription && (
              <div className="rounded-lg bg-muted/50 border border-border p-4 text-left space-y-2 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Subscription Info</p>
                {endDateFormatted && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expired On</span>
                    <span className="font-medium text-foreground">{endDateFormatted}</span>
                  </div>
                )}
                {graceEnd && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Grace Ends</span>
                    <span className="font-medium text-foreground">{format(graceEnd, "dd MMM yyyy")}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium text-foreground truncate max-w-[180px]">{profile?.email ?? "—"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-8 pb-8 space-y-3">
            {isReadonly && (
              <Button
                variant="default"
                className="w-full"
                onClick={() => window.location.replace("/")}
              >
                Go to Dashboard (Read-Only)
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh Status
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>

        {/* Contact card */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Need help?
          </p>
          <p className="text-sm text-muted-foreground">
            Contact your dealer admin or super admin to renew the subscription.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href="tel:+8801674533303"
              className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <Phone className="h-4 w-4 text-muted-foreground" /> Call Admin
            </a>
            <a
              href="mailto:admin@tileserp.com"
              className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <Mail className="h-4 w-4 text-muted-foreground" /> Email Admin
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SubscriptionBlockedPage;
