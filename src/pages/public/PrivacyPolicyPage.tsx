import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Layers, ArrowRight, ArrowLeft,
  Shield, Lock, Database, UserCheck, Cookie, Mail,
  Phone, MapPin,
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
          <p className="font-semibold text-sm text-foreground mb-3">Legal</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/privacy" className="text-primary font-medium">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-foreground transition-colors">Terms & Conditions</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground mb-3">Contact</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-primary" /><span>+880 1234-567890</span></li>
            <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-primary" /><span>support@yourdomain.com</span></li>
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

/* ─── POLICY SECTIONS ─── */
const SECTIONS = [
  {
    icon: Database,
    title: "1. Information We Collect",
    content: [
      "We collect only business-related information necessary to provide our ERP services. This includes:",
      "• Business name, contact details, and owner information provided during registration.",
      "• Transaction data such as sales, purchases, inventory records, and customer/supplier details that you enter into the system.",
      "• Login credentials and authentication tokens for secure access.",
      "• Usage data and system logs for performance monitoring and security auditing.",
      "We do not collect unnecessary personal information beyond what is required to operate your business account.",
    ],
  },
  {
    icon: Shield,
    title: "2. How We Use Your Information",
    content: [
      "Your data is used exclusively to deliver and improve our ERP services:",
      "• To operate, maintain, and provide the features and functionality of the platform.",
      "• To send operational notifications such as daily business summaries via SMS or email (if enabled).",
      "• To generate reports and analytics within your own account.",
      "• To provide customer support and respond to your inquiries.",
      "• To detect, investigate, and prevent fraudulent transactions and other illegal activities.",
    ],
  },
  {
    icon: UserCheck,
    title: "3. We Do Not Sell or Share Your Data",
    content: [
      "Your data is your business. We do not sell, trade, rent, or share your personal or business information with any third parties for commercial purposes.",
      "Data is only disclosed in the following limited circumstances:",
      "• When required by law, court order, or government authority.",
      "• To protect the rights, property, or safety of our company, users, or the public.",
      "• With your explicit written consent.",
      "We do not use your data for advertising or marketing to third parties.",
    ],
  },
  {
    icon: Lock,
    title: "4. Data Security & Storage",
    content: [
      "All data is stored securely in encrypted cloud servers with enterprise-grade protection:",
      "• AES-256 encryption for all data at rest and in transit (TLS/HTTPS).",
      "• Hosted on AWS (Amazon Web Services) with restricted network access and monitoring.",
      "• Daily automated backups with 30-day retention for disaster recovery.",
      "• Row-level security enforced at the database level — each dealer's data is completely isolated.",
      "• Regular security audits and vulnerability assessments.",
      "While we implement industry-best practices, no system is 100% impenetrable. We encourage you to use strong passwords and keep your credentials secure.",
    ],
  },
  {
    icon: UserCheck,
    title: "5. Your Control Over Your Data",
    content: [
      "You retain full ownership and control over your business data at all times:",
      "• You can access, edit, or delete any record within your account at any time.",
      "• You can export your business data through the ERP system.",
      "• Upon cancellation of your subscription, you may request a full data export within 30 days.",
      "• After the 30-day period, data may be permanently deleted from our servers.",
      "• You can contact us at any time to request account deletion or data removal.",
    ],
  },
  {
    icon: Cookie,
    title: "6. Cookies & Session Management",
    content: [
      "We use cookies and similar technologies for session management and system functionality:",
      "• Session Cookies: Used to keep you logged in during your active session. These are deleted when you close your browser.",
      "• Authentication Tokens: Stored securely to manage your login state and prevent unauthorized access.",
      "• Preference Cookies: Used to remember your language and display preferences.",
      "We do not use advertising or tracking cookies. You can configure your browser to reject cookies, but this may affect the functionality of the platform.",
    ],
  },
  {
    icon: Mail,
    title: "7. Third-Party Services",
    content: [
      "We use a limited number of trusted third-party services to operate the platform:",
      "• Cloud infrastructure (AWS) for hosting and data storage.",
      "• SMS gateway providers for notification delivery (only when enabled by you).",
      "• These providers are contractually bound to protect your data and may not use it for any other purpose.",
      "We do not integrate with advertising networks, social media trackers, or analytics services that collect your business data.",
    ],
  },
  {
    icon: Shield,
    title: "8. Data Retention",
    content: [
      "We retain your data for as long as your account is active or as needed to provide services:",
      "• Active account data is retained indefinitely to ensure business continuity.",
      "• After account cancellation, data is retained for 30 days to allow for export.",
      "• Audit logs are retained for up to 12 months for security and compliance purposes.",
      "• After the retention period, data is permanently and securely deleted.",
    ],
  },
  {
    icon: Mail,
    title: "9. Changes to This Policy",
    content: [
      "We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements.",
      "• Significant changes will be communicated via email or an in-app notification.",
      "• Continued use of the platform after notification constitutes acceptance of the updated policy.",
      "• We encourage you to review this page periodically.",
      "The last updated date is displayed at the top of this page.",
    ],
  },
];

/* ─── MAIN PAGE ─── */
const PrivacyPolicyPage = () => {
  const lastUpdated = "February 20, 2026";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="py-16 text-center bg-gradient-to-br from-background via-muted/30 to-background border-b border-border">
        <div className="max-w-3xl mx-auto px-4">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-6 mx-auto">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <Badge variant="outline" className="mb-4 px-3 py-1 text-xs">Legal</Badge>
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground text-lg mb-4">
            We are committed to protecting your privacy and your business data.
          </p>
          <p className="text-sm text-muted-foreground">
            Last updated: <span className="font-medium text-foreground">{lastUpdated}</span>
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">

          {/* Intro card */}
          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-6 mb-10">
            <p className="text-foreground leading-relaxed">
              This Privacy Policy describes how <strong>Tiles & Sanitary ERP</strong> ("we", "us", or "our") collects,
              uses, and protects information when you use our platform. By using our services, you agree to the
              practices described in this policy. If you do not agree, please discontinue use of our platform.
            </p>
          </div>

          {/* Policy sections */}
          <div className="space-y-8">
            {SECTIONS.map((section, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-6 sm:p-8">
                <div className="flex items-start gap-4 mb-4">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground pt-1.5">{section.title}</h2>
                </div>
                <div className="space-y-2 pl-14">
                  {section.content.map((line, li) => (
                    <p
                      key={li}
                      className={`text-sm leading-relaxed ${
                        li === 0 ? "text-foreground font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Contact for privacy concerns */}
          <div className="mt-10 rounded-2xl bg-primary text-primary-foreground p-8 text-center">
            <Mail className="h-10 w-10 mx-auto mb-4 text-primary-foreground/70" />
            <h2 className="text-2xl font-bold mb-2">Privacy Concerns?</h2>
            <p className="text-primary-foreground/70 mb-6 max-w-md mx-auto">
              If you have any questions about this Privacy Policy or how we handle your data, please reach out to us directly.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="mailto:support@yourdomain.com">
                <Button size="lg" variant="secondary" className="gap-2 px-8 h-12">
                  <Mail className="h-4 w-4" />
                  support@yourdomain.com
                </Button>
              </a>
              <a href="tel:+8801234567890">
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 px-8 h-12 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Phone className="h-4 w-4" />
                  +880 1234-567890
                </Button>
              </a>
            </div>
          </div>

          {/* Back link */}
          <div className="mt-10 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
            </Link>
            <Link to="/terms" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Terms & Conditions <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default PrivacyPolicyPage;
