import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Layers, ArrowRight, ArrowLeft, CheckCircle2, Loader2,
  Store, Shield, Zap, Package, BarChart2, Users,
} from "lucide-react";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  business_name: z.string().trim().min(1, "Business name is required").max(150),
  phone: z.string().trim().min(6, "Phone is required").max(20),
  email: z.string().trim().email("Invalid email").max(255),
});

type FormData = z.infer<typeof formSchema>;

const BENEFITS = [
  { icon: Package, text: "Full inventory management" },
  { icon: BarChart2, text: "Sales, purchase & profit reports" },
  { icon: Users, text: "Customer & supplier ledgers" },
  { icon: Shield, text: "Role-based access control" },
  { icon: Zap, text: "No setup fees, cancel anytime" },
  { icon: Store, text: "Multi-branch ready (Pro)" },
];

const GetStartedPage = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [form, setForm] = useState<FormData>({
    name: "",
    business_name: "",
    phone: "",
    email: "",
  });

  const update = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = formSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.issues.forEach((i) => {
        const key = i.path[0] as keyof FormData;
        if (!fieldErrors[key]) fieldErrors[key] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("contact_submissions").insert({
        name: result.data.name,
        business_name: result.data.business_name,
        phone: result.data.phone,
        email: result.data.email,
        message: `Trial request from ${result.data.business_name}`,
      });
      if (error) throw error;
      setSubmitted(true);
    } catch {
      toast({ variant: "destructive", title: "Something went wrong", description: "Please try again or contact us directly." });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Request Received!</h1>
          <p className="text-muted-foreground">
            Thank you for your interest. Our team will set up your account and contact you within 24 hours.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link to="/">
              <Button variant="outline">Back to Home</Button>
            </Link>
            <Link to="/login">
              <Button>Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Layers className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">Tiles & Sanitary ERP</span>
          </Link>
          <Link to="/login">
            <Button size="sm" variant="outline">Sign In</Button>
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          {/* Left — Benefits */}
          <div className="space-y-8">
            <div>
              <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to home
              </Link>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight mb-3">
                Start Your Free Trial
              </h1>
              <p className="text-lg text-muted-foreground">
                Get your ERP account set up within 24 hours. No credit card required.
              </p>
            </div>

            <div className="space-y-4">
              {BENEFITS.map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <b.icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <span className="text-foreground font-medium">{b.text}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-5">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">How it works:</span> Submit your details → Our team sets up your dealer account → You receive login credentials via email → Start managing your business!
              </p>
            </div>
          </div>

          {/* Right — Form */}
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-lg">
            <h2 className="text-xl font-bold text-foreground mb-6">Request Your Account</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  placeholder="Your full name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  className={errors.name ? "border-destructive" : ""}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="business_name">Business / Shop Name *</Label>
                <Input
                  id="business_name"
                  placeholder="e.g. ABC Tiles & Sanitary"
                  value={form.business_name}
                  onChange={(e) => update("business_name", e.target.value)}
                  className={errors.business_name ? "border-destructive" : ""}
                />
                {errors.business_name && <p className="text-xs text-destructive">{errors.business_name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+880 1XXX-XXXXXX"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className={errors.phone ? "border-destructive" : ""}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <Button type="submit" className="w-full h-12 text-base font-semibold gap-2" disabled={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                ) : (
                  <>Request Free Trial <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                By submitting, you agree to our{" "}
                <Link to="/terms" className="underline hover:text-foreground">Terms</Link> and{" "}
                <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GetStartedPage;
