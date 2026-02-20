import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, ArrowRight, Zap, Layers, Phone, Mail, MapPin,
  Users, Package, BarChart2, Bell, Store, Cpu, Star, MessageCircle,
  ShieldCheck, FileText, TrendingUp,
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
        <Link to="/#contact"   className="hover:text-foreground transition-colors">Contact</Link>
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
              { label: "Security", href: "/#security" },
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
            <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-primary" /><span>support@tilesERP.com</span></li>
            <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary" /><span>Dhaka, Bangladesh</span></li>
          </ul>
        </div>
      </div>
      <div className="pt-6 border-t border-border text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Tiles ERP. All rights reserved.
      </div>
    </div>
  </footer>
);

/* ─── PLAN DATA ─── */
const PLANS = [
  {
    name: "Basic",
    tagline: "Perfect for small shops",
    monthlyPrice: 999,
    yearlyPrice: 899,
    highlighted: false,
    badge: null,
    color: "border-border bg-card",
    features: [
      { icon: Users,       text: "1 Dealer Account" },
      { icon: Users,       text: "Up to 3 Users" },
      { icon: Package,     text: "All Core Modules" },
      { icon: BarChart2,   text: "Basic Reports" },
      { icon: ShieldCheck, text: "Role-Based Access" },
      { icon: Bell,        text: "SMS Add-on (Optional)" },
    ],
    addonNote: "SMS notifications available as an optional add-on.",
    cta: "Start Free Trial",
    ctaLink: "/get-started",
    ctaVariant: "default" as const,
  },
  {
    name: "Standard",
    tagline: "For growing businesses",
    monthlyPrice: 1999,
    yearlyPrice: 1799,
    highlighted: true,
    badge: "Most Popular",
    color: "border-primary bg-primary text-primary-foreground shadow-2xl scale-[1.02]",
    features: [
      { icon: Users,      text: "1 Dealer Account" },
      { icon: Users,      text: "Up to 10 Users" },
      { icon: Package,    text: "All Core Modules" },
      { icon: BarChart2,  text: "Full Reports + Profit System" },
      { icon: TrendingUp, text: "P&L, Cash Flow & Ledger Reports" },
      { icon: Bell,       text: "Daily Closing SMS Included" },
      { icon: FileText,   text: "Profit Per Invoice" },
    ],
    addonNote: null,
    cta: "Start Free Trial",
    ctaLink: "/get-started",
    ctaVariant: "secondary" as const,
  },
  {
    name: "Premium",
    tagline: "For enterprises & chains",
    monthlyPrice: 3499,
    yearlyPrice: 3149,
    highlighted: false,
    badge: null,
    color: "border-border bg-card",
    features: [
      { icon: Users,   text: "Unlimited Users" },
      { icon: Package, text: "All Standard Features" },
      { icon: Store,   text: "Online Store Module" },
      { icon: Star,    text: "Priority Support" },
      { icon: Cpu,     text: "AI Reorder Suggestions" },
      { icon: Bell,    text: "Daily Closing SMS Included" },
      { icon: MessageCircle, text: "Dedicated Account Manager" },
    ],
    addonNote: null,
    cta: "Contact Sales",
    ctaLink: "#contact-sales",
    ctaVariant: "default" as const,
  },
];

/* ─── FEATURE COMPARISON TABLE ─── */
const COMPARISON = [
  { feature: "Dealer Account",         basic: "1",        standard: "1",        premium: "Unlimited" },
  { feature: "Users",                  basic: "3",        standard: "10",       premium: "Unlimited" },
  { feature: "Inventory Management",   basic: true,       standard: true,       premium: true },
  { feature: "Sales & Invoicing",      basic: true,       standard: true,       premium: true },
  { feature: "Purchase Management",    basic: true,       standard: true,       premium: true },
  { feature: "Customer Ledger",        basic: true,       standard: true,       premium: true },
  { feature: "Basic Reports",          basic: true,       standard: true,       premium: true },
  { feature: "Full Reports + P&L",     basic: false,      standard: true,       premium: true },
  { feature: "Profit Per Invoice",     basic: false,      standard: true,       premium: true },
  { feature: "Daily Closing SMS",      basic: "Add-on",   standard: true,       premium: true },
  { feature: "Online Store",           basic: false,      standard: false,      premium: true },
  { feature: "AI Reorder Suggestion",  basic: false,      standard: false,      premium: true },
  { feature: "Priority Support",       basic: false,      standard: false,      premium: true },
  { feature: "Dedicated Manager",      basic: false,      standard: false,      premium: true },
];

