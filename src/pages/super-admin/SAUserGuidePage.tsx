import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, Copy, Share2, ExternalLink, Mail, MessageCircle, Check, Download, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const SAUserGuidePage = () => {
  const [copied, setCopied] = useState(false);

  const guideUrl = `${window.location.origin}/dealer-guide.html`;
  const shareTitle = "TilesERP — ডিলার ব্যবহার গাইড (A to Z)";
  const shareText = "TilesERP সফটওয়্যার ব্যবহারের সম্পূর্ণ বাংলা গাইড দেখুন:";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(guideUrl);
      setCopied(true);
      toast({ title: "লিংক কপি হয়েছে", description: guideUrl });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "কপি করা যায়নি", variant: "destructive" });
    }
  };

  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${guideUrl}`)}`;
    window.open(url, "_blank");
  };

  const shareEmail = () => {
    const url = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareText}\n\n${guideUrl}`)}`;
    window.location.href = url;
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: guideUrl });
      } catch {
        // user cancelled
      }
    } else {
      copyLink();
    }
  };

  const openGuide = () => window.open(guideUrl, "_blank");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          ডিলার ব্যবহার গাইড
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          A-to-Z বাংলা গাইড যা ডিলারদের সাথে শেয়ার করতে পারবেন।
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>গাইড লিংক</CardTitle>
          <CardDescription>এই লিংকটি ডিলারদের সাথে শেয়ার করুন। কোনো লগইন প্রয়োজন নেই।</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="guide-url">পাবলিক URL</Label>
            <div className="flex gap-2">
              <Input id="guide-url" value={guideUrl} readOnly className="font-mono text-sm" />
              <Button onClick={copyLink} variant="outline" className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">{copied ? "কপি হয়েছে" : "কপি"}</span>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Button onClick={openGuide} variant="default" className="w-full">
              <Eye className="h-4 w-4 mr-2" />
              দেখুন
            </Button>
            <Button onClick={shareWhatsApp} variant="outline" className="w-full">
              <MessageCircle className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
            <Button onClick={shareEmail} variant="outline" className="w-full">
              <Mail className="h-4 w-4 mr-2" />
              ইমেইল
            </Button>
            <Button onClick={shareNative} variant="outline" className="w-full">
              <Share2 className="h-4 w-4 mr-2" />
              শেয়ার
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>প্রিভিউ</CardTitle>
          <CardDescription>এম্বেডেড প্রিভিউ — ডিলার ঠিক এটাই দেখবে।</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden bg-background" style={{ height: "70vh" }}>
            <iframe
              src={guideUrl}
              title="Dealer Guide Preview"
              className="w-full h-full"
              style={{ border: "none" }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Button variant="link" size="sm" onClick={openGuide} className="h-auto p-0">
              <ExternalLink className="h-3 w-3 mr-1" />
              নতুন ট্যাবে খুলুন
            </Button>
            <span>•</span>
            <a
              href={guideUrl}
              download="TilesERP-Dealer-Guide.html"
              className="text-primary hover:underline inline-flex items-center"
            >
              <Download className="h-3 w-3 mr-1" />
              ডাউনলোড করুন
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>গাইডে যা যা আছে</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {[
              "১. পরিচিতি", "২. অ্যাকাউন্ট খোলা", "৩. লগইন",
              "৪. ড্যাশবোর্ড", "৫. সেটিংস", "৬. সাপ্লায়ার",
              "৭. কাস্টমার", "৮. প্রোডাক্ট", "৯. ক্রয়",
              "১০. বিক্রয়", "১১. POS", "১২. চালান ও ডেলিভারি",
              "১৩. কোটেশন", "১৪. ফেরত", "১৫. পেমেন্ট",
              "১৬. লেজার", "১৭. ক্রেডিট কন্ট্রোল", "১৮. ক্যাম্পেইন",
              "১৯. প্রজেক্ট", "২০. ডিসপ্লে স্যাম্পল", "২১. অ্যাপ্রুভাল",
              "২২. কাস্টমার পোর্টাল", "২৩. রিপোর্ট", "২৪. বারকোড",
              "২৫. ইউজার", "২৬. সাবস্ক্রিপশন", "২৭. FAQ", "২৮. সাপোর্ট",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border"
              >
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SAUserGuidePage;
