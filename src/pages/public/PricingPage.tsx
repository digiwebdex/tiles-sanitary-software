import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  CheckCircle2, XCircle, ArrowRight, Zap, Layers, Phone, Mail, MapPin,
  Users, Package, BarChart2, Bell, MessageCircle, ShieldCheck,
  TrendingUp, Sparkles,
} from "lucide-react";

/* ─── NAV ─── */
const Navbar = () => (
  <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <Layers className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-bold text-foreground">Tiles & Sanitary ERP</span>
      </Link>
      <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
        <Link to="/#features"  className="hover:text-foreground transition-colors">Features</Link>
        <Link to="/pricing"    className="text-primary font-medium">Pricing</Link>
        <Link to="/#security"  className="hover:text-foreground transition-colors">Security</Link>
        <Link to="/contact"    className="hover:text-foreground transition-colors">Contact</Link>
      </div>
      <div className="flex items-center gap-2">
        <Link to="/login">
          <Button size="sm" variant="outline">Sign In</Button>
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

/* ─── FOOTER ─── */
const Footer = () => (
  <footer className="bg-card border-t border-border">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Layers className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">Tiles & Sanitary ERP</span>
          </div>
          <p className="text-sm text-muted-foreground">The modern ERP platform for tiles and sanitary dealers.</p>
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground mb-3">Company</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              { label: "Features", href: "/#features" },
              { label: "Pricing",  href: "/pricing" },
              { label: "Privacy",  href: "/privacy" },
              { label: "Terms",    href: "/terms" },
            ].map(l => (
              <li key={l.href}><Link to={l.href} className="hover:text-foreground transition-colors">{l.label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground mb-3">Contact</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-primary" /><span>+880 1234-567890</span></li>
            <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-primary" /><span>support@yourdomain.com</span></li>
            <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary" /><span>Bangladesh</span></li>
          </ul>
        </div>
      </div>
      <div className="pt-6 border-t border-border text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Tiles ERP. All rights reserved.
      </div>
    </div>
  </footer>
);

/* ─── PLAN FEATURES ─── */
const PLAN_META: Record<string, {
  tagline: string;
  highlighted: boolean;
  badge: string | null;
  cta: string;
  ctaLink: string;
  features: { icon: any; text: string }[];
}> = {
  Basic: {
    tagline: "Perfect for small shops",
    highlighted: false,
    badge: null,
    cta: "Get Started",
    ctaLink: "/get-started",
    features: [
      { icon: Users,       text: "Up to 2 Users" },
      { icon: Package,     text: "All Core Modules (Sales, Purchase, Stock)" },
      { icon: BarChart2,   text: "Basic Reports" },
      { icon: ShieldCheck, text: "Role-Based Access Control" },
      { icon: Bell,        text: "SMS Notifications: Not included" },
      { icon: Mail,        text: "Email Notifications: Not included" },
      { icon: TrendingUp,  text: "Daily Summary: Not included" },
    ],
  },
  Pro: {
    tagline: "For growing businesses",
    highlighted: true,
    badge: "Most Popular",
    cta: "Get Started",
    ctaLink: "/get-started",
    features: [
      { icon: Users,       text: "Up to 5 Users" },
      { icon: Package,     text: "All Core Modules + Advanced Reports" },
      { icon: BarChart2,   text: "Full Reports + P&L, Profit Per Invoice" },
      { icon: ShieldCheck, text: "Role-Based Access Control" },
      { icon: Bell,        text: "SMS Notifications: Included" },
      { icon: Mail,        text: "Email Notifications: Included" },
      { icon: TrendingUp,  text: "Daily Closing Summary: Included" },
    ],
  },
};

/* ─── FEATURE COMPARISON ─── */
const COMPARISON = [
  { feature: "Max Users",              basic: "2",   pro: "5" },
  { feature: "Core Modules",           basic: true,  pro: true },
  { feature: "Sales & Invoicing",      basic: true,  pro: true },
  { feature: "Purchase Management",    basic: true,  pro: true },
  { feature: "Customer Ledger",        basic: true,  pro: true },
  { feature: "Basic Reports",          basic: true,  pro: true },
  { feature: "Full Reports + P&L",     basic: false, pro: true },
  { feature: "Profit Per Invoice",     basic: false, pro: true },
  { feature: "SMS Notifications",      basic: false, pro: true },
  { feature: "Email Notifications",    basic: false, pro: true },
  { feature: "Daily Closing Summary",  basic: false, pro: true },
];

const CellValue = ({ val, highlighted }: { val: boolean | string; highlighted?: boolean }) => {
  if (val === true)  return <CheckCircle2 className={`h-5 w-5 mx-auto ${highlighted ? "text-primary-foreground" : "text-primary"}`} />;
  if (val === false) return <XCircle className="h-5 w-5 mx-auto text-muted-foreground/40" />;
  return <span className={`text-xs font-medium ${highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{val}</span>;
};

const YEARLY_DISCOUNT = 0.30;

/* ─── MAIN PAGE ─── */
const PricingPage = () => {
  const [yearly, setYearly] = useState(false);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["subscription-plans-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("monthly_price", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const getPrice = (plan: any) => {
    if (yearly) {
      // yearly_price is total for 12 months, show per-month equivalent
      return Math.round(plan.yearly_price / 12);
    }
    return plan.monthly_price;
  };

  const getOriginalMonthlyPrice = (plan: any) => plan.monthly_price;

  const getYearlySaving = (plan: any) =>
    Math.round(plan.monthly_price * 12 - plan.yearly_price);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="py-20 text-center bg-gradient-to-br from-background via-muted/30 to-background border-b border-border">
        <div className="max-w-3xl mx-auto px-4">
          <Badge variant="outline" className="mb-4 px-3 py-1 text-xs">Pricing</Badge>
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 tracking-tight">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-muted-foreground mb-10">
            No hidden fees. No long-term contracts. Cancel anytime.
          </p>

          {/* Monthly / Yearly toggle */}
          <div className="inline-flex flex-col items-center gap-3">
            <div className="inline-flex items-center gap-4 bg-muted rounded-full px-6 py-3">
              <span className={`text-sm font-medium transition-colors ${!yearly ? "text-foreground" : "text-muted-foreground"}`}>
                Monthly
              </span>
              <Switch
                checked={yearly}
                onCheckedChange={setYearly}
                className="data-[state=checked]:bg-primary"
              />
              <span className={`text-sm font-medium transition-colors ${yearly ? "text-foreground" : "text-muted-foreground"}`}>
                Yearly
              </span>
            </div>
            {/* Savings callout */}
            <div className={`flex items-center gap-2 transition-all duration-300 ${yearly ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none"}`}>
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-primary">
                Save 30% on Yearly Billing
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              {plans.map((plan: any) => {
                const meta = PLAN_META[plan.name] || PLAN_META["Basic"];
                const price = getPrice(plan);
                const originalMonthly = getOriginalMonthlyPrice(plan);
                const saving = getYearlySaving(plan);
                const isHighlighted = meta.highlighted;

                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl border p-8 flex flex-col gap-6 transition-all ${
                      isHighlighted
                        ? "border-primary bg-primary text-primary-foreground shadow-2xl scale-[1.02]"
                        : "border-border bg-card"
                    }`}
                  >
                    {meta.badge && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-foreground text-primary text-xs px-3 gap-1 shadow-md">
                        <Zap className="h-3 w-3" /> {meta.badge}
                      </Badge>
                    )}

                    {/* Plan name + tagline */}
                    <div>
                      <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${isHighlighted ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {plan.name}
                      </p>
                      <p className={`text-sm mb-4 ${isHighlighted ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {meta.tagline}
                      </p>

                      {/* Price block */}
                      <div className="flex items-end gap-1 mb-1">
                        <span className={`text-sm font-semibold ${isHighlighted ? "text-primary-foreground/80" : "text-foreground"}`}>৳</span>
                        <span className="text-5xl font-bold leading-none">{price.toLocaleString()}</span>
                        <span className={`text-sm mb-0.5 ${isHighlighted ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          /month
                        </span>
                      </div>

                      {/* Yearly discount callout */}
                      {yearly ? (
                        <div className="flex flex-col gap-0.5 mt-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm line-through ${isHighlighted ? "text-primary-foreground/40" : "text-muted-foreground/60"}`}>
                              ৳{originalMonthly.toLocaleString()}/month
                            </span>
                            <Badge className={`text-[10px] px-1.5 py-0 h-4 ${isHighlighted ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"}`}>
                              -30%
                            </Badge>
                          </div>
                          <p className={`text-xs ${isHighlighted ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            Billed ৳{plan.yearly_price.toLocaleString()}/year · Save ৳{saving.toLocaleString()}/yr
                          </p>
                          <p className={`text-xs font-semibold mt-0.5 ${isHighlighted ? "text-primary-foreground/80" : "text-primary"}`}>
                            🎉 Save 30% on First Year
                          </p>
                        </div>
                      ) : (
                        <p className={`text-xs mt-1 ${isHighlighted ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          Billed monthly · Switch to yearly to save 30%
                        </p>
                      )}
                    </div>

                    {/* Feature flags summary badges */}
                    <div className="flex flex-wrap gap-2">
                      {plan.sms_enabled && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${isHighlighted ? "border-primary-foreground/30 text-primary-foreground/80" : "border-primary/30 text-primary"}`}>
                          📱 SMS
                        </span>
                      )}
                      {plan.email_enabled && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${isHighlighted ? "border-primary-foreground/30 text-primary-foreground/80" : "border-primary/30 text-primary"}`}>
                          ✉️ Email
                        </span>
                      )}
                      {plan.daily_summary_enabled && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${isHighlighted ? "border-primary-foreground/30 text-primary-foreground/80" : "border-primary/30 text-primary"}`}>
                          📊 Daily Summary
                        </span>
                      )}
                    </div>

                    {/* Features list */}
                    <ul className="space-y-2.5 flex-1">
                      {meta.features.map((f, fi) => (
                        <li key={fi} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${isHighlighted ? "text-primary-foreground/70" : "text-primary"}`} />
                          <span className={isHighlighted ? "text-primary-foreground/90" : "text-foreground"}>{f.text}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Max users */}
                    <p className={`text-xs flex items-center gap-1.5 ${isHighlighted ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      <Users className="h-3.5 w-3.5" /> Up to {plan.max_users} user{plan.max_users > 1 ? "s" : ""}
                    </p>

                    {/* CTA */}
                    <Link to={meta.ctaLink}>
                      <Button
                        className="w-full h-11"
                        variant={isHighlighted ? "secondary" : "default"}
                      >
                        {meta.cta}
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {/* Yearly note */}
          {yearly && (
            <p className="text-center text-xs text-muted-foreground mt-6">
              * Yearly prices billed as a single annual payment. 30% discount applied automatically.
            </p>
          )}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 bg-muted/20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Compare Plans</h2>
            <p className="text-muted-foreground">See exactly what's included in each plan.</p>
          </div>

          <div className="rounded-2xl border border-border overflow-hidden bg-card">
            <div className="grid grid-cols-3 bg-muted/50 border-b border-border">
              <div className="p-4 text-sm font-semibold text-foreground">Feature</div>
              <div className="p-4 text-center text-sm font-semibold text-foreground">Basic</div>
              <div className="p-4 text-center text-sm font-semibold bg-primary text-primary-foreground">Pro</div>
            </div>
            {COMPARISON.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-3 border-b border-border last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
              >
                <div className="p-4 text-sm text-foreground">{row.feature}</div>
                <div className="p-4 flex items-center justify-center">
                  <CellValue val={row.basic} />
                </div>
                <div className="p-4 flex items-center justify-center bg-primary/5">
                  <CellValue val={row.pro} highlighted />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-4">
            {[
              { q: "How does the 30% yearly discount work?", a: "When you choose yearly billing, the total is calculated at 30% off the monthly rate and billed as a single annual payment. The discount is applied automatically — no coupon needed." },
              { q: "Can I change plans later?", a: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of the next billing period." },
              { q: "Is there a free trial?", a: "Yes! All plans come with a trial period so you can explore the system before committing." },
              { q: "What payment methods are accepted?", a: "We accept cash, bank transfer, and mobile banking (bKash, Nagad). Contact us for other options." },
              { q: "What's included in SMS/Email notifications?", a: "Pro plan includes real-time SMS and email alerts for sales events, plus a daily closing summary so you're always up-to-date." },
              { q: "Is my data safe?", a: "Absolutely. All data is encrypted, backed up daily, and isolated per dealer account with role-based access control." },
            ].map((faq, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5">
                <p className="font-semibold text-foreground mb-2">{faq.q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Sales */}
      <section id="contact-sales" className="py-20 bg-primary">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <MessageCircle className="h-12 w-12 text-primary-foreground/70 mx-auto mb-4" />
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">
            Need a Custom Plan?
          </h2>
          <p className="text-primary-foreground/70 text-lg mb-8">
            Running a large business or chain of outlets? Let's talk — we'll build a plan around your needs.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="mailto:support@yourdomain.com">
              <Button size="lg" variant="secondary" className="gap-2 px-8 h-12 text-base">
                <Mail className="h-4 w-4" /> Email Sales
              </Button>
            </a>
            <a href="tel:+8801234567890">
              <Button size="lg" variant="outline" className="gap-2 px-8 h-12 text-base border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                <Phone className="h-4 w-4" /> Call Us
              </Button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default PricingPage;
