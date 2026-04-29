import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ExternalLink, Download, Check, Phone } from "lucide-react";

/**
 * Dealer-facing User Guide page.
 *
 * Renders the full Bengali A-to-Z guide (`/dealer-guide.html`) embedded
 * inside the ERP shell so dealers never have to hunt for documentation.
 * The guide itself is a static public asset — no auth needed — but this
 * page lives behind dealer auth so the sidebar entry stays in context.
 */
const UserGuidePage = () => {
  const guideUrl = `${window.location.origin}/dealer-guide.html`;
  const openGuide = () => window.open(guideUrl, "_blank");

  const sections = [
    "পরিচিতি", "লগইন ও সেটআপ", "ড্যাশবোর্ড", "সেটিংস",
    "সাপ্লায়ার যোগ", "কাস্টমার যোগ", "প্রোডাক্ট ও SKU", "ক্রয় (Purchase)",
    "বিক্রয় (Sales)", "POS", "চালান ও ডেলিভারি", "কোটেশন",
    "সেলস ও পারচেজ রিটার্ন", "পেমেন্ট কালেকশন", "লেজার",
    "ক্রেডিট কন্ট্রোল", "ক্যাম্পেইন ও গিফট", "প্রজেক্ট",
    "ডিসপ্লে ও স্যাম্পল", "অ্যাপ্রুভাল ওয়ার্কফ্লো",
    "কাস্টমার পোর্টাল", "রিপোর্ট", "বারকোড",
    "ইউজার ম্যানেজমেন্ট", "সাবস্ক্রিপশন", "FAQ", "সাপোর্ট",
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          User Guide — সফটওয়্যার ব্যবহার গাইড
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          TilesERP কীভাবে A থেকে Z পর্যন্ত ব্যবহার করবেন তার সম্পূর্ণ বাংলা গাইড।
          নিচে scroll করে পড়ুন অথবা নতুন ট্যাবে খুলুন।
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={openGuide} variant="default">
          <ExternalLink className="h-4 w-4 mr-2" />
          নতুন ট্যাবে খুলুন
        </Button>
        <a
          href={guideUrl}
          download="TilesERP-User-Guide.html"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium px-4 py-2 border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Download className="h-4 w-4 mr-2" />
          ডাউনলোড করুন
        </a>
        <a
          href="tel:01674533303"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium px-4 py-2 border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Phone className="h-4 w-4 mr-2" />
          সাপোর্ট: 01674533303
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>গাইডে যা যা আছে</CardTitle>
          <CardDescription>সফটওয়্যারের প্রতিটি মেনুর কাজ ধাপে ধাপে শেখানো হয়েছে।</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
            {sections.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 p-2 rounded-md bg-muted/40 border"
              >
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>সম্পূর্ণ গাইড</CardTitle>
          <CardDescription>নিচে স্ক্রল করে পুরো গাইডটি পড়তে পারেন।</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden bg-background" style={{ height: "75vh" }}>
            <iframe
              src={guideUrl}
              title="TilesERP User Guide"
              className="w-full h-full"
              style={{ border: "none" }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserGuidePage;