const CellValue = ({ val, highlighted }: { val: boolean | string; highlighted?: boolean }) => {
  if (val === true)  return <CheckCircle2 className={`h-5 w-5 mx-auto ${highlighted ? "text-primary-foreground" : "text-primary"}`} />;
  if (val === false) return <span className="text-muted-foreground text-lg mx-auto block text-center">—</span>;
  return <span className={`text-xs font-medium ${highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{val}</span>;
};

/* ─── MAIN PAGE ─── */
const PricingPage = () => {
  const [yearly, setYearly] = useState(false);

  const scrollToContact = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("contact-sales")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="py-20 text-center bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="max-w-3xl mx-auto px-4">
          <Badge variant="outline" className="mb-4 px-3 py-1 text-xs">Pricing</Badge>
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 tracking-tight">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-muted-foreground mb-10">
            No hidden fees. No long-term contracts. Cancel anytime.
          </p>

          {/* Monthly / Yearly toggle */}
          <div className="inline-flex items-center gap-3 bg-muted rounded-full p-1">
            <button
              onClick={() => setYearly(false)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                !yearly ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                yearly ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Yearly
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary text-primary-foreground">Save 10%</Badge>
            </button>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {PLANS.map((plan, i) => {
              const price = yearly ? plan.yearlyPrice : plan.monthlyPrice;
              return (
                <div
                  key={i}
                  className={`relative rounded-2xl border p-7 flex flex-col gap-5 transition-all ${plan.color}`}
                >
                  {plan.badge && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-foreground text-primary text-xs px-3 gap-1">
                      <Zap className="h-3 w-3" /> {plan.badge}
                    </Badge>
                  )}

                  {/* Plan name */}
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${plan.highlighted ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                      {plan.name}
                    </p>
                    <p className={`text-sm mb-3 ${plan.highlighted ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {plan.tagline}
                    </p>
                    <div className="flex items-end gap-1">
                      <span className={`text-sm font-semibold ${plan.highlighted ? "text-primary-foreground/80" : "text-foreground"}`}>৳</span>
                      <span className="text-4xl font-bold leading-none">{price.toLocaleString()}</span>
                      <span className={`text-sm mb-0.5 ${plan.highlighted ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        /month
                      </span>
                    </div>
                    {yearly && (
                      <p className={`text-xs mt-1 ${plan.highlighted ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        Billed yearly · Save ৳{((plan.monthlyPrice - plan.yearlyPrice) * 12).toLocaleString()}/yr
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-2.5 flex-1">
                    {plan.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${plan.highlighted ? "text-primary-foreground/70" : "text-primary"}`} />
                        <span className={plan.highlighted ? "text-primary-foreground/90" : "text-foreground"}>{f.text}</span>
                      </li>
                    ))}
                  </ul>

                  {plan.addonNote && (
                    <p className={`text-xs italic ${plan.highlighted ? "text-primary-foreground/50" : "text-muted-foreground"}`}>
                      * {plan.addonNote}
                    </p>
                  )}

                  {/* CTA */}
                  {plan.ctaLink === "#contact-sales" ? (
                    <Button
                      className="w-full"
                      variant={plan.ctaVariant}
                      onClick={scrollToContact}
                    >
                      {plan.cta}
                    </Button>
                  ) : (
                    <Link to={plan.ctaLink}>
                      <Button className="w-full" variant={plan.ctaVariant}>
                        {plan.cta}
                      </Button>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 bg-muted/20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Compare Plans</h2>
            <p className="text-muted-foreground">See exactly what's included in each plan.</p>
          </div>

          <div className="rounded-2xl border border-border overflow-hidden bg-card">
            {/* Table header */}
            <div className="grid grid-cols-4 bg-muted/50 border-b border-border">
              <div className="p-4 text-sm font-semibold text-foreground">Feature</div>
              {["Basic", "Standard", "Premium"].map((p, i) => (
                <div key={p} className={`p-4 text-center text-sm font-semibold ${i === 1 ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                  {p}
                </div>
              ))}
            </div>
            {/* Rows */}
            {COMPARISON.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-4 border-b border-border last:border-0 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
              >
                <div className="p-4 text-sm text-foreground">{row.feature}</div>
                <div className="p-4 flex items-center justify-center">
                  <CellValue val={row.basic} />
                </div>
                <div className="p-4 flex items-center justify-center bg-primary/5">
                  <CellValue val={row.standard} highlighted />
                </div>
                <div className="p-4 flex items-center justify-center">
                  <CellValue val={row.premium} />
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
              { q: "Can I change plans later?", a: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of the next billing period." },
              { q: "Is there a free trial?", a: "Yes! All plans come with a free trial period so you can explore the system before committing." },
              { q: "What payment methods are accepted?", a: "We accept cash, bank transfer, and mobile banking (bKash, Nagad). Contact us for other options." },
              { q: "Is my data safe?", a: "Absolutely. All data is encrypted with AES-256, hosted on AWS, and backed up daily with 30-day retention." },
              { q: "What is the SMS Add-on?", a: "The SMS Add-on on the Basic plan allows you to receive daily business summary notifications via SMS at an additional monthly fee." },
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
            <a href="mailto:support@tilesERP.com">
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
          <p className="text-primary-foreground/50 text-sm mt-6">
            Typical response time: within 2 business hours.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default PricingPage;
