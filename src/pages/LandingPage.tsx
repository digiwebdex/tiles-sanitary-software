import { Link } from "react-router-dom";
import { useCmsContent } from "@/hooks/useCmsContent";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart2, Package, ShoppingCart, Users, Truck, FileText,
  PieChart, Shield, Layers, CreditCard, Bell, Settings,
  CheckCircle2, Phone, Mail, MapPin, ArrowRight, Lock,
  Star, Zap,
} from "lucide-react";

/* ─── Icon map (matches CMS icon names) ─── */
const ICON_MAP: Record<string, React.ElementType> = {
  BarChart2, Package, ShoppingCart, Users, Truck, FileText,
  PieChart, Shield, Layers, CreditCard, Bell, Settings,
};

/* ─── Default content ─── */
const DEFAULTS = {
  hero: {
    title: "Manage Your Tile Business Smarter",
    subtitle: "All-in-one ERP for Tiles & Sanitary Dealers",
    button_text: "Get Started Free",
    button_link: "/login",
    extra_json: {
      badge: "Trusted by 100+ Dealers",
      secondary_button: "Watch Demo",
      secondary_link: "#features",
    },
  },
  features: {
    title: "Everything You Need",
    subtitle: "Powerful features built for tiles & sanitary dealers",
    extra_json: {
      items: [
        { icon: "Package",      title: "Inventory Management",    description: "Track stock levels by box, SFT, and piece. Set reorder alerts and monitor aging inventory in real time." },
        { icon: "ShoppingCart", title: "Sales & Invoicing",       description: "Create sales invoices, manage credit limits, process returns and track outstanding dues with ease." },
        { icon: "Truck",        title: "Purchase Management",     description: "Record supplier purchases, calculate landed costs and maintain complete supplier ledgers." },
        { icon: "BarChart2",    title: "Financial Reports",       description: "Detailed P&L, cash flow, customer receivables, supplier payables and inventory valuation reports." },
        { icon: "Users",        title: "Customer Ledger",         description: "Full customer transaction history, credit tracking, overdue alerts and payment collection." },
        { icon: "Shield",       title: "Role-Based Access",       description: "Owner and salesman roles with granular permissions. Every action is audit-logged for security." },
      ],
    },
  },
  pricing: {
    title: "Simple, Transparent Pricing",
    subtitle: "No hidden fees. Cancel anytime.",
    extra_json: {
      plans: [
        { name: "Starter",  price: "999",   period: "/month", highlighted: false, features: ["Up to 2 users", "Inventory management", "Basic reports", "Customer ledger"] },
        { name: "Pro",      price: "1,999", period: "/month", highlighted: true,  features: ["Up to 5 users", "All Starter features", "Advanced analytics", "Priority support", "Multi-branch ready"] },
        { name: "Business", price: "3,499", period: "/month", highlighted: false, features: ["Unlimited users", "All Pro features", "Custom reports", "Dedicated support", "SLA guarantee"] },
      ],
    },
  },
  security: {
    title: "Enterprise-Grade Security",
    subtitle: "Your data is safe with us",
    extra_json: {
      bullets: [
        { text: "AES-256 bank-level encryption for all data at rest and in transit" },
        { text: "Role-based access control — staff only see what they need to" },
        { text: "Complete audit log of every action across the system" },
        { text: "Row-level security enforced at the database level" },
        { text: "Automatic session expiry and brute-force protection" },
      ],
      cloud_info: "Hosted on enterprise cloud infrastructure with 99.9% uptime SLA and global CDN.",
      backup_info: "Automated daily backups with 30-day retention and point-in-time recovery.",
    },
  },
  footer: {
    title: "Tiles & Sanitary ERP",
    description: "The modern ERP platform for tiles and sanitary dealers.",
    extra_json: {
      phone: "+880 1234-567890",
      email: "support@tilesERP.com",
      address: "Dhaka, Bangladesh",
      copyright: `© ${new Date().getFullYear()} Tiles ERP. All rights reserved.`,
    },
  },
  seo: {
    title: "Tiles & Sanitary ERP — Manage Your Business",
    description: "All-in-one ERP for tiles and sanitary dealers. Manage inventory, sales, purchases and finances in one place.",
    extra_json: { keywords: "tiles ERP, sanitary software, dealer management" },
  },
};

