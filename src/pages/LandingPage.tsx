import { Link } from "react-router-dom";
import { useCmsContent } from "@/hooks/useCmsContent";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart2, Package, ShoppingCart, Users, Truck, FileText,
  PieChart, Shield, Layers, CreditCard, Bell, Settings,
  CheckCircle2, Phone, Mail, MapPin, ArrowRight, Lock,
  Star, Zap, Server, Database, RefreshCw, UserCheck, Store,
  TrendingUp, LayoutDashboard, AlertCircle, Receipt,
} from "lucide-react";

/* ─── Icon map (matches CMS icon names) ─── */
const ICON_MAP: Record<string, React.ElementType> = {
  BarChart2, Package, ShoppingCart, Users, Truck, FileText,
  PieChart, Shield, Layers, CreditCard, Bell, Settings,
};

/* ─── Default content ─── */
const DEFAULTS = {
  hero: {
    title: "Simple, Smart & Secure ERP for Tiles and Sanitary Dealers",
    subtitle: "Manage Purchase, Sales, Stock, Credit, Profit & Reports — All in One Cloud System.",
    button_text: "Start Free Trial",
    button_link: "/get-started",
    extra_json: {
      badge: "Trusted by 100+ Dealers",
      secondary_button: "Sign In",
      secondary_link: "/login",
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
  <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <Layers className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-foreground">{companyName}</span>
      </div>
      <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
        <a href="#features"  className="hover:text-foreground transition-colors">Features</a>
        <a href="#pricing"   className="hover:text-foreground transition-colors">Pricing</a>
        <a href="#security"  className="hover:text-foreground transition-colors">Security</a>
        <a href="#contact"   className="hover:text-foreground transition-colors">Contact</a>
      </div>
      <div className="flex items-center gap-2">
        <Link to="/login">
          <Button size="sm" variant="outline" className="gap-1.5 text-foreground border-border">Sign In</Button>
        </Link>
        <Link to="/get-started">
          <Button size="sm" className="gap-1.5">
            Get Started <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  </nav>
);

/* ─── HERO ─── */
const HeroSection = ({ cms }: { cms: typeof DEFAULTS.hero & { extra_json: any } }) => {
  const ex = cms.extra_json ?? {};
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-background via-muted/30 to-background pt-20 pb-28">
      {/* Decorative blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-primary/3 blur-2xl" />
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
          <Link to={cms.button_link || "/get-started"}>
            <Button size="lg" className="gap-2 px-8 h-12 text-base shadow-lg">
              {cms.button_text || "Start Free Trial"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          {ex.secondary_button && (
            <Link to={ex.secondary_link || "/login"}>
              <Button size="lg" variant="outline" className="gap-2 px-8 h-12 text-base">
                {ex.secondary_button}
              </Button>
            </Link>
          )}
        </div>

        {/* Stats row */}
        <div className="mt-14 grid grid-cols-3 gap-6 max-w-lg mx-auto">
          {[
            { value: "100+", label: "Active Dealers" },
            { value: "99.9%", label: "Uptime SLA" },
            { value: "24/7", label: "Data Backup" },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl font-bold text-primary">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── WHY CHOOSE US ─── */
const WhyChooseUsSection = () => {
  const items = [
    {
      icon: LayoutDashboard,
      title: "Owner-Centric Dashboard",
      description: "Get a complete business overview at a glance — sales, purchases, stock, profit, and dues — all on one screen.",
    },
    {
      icon: Package,
      title: "Real-Time Stock Control",
      description: "Track inventory by Box and SFT simultaneously. Know exactly what's in stock before every sale.",
    },
    {
      icon: AlertCircle,
      title: "Smart Credit Monitoring",
      description: "Set credit limits per customer, get overdue alerts, and never extend credit beyond your comfort zone.",
    },
    {
      icon: Receipt,
      title: "Profit Per Invoice",
      description: "See net profit on every sale invoice — including COGS, discount, and landed costs — in real time.",
    },
    {
      icon: Bell,
      title: "Daily SMS & Email Summary",
      description: "Receive automated daily business summaries via SMS and email so you stay informed even when offline.",
    },
    {
      icon: Store,
      title: "Online Store Ready",
      description: "Future-proof your business with built-in support for online catalog and order management capabilities.",
    },
  ];

  return (
    <section id="why-us" className="py-20 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <Badge variant="outline" className="mb-4 px-3 py-1 text-xs">Why Choose Us</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Built for Dealers, Not Just Anyone
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Every feature is designed specifically for tiles and sanitary businesses — no bloat, no complexity.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <div
              key={i}
              className="group relative rounded-xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-lg transition-all duration-200"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                <item.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2 text-base">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── TRUSTED & SECURE ─── */
const TrustedSecureSection = () => {
  const trustItems = [
    { icon: Server,     title: "Hosted on AWS VPS",           description: "Enterprise-grade virtual private server on Amazon Web Services for maximum reliability and performance." },
    { icon: Shield,     title: "High-Security Cloud Storage", description: "Your data is stored in a highly secured cloud environment with restricted access and monitoring." },
    { icon: RefreshCw,  title: "Daily Automated Backup",      description: "Automated daily backups with 30-day retention ensure your data is never lost, ever." },
    { icon: Database,   title: "Encrypted Database",          description: "AES-256 encryption protects all data at rest and in transit — bank-level security for your business." },
    { icon: UserCheck,  title: "Role-Based Access Control",   description: "Owners control exactly what each staff member can see and do. Full audit trail on every action." },
  ];

  return (
    <section id="security" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <Badge variant="outline" className="mb-4 px-3 py-1 text-xs">Trusted & Secure</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Your Data is Safe With Us
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            We take security seriously so you can focus on growing your business without worry.
          </p>
        </div>

        {/* Trust cards — 5 items: 3 top + 2 bottom centered */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {trustItems.slice(0, 3).map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-6 flex flex-col gap-3 hover:border-primary/40 hover:shadow-md transition-all duration-200"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <item.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto lg:max-w-none lg:grid-cols-2 lg:px-40">
          {trustItems.slice(3).map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-6 flex flex-col gap-3 hover:border-primary/40 hover:shadow-md transition-all duration-200"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <item.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>

        {/* Compliance banner */}
        <div className="mt-10 rounded-2xl bg-primary/5 border border-primary/20 px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Compliance Ready</p>
              <p className="text-sm text-muted-foreground">Full audit trail — who did what, when, and from where.</p>
            </div>
          </div>
          <Link to="/security">
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
              Learn More <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

/* ─── FEATURES ─── */
const FeaturesSection = ({ cms }: { cms: typeof DEFAULTS.features & { extra_json: any } }) => {
  const items: { icon: string; title: string; description: string }[] = cms.extra_json?.items ?? [];
  return (
    <section id="features" className="py-20 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <Badge variant="outline" className="mb-4 px-3 py-1 text-xs">Features</Badge>
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
    <section id="pricing" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <Badge variant="outline" className="mb-4 px-3 py-1 text-xs">Pricing</Badge>
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

              <Link to="/get-started">
                <Button
                  className="w-full"
                  variant={plan.highlighted ? "secondary" : "default"}
                >
                  Start Free Trial
                </Button>
              </Link>
            </div>
          ))}
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
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to="/get-started">
          <Button size="lg" variant="secondary" className="gap-2 px-8 h-12 text-base">
            {heroBtn || "Start Free Trial"} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link to="/login">
          <Button size="lg" variant="outline" className="gap-2 px-8 h-12 text-base border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
            Sign In
          </Button>
        </Link>
      </div>
    </div>
  </section>
);

/* ─── FOOTER ─── */
const FooterSection = ({ cms }: { cms: typeof DEFAULTS.footer & { extra_json: any } }) => {
  const ex = cms.extra_json ?? {};
  return (
    <footer id="contact" className="bg-card border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Layers className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">{cms.title}</span>
            </div>
            {cms.description && (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">{cms.description}</p>
            )}
          </div>

          {/* Links */}
          <div>
            <p className="font-semibold text-sm text-foreground mb-3">Company</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                { label: "Features",       href: "#features" },
                { label: "Pricing",        href: "#pricing" },
                { label: "Security",       href: "#security" },
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms",          href: "/terms" },
              ].map(link => (
                <li key={link.href}>
                  <a href={link.href} className="hover:text-foreground transition-colors">{link.label}</a>
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
      <HeroSection      cms={hero} />
      <WhyChooseUsSection />
      <TrustedSecureSection />
      <FeaturesSection  cms={features} />
      <PricingSection   cms={pricing} />
      <CtaSection       heroBtn={hero.button_text || "Start Free Trial"} heroBtnLink={hero.button_link || "/get-started"} />
      <FooterSection    cms={footer} />
    </div>
  );
};

export default LandingPage;
