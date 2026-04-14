import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Layers, ArrowRight, ArrowLeft, FileText,
  CreditCard, AlertTriangle, ShieldCheck, Ban,
  Globe, Scale, Mail, Phone, MapPin, RefreshCw,
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
            <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
            <li><Link to="/terms" className="text-primary font-medium">Terms & Conditions</Link></li>
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

/* ─── TERM SECTIONS ─── */
const SECTIONS = [
  {
    icon: FileText,
    title: "1. Acceptance of Terms",
    content: [
      "By registering for or using the Tiles & Sanitary ERP platform, you agree to be bound by these Terms and Conditions.",
      "• These terms constitute a legally binding agreement between you (the \"Dealer\" or \"User\") and Tiles & Sanitary ERP (the \"Company\").",
      "• If you do not agree with any part of these terms, you must not use our services.",
      "• We reserve the right to update these terms at any time. Continued use of the platform after changes constitutes acceptance.",
      "• These terms apply to all users of the platform, including owners, administrators, and salesmen.",
    ],
  },
  {
    icon: CreditCard,
    title: "2. Subscription-Based SaaS Model",
    content: [
      "Our platform operates on a Software-as-a-Service (SaaS) subscription model.",
      "• Access to the platform is granted on a subscription basis — you pay for the right to use the software, not to own it.",
      "• Subscription plans (Basic, Standard, Premium) are described on our Pricing page and may change with notice.",
      "• Each subscription is tied to a single dealer account as defined by your chosen plan.",
      "• Subscriptions begin on the activation date and renew automatically at the end of each billing period unless cancelled.",
      "• Free trials, if offered, are subject to separate terms and may require payment information upon signup.",
    ],
  },
  {
    icon: RefreshCw,
    title: "3. Billing — Monthly & Yearly Plans",
    content: [
      "We offer both monthly and yearly billing cycles for all subscription plans.",
      "• Monthly Plan: Billed every calendar month on the same date as the initial subscription start.",
      "• Yearly Plan: Billed annually at a discounted rate. Yearly subscribers receive approximately 10% savings compared to monthly billing.",
      "• All prices are listed in Bangladeshi Taka (৳) and are inclusive of applicable charges.",
      "• Payments accepted via cash, bank transfer, and mobile banking (bKash, Nagad, or equivalent).",
      "• Invoices are issued electronically upon each successful payment.",
      "• Failure to make payment by the due date may result in service suspension (see Section 6).",
    ],
  },
  {
    icon: AlertTriangle,
    title: "4. No Liability for Misuse",
    content: [
      "The Company is not liable for any damages arising from misuse of the platform.",
      "• You are solely responsible for all activities conducted under your account, including actions by your staff.",
      "• The Company shall not be held liable for any incorrect data entry, report errors, or financial losses resulting from platform usage.",
      "• We are not responsible for decisions made based on reports, analytics, or data displayed in the system.",
      "• The platform is provided \"as is\" without warranties of any kind, express or implied, including fitness for a particular purpose.",
      "• In no event shall the Company's total liability exceed the amount paid by you in the preceding three (3) months.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "5. Data Responsibility Remains With the Dealer",
    content: [
      "You retain full ownership and responsibility for all business data entered into the system.",
      "• The accuracy, legality, and completeness of all data — including customer information, transactions, and financial records — is your responsibility.",
      "• You must ensure that data entered does not violate any applicable laws, including data protection and privacy regulations.",
      "• The Company acts as a data processor on your behalf; you are the data controller.",
      "• You are responsible for ensuring your staff have appropriate access permissions and for managing user accounts within your subscription.",
      "• The Company will not be held responsible for data loss resulting from unauthorized access due to weak passwords or compromised credentials on your end.",
    ],
  },
  {
    icon: Ban,
    title: "6. Service Suspension for Non-Payment",
    content: [
      "Access to the platform may be suspended if subscription payments are not received on time.",
      "• A grace period of 3 days is provided after the subscription expiry date before access is restricted.",
      "• During the grace period, the system enters a read-only mode — you can view data but cannot create or modify records.",
      "• After the grace period, access is fully suspended until payment is received and the subscription is renewed.",
      "• Data is retained for 30 days after suspension. After this period, data may be permanently deleted.",
      "• The Company reserves the right to permanently terminate accounts with repeated or extended non-payment without further notice.",
    ],
  },
  {
    icon: Globe,
    title: "7. No Resale Without Permission",
    content: [
      "You may not resell, sublicense, or redistribute the platform or its services without prior written permission.",
      "• You are licensed to use the software for your own business operations only.",
      "• You may not copy, modify, create derivative works of, or reverse-engineer any part of the platform.",
      "• You may not resell access to the system to third parties or use it to offer competing services.",
      "• Unauthorized resale or sublicensing will result in immediate account termination without refund.",
      "• Violation of this clause may result in legal action for intellectual property infringement.",
    ],
  },
  {
    icon: Scale,
    title: "8. Governing Law & Dispute Resolution",
    content: [
      "These Terms and Conditions are governed by the laws of the People's Republic of Bangladesh.",
      "• Any disputes arising from or related to these terms or your use of the platform shall be resolved under Bangladesh law.",
      "• The courts of Dhaka, Bangladesh shall have exclusive jurisdiction over any legal proceedings.",
      "• Before initiating legal proceedings, both parties agree to attempt to resolve disputes amicably through direct negotiation.",
      "• If negotiation fails, disputes shall be referred to mediation in Dhaka before proceeding to formal legal action.",
      "• Nothing in this clause limits our right to seek injunctive or other equitable relief in any court of competent jurisdiction.",
    ],
  },
  {
    icon: FileText,
    title: "9. Termination",
    content: [
      "Either party may terminate the subscription at any time, subject to the following conditions.",
      "• You may cancel your subscription at any time through your account settings or by contacting support.",
      "• Cancellation takes effect at the end of the current billing period — no partial refunds are issued.",
      "• The Company may terminate your account immediately for violations of these terms, fraudulent activity, or abuse of the platform.",
      "• Upon termination, you will have 30 days to export your data before it is permanently deleted.",
    ],
  },
  {
    icon: Mail,
    title: "10. Contact & Notices",
    content: [
      "For any questions, concerns, or legal notices regarding these Terms and Conditions, please contact us.",
      "• Email: support@yourdomain.com",
      "• Phone: +880 1234-567890",
      "• Address: Dhaka, Bangladesh",
      "• All legal notices must be submitted in writing via email or registered post.",
      "• We will respond to all queries within 2 business days.",
    ],
  },
];

/* ─── MAIN PAGE ─── */
const TermsPage = () => {
  const lastUpdated = "February 20, 2026";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="py-16 text-center bg-gradient-to-br from-background via-muted/30 to-background border-b border-border">
        <div className="max-w-3xl mx-auto px-4">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-6 mx-auto">
            <Scale className="h-7 w-7 text-primary" />
          </div>
          <Badge variant="outline" className="mb-4 px-3 py-1 text-xs">Legal</Badge>
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 tracking-tight">
            Terms & Conditions
          </h1>
          <p className="text-muted-foreground text-lg mb-4">
            Please read these terms carefully before using the Tiles & Sanitary ERP platform.
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
              These Terms and Conditions govern your use of <strong>Tiles & Sanitary ERP</strong>, a cloud-based
              business management platform. By accessing or using our services, you acknowledge that you have
              read, understood, and agree to be bound by these terms. These terms apply to all subscribers,
              users, and visitors.
            </p>
          </div>

          {/* Quick summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {[
              { icon: CreditCard,    label: "SaaS Subscription",    note: "Monthly or yearly billing" },
              { icon: ShieldCheck,   label: "Data Ownership",        note: "Your data stays yours" },
              { icon: Ban,           label: "Non-Payment Suspension", note: "3-day grace period" },
              { icon: Scale,         label: "Bangladesh Law",        note: "Dhaka jurisdiction" },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-2 mx-auto">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>
              </div>
            ))}
          </div>

          {/* Terms sections */}
          <div className="space-y-6">
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

          {/* Agreement CTA */}
          <div className="mt-10 rounded-2xl bg-primary text-primary-foreground p-8 text-center">
            <Scale className="h-10 w-10 mx-auto mb-4 text-primary-foreground/70" />
            <h2 className="text-2xl font-bold mb-2">Questions About These Terms?</h2>
            <p className="text-primary-foreground/70 mb-6 max-w-md mx-auto">
              If you need clarification on any clause or have a legal inquiry, our team is here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="mailto:support@yourdomain.com">
                <Button size="lg" variant="secondary" className="gap-2 px-8 h-12">
                  <Mail className="h-4 w-4" />
                  support@yourdomain.com
                </Button>
              </a>
              <a href="tel:+8801674533303">
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 px-8 h-12 border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Phone className="h-4 w-4" />
                  +880 1674-533303
                </Button>
              </a>
            </div>
          </div>

          {/* Back / forward nav */}
          <div className="mt-10 flex items-center justify-between">
            <Link to="/privacy" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Privacy Policy
            </Link>
            <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Back to Home <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default TermsPage;
