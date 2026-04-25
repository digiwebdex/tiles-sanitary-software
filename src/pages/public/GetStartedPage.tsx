import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { authBridge } from "@/lib/authBridge";
import {
  Layers, ArrowRight, ArrowLeft, CheckCircle2, Loader2,
  Store, Shield, Zap, Package, BarChart2, Users, Eye, EyeOff,
} from "lucide-react";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  business_name: z.string().trim().min(1, "Business name is required").max(150),
  phone: z.string().trim().min(6, "Phone is required").max(20),
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
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

const STEPS = [
  { num: "1", text: "Fill in your details" },
  { num: "2", text: "Account created instantly" },
  { num: "3", text: "Start managing your business" },
];

const GetStartedPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [form, setForm] = useState<FormData>({
    name: "",
    business_name: "",
    phone: "",
    email: "",
    password: "",
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
      const signupResult = await authBridge.signUp({
        name: result.data.name,
        business_name: result.data.business_name,
        phone: result.data.phone,
        email: result.data.email,
        password: result.data.password,
      });

      if (!signupResult.success) {
        throw new Error(signupResult.message || "Signup failed. Please try again.");
      }

      // Account created in PENDING state — no auto-login.
      setSubmitted(true);
      toast({
        title: "Registration Submitted ✅",
        description: "Your account is awaiting Super Admin approval.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Signup Failed",
        description: err.message || "Please try again or contact support.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-[#0d1117]/90 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg text-white">TilesERP</span>
          </Link>
          <Link to="/login">
            <Button size="sm" className="bg-white text-gray-900 hover:bg-gray-100 font-semibold border-0">Sign In</Button>
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          {/* Left — Benefits */}
          <div className="space-y-8">
            <div>
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-orange-400 transition-colors mb-5"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to home
              </Link>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
                Create Your <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">Account</span>
              </h1>
              <p className="text-lg text-gray-400 leading-relaxed">
                Set up your ERP instantly. <span className="text-orange-400 font-semibold">3-day free trial</span> — no credit card needed.
              </p>
            </div>

            <div className="space-y-3.5">
              {BENEFITS.map((b, i) => (
                <div key={i} className="flex items-center gap-3.5 group">
                  <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500/20 transition-colors">
                    <b.icon className="h-5 w-5 text-orange-400" />
                  </div>
                  <span className="text-gray-300 font-medium">{b.text}</span>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
              <p className="font-semibold text-white text-sm uppercase tracking-wider">How it works</p>
              <div className="space-y-3">
                {STEPS.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {s.num}
                    </div>
                    <span className="text-sm text-gray-500">{s.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Form */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 shadow-2xl shadow-black/20 backdrop-blur-sm">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">Get Started Free</h2>
              <p className="text-sm text-gray-500 mt-1">Create your dealer account in seconds</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-medium text-gray-300">Full Name *</Label>
                  <Input
                    id="name"
                    placeholder="Your full name"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    className={`h-11 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-orange-500 focus:ring-orange-500/20 ${errors.name ? "border-red-500" : ""}`}
                  />
                  {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="business_name" className="text-sm font-medium text-gray-300">Business Name *</Label>
                  <Input
                    id="business_name"
                    placeholder="e.g. ABC Tiles"
                    value={form.business_name}
                    onChange={(e) => update("business_name", e.target.value)}
                    className={`h-11 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-orange-500 focus:ring-orange-500/20 ${errors.business_name ? "border-red-500" : ""}`}
                  />
                  {errors.business_name && <p className="text-xs text-red-400">{errors.business_name}</p>}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-sm font-medium text-gray-300">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+880 1XXX-XXXXXX"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    className={`h-11 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-orange-500 focus:ring-orange-500/20 ${errors.phone ? "border-red-500" : ""}`}
                  />
                  {errors.phone && <p className="text-xs text-red-400">{errors.phone}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-gray-300">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    className={`h-11 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-orange-500 focus:ring-orange-500/20 ${errors.email ? "border-red-500" : ""}`}
                  />
                  {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-gray-300">Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 6 characters"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    className={`h-11 pr-10 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-orange-500 focus:ring-orange-500/20 ${errors.password ? "border-red-500" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-bold gap-2 rounded-xl mt-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-0 shadow-lg shadow-orange-500/20"
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating Account…</>
                ) : (
                  <><Zap className="h-4 w-4" /> Create Free Account</>
                )}
              </Button>

              <p className="text-xs text-gray-600 text-center pt-1">
                By signing up, you agree to our{" "}
                <Link to="/terms" className="underline hover:text-orange-400">Terms</Link> and{" "}
                <Link to="/privacy" className="underline hover:text-orange-400">Privacy Policy</Link>.
              </p>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#0d1117] px-2 text-gray-600">or</span>
                </div>
              </div>

              <p className="text-sm text-center text-gray-500">
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-orange-400 hover:underline">
                  Sign In
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GetStartedPage;