/* ─── Skeleton loader ─── */
const SectionSkeleton = () => (
  <div className="space-y-4 py-12 px-4 max-w-4xl mx-auto">
    <Skeleton className="h-10 w-64 mx-auto" />
    <Skeleton className="h-5 w-96 mx-auto" />
    <div className="grid grid-cols-3 gap-4 mt-8">
      {[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
    </div>
  </div>
);

/* ─── NAV ─── */
const Navbar = ({ companyName }: { companyName: string }) => (
  <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <Layers className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-foreground">{companyName}</span>
      </div>
      <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
        <a href="#features" className="hover:text-foreground transition-colors">Features</a>
        <a href="#pricing"  className="hover:text-foreground transition-colors">Pricing</a>
        <a href="#security" className="hover:text-foreground transition-colors">Security</a>
        <a href="#contact"  className="hover:text-foreground transition-colors">Contact</a>
      </div>
      <Link to="/login">
        <Button size="sm" className="gap-1.5">
          Sign In <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </Link>
    </div>
  </nav>
);

/* ─── HERO ─── */
const HeroSection = ({ cms }: { cms: typeof DEFAULTS.hero & { extra_json: any } }) => {
  const ex = cms.extra_json ?? {};
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-background via-muted/40 to-background pt-20 pb-28">
      {/* Decorative blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
        {ex.badge && (
          <Badge variant="outline" className="mb-6 gap-1.5 px-3 py-1 text-xs font-medium">
            <Star className="h-3 w-3 text-primary" />
            {ex.badge}
          </Badge>
        )}

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight mb-6">
          {cms.title}
        </h1>

        {cms.subtitle && (
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            {cms.subtitle}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to={cms.button_link || "/login"}>
            <Button size="lg" className="gap-2 px-8 h-12 text-base">
              {cms.button_text || "Get Started"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          {ex.secondary_button && (
            <a href={ex.secondary_link || "#features"}>
              <Button size="lg" variant="outline" className="gap-2 px-8 h-12 text-base">
                {ex.secondary_button}
              </Button>
            </a>
          )}
        </div>
      </div>
    </section>
  );
};

/* ─── FEATURES ─── */
const FeaturesSection = ({ cms }: { cms: typeof DEFAULTS.features & { extra_json: any } }) => {
  const items: { icon: string; title: string; description: string }[] = cms.extra_json?.items ?? [];
  return (
    <section id="features" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{cms.title}</h2>
          {cms.subtitle && <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{cms.subtitle}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, i) => {
            const Icon = ICON_MAP[item.icon] ?? Package;
            return (
              <div
                key={i}
                className="group relative rounded-xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-md transition-all duration-200"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/* ─── PRICING ─── */
const PricingSection = ({ cms }: { cms: typeof DEFAULTS.pricing & { extra_json: any } }) => {
  const plans: { name: string; price: string; period: string; features: string[]; highlighted: boolean }[] =
    cms.extra_json?.plans ?? [];
  return (
    <section id="pricing" className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{cms.title}</h2>
          {cms.subtitle && <p className="text-muted-foreground text-lg max-w-2xl mx-auto">{cms.subtitle}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`relative rounded-2xl border p-7 flex flex-col gap-6 transition-all ${
                plan.highlighted
                  ? "border-primary bg-primary text-primary-foreground shadow-2xl scale-[1.02]"
                  : "border-border bg-card"
              }`}
            >
              {plan.highlighted && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-foreground text-primary text-xs px-3">
                  <Zap className="h-3 w-3 mr-1" /> Most Popular
                </Badge>
              )}

              <div>
                <p className={`text-sm font-medium mb-1 ${plan.highlighted ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1">
                  <span className="text-xs font-semibold">৳</span>
                  <span className="text-4xl font-bold leading-none">{plan.price}</span>
                  <span className={`text-sm mb-0.5 ${plan.highlighted ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {plan.period}
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5 flex-1">
                {plan.features.map((feat, fi) => (
                  <li key={fi} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${plan.highlighted ? "text-primary-foreground/80" : "text-primary"}`} />
                    <span className={plan.highlighted ? "text-primary-foreground/90" : "text-foreground"}>
                      {feat}
                    </span>
                  </li>
                ))}
              </ul>

              <Link to="/login">
                <Button
                  className="w-full"
                  variant={plan.highlighted ? "secondary" : "default"}
                >
                  Get Started
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── SECURITY ─── */
const SecuritySection = ({ cms }: { cms: typeof DEFAULTS.security & { extra_json: any } }) => {
  const ex = cms.extra_json ?? {};
  const bullets: { text: string }[] = ex.bullets ?? [];
  return (
    <section id="security" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-6">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">{cms.title}</h2>
            {cms.subtitle && <p className="text-muted-foreground text-lg mb-8">{cms.subtitle}</p>}

            <ul className="space-y-3">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  {b.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            {ex.cloud_info && (
              <div className="rounded-xl border border-border bg-muted/30 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm text-foreground">Cloud Infrastructure</span>
                </div>
                <p className="text-sm text-muted-foreground">{ex.cloud_info}</p>
              </div>
            )}
            {ex.backup_info && (
              <div className="rounded-xl border border-border bg-muted/30 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm text-foreground">Backup & Recovery</span>
                </div>
                <p className="text-sm text-muted-foreground">{ex.backup_info}</p>
              </div>
            )}
            <div className="rounded-xl border border-border bg-muted/30 p-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm text-foreground">Compliance Ready</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Full audit trail on every action — who did what, when, and from where.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ─── CTA BANNER ─── */
const CtaSection = ({ heroBtn }: { heroBtn: string; heroBtnLink: string }) => (
  <section className="py-20 bg-primary">
    <div className="max-w-3xl mx-auto px-4 text-center">
      <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">
        Ready to modernise your business?
      </h2>
      <p className="text-primary-foreground/70 text-lg mb-8">
        Join hundreds of dealers already using our ERP to grow faster.
      </p>
      <Link to="/login">
        <Button size="lg" variant="secondary" className="gap-2 px-8 h-12 text-base">
          {heroBtn || "Get Started Today"} <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  </section>
);

/* ─── FOOTER ─── */
const FooterSection = ({ cms }: { cms: typeof DEFAULTS.footer & { extra_json: any } }) => {
  const ex = cms.extra_json ?? {};
  return (
    <footer id="contact" className="bg-card border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Layers className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">{cms.title}</span>
            </div>
            {cms.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{cms.description}</p>
            )}
          </div>

          {/* Links */}
          <div>
            <p className="font-semibold text-sm text-foreground mb-3">Quick Links</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {["#features","#pricing","#security","#contact"].map(href => (
                <li key={href}>
                  <a href={href} className="hover:text-foreground transition-colors capitalize">
                    {href.replace("#", "")}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="font-semibold text-sm text-foreground mb-3">Contact</p>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              {ex.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <a href={`tel:${ex.phone}`} className="hover:text-foreground transition-colors">{ex.phone}</a>
                </li>
              )}
              {ex.email && (
                <li className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <a href={`mailto:${ex.email}`} className="hover:text-foreground transition-colors">{ex.email}</a>
                </li>
              )}
              {ex.address && (
                <li className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                  <span>{ex.address}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-border text-center text-xs text-muted-foreground">
          {ex.copyright || `© ${new Date().getFullYear()} Tiles ERP. All rights reserved.`}
        </div>
      </div>
    </footer>
  );
};

/* ─── MAIN LANDING PAGE ─── */
const LandingPage = () => {
  const { data: sections, isLoading } = useCmsContent();

  const hero     = { ...DEFAULTS.hero,     ...(sections?.hero     ?? {}), extra_json: { ...DEFAULTS.hero.extra_json,     ...(sections?.hero?.extra_json     ?? {}) } };
  const features = { ...DEFAULTS.features, ...(sections?.features ?? {}), extra_json: { ...DEFAULTS.features.extra_json, ...(sections?.features?.extra_json ?? {}) } };
  const pricing  = { ...DEFAULTS.pricing,  ...(sections?.pricing  ?? {}), extra_json: { ...DEFAULTS.pricing.extra_json,  ...(sections?.pricing?.extra_json  ?? {}) } };
  const security = { ...DEFAULTS.security, ...(sections?.security ?? {}), extra_json: { ...DEFAULTS.security.extra_json, ...(sections?.security?.extra_json ?? {}) } };
  const footer   = { ...DEFAULTS.footer,   ...(sections?.footer   ?? {}), extra_json: { ...DEFAULTS.footer.extra_json,   ...(sections?.footer?.extra_json   ?? {}) } };

  if (isLoading) return (
    <div className="min-h-screen bg-background">
      <div className="h-16 border-b border-border" />
      {[1, 2, 3].map(i => <SectionSkeleton key={i} />)}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar companyName={footer.title || "Tiles ERP"} />
      <HeroSection     cms={hero} />
      <FeaturesSection cms={features} />
      <PricingSection  cms={pricing} />
      <SecuritySection cms={security} />
      <CtaSection      heroBtn={hero.button_text || "Get Started"} heroBtnLink={hero.button_link || "/login"} />
      <FooterSection   cms={footer} />
    </div>
  );
};

export default LandingPage;
