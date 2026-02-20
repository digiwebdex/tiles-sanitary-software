import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Globe, Save, RefreshCw, Eye, EyeOff,
  LayoutTemplate, Star, CreditCard, Shield, Info,
  Mail, AlignLeft, Search, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

const SECTIONS = [
  { key: "hero",     label: "Hero",     icon: LayoutTemplate, description: "Main landing page banner" },
  { key: "features", label: "Features", icon: Star,           description: "Product feature highlights" },
  { key: "pricing",  label: "Pricing",  icon: CreditCard,     description: "Pricing section" },
  { key: "security", label: "Security", icon: Shield,         description: "Security & trust section" },
  { key: "about",    label: "About",    icon: Info,           description: "About the company" },
  { key: "contact",  label: "Contact",  icon: Mail,           description: "Contact information" },
  { key: "footer",   label: "Footer",   icon: AlignLeft,      description: "Site footer text" },
  { key: "seo",      label: "SEO",      icon: Search,         description: "Meta title & description" },
];

type WebsiteContent = {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  description: string | null;
  button_text: string | null;
  button_link: string | null;
  extra_json: Record<string, any> | null;
  updated_at: string;
};

const SectionForm = ({
  section,
  data,
  onSave,
  isSaving,
}: {
  section: (typeof SECTIONS)[number];
  data: WebsiteContent | undefined;
  onSave: (values: Partial<WebsiteContent>) => void;
  isSaving: boolean;
}) => {
  const [form, setForm] = useState({
    title:       data?.title       ?? "",
    subtitle:    data?.subtitle    ?? "",
    description: data?.description ?? "",
    button_text: data?.button_text ?? "",
    button_link: data?.button_link ?? "",
    extra_json:  data?.extra_json  ? JSON.stringify(data.extra_json, null, 2) : "{}",
  });
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showExtra, setShowExtra] = useState(false);

  const field = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    try {
      const parsed = JSON.parse(form.extra_json);
      onSave({
        section_key: section.key,
        title:       form.title || null,
        subtitle:    form.subtitle || null,
        description: form.description || null,
        button_text: form.button_text || null,
        button_link: form.button_link || null,
        extra_json:  parsed,
      });
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON. Please fix before saving.");
    }
  };

  const isSeoSection   = section.key === "seo";
  const isFooterSection = section.key === "footer";

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor={`${section.key}-title`}>{isSeoSection ? "Meta Title" : "Title"}</Label>
        <Input
          id={`${section.key}-title`}
          value={form.title}
          onChange={(e) => field("title")(e.target.value)}
          placeholder={isSeoSection ? "Page title for search engines" : "Section heading"}
        />
      </div>

      {/* Subtitle — skip for SEO & footer */}
      {!isSeoSection && !isFooterSection && (
        <div className="space-y-1.5">
          <Label htmlFor={`${section.key}-subtitle`}>Subtitle</Label>
          <Input
            id={`${section.key}-subtitle`}
            value={form.subtitle}
            onChange={(e) => field("subtitle")(e.target.value)}
            placeholder="Supporting text below the title"
          />
        </div>
      )}

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor={`${section.key}-desc`}>
          {isSeoSection ? "Meta Description" : "Description"}
        </Label>
        <Textarea
          id={`${section.key}-desc`}
          value={form.description}
          onChange={(e) => field("description")(e.target.value)}
          placeholder={isSeoSection ? "160-character page description for SEO" : "Paragraph text for this section"}
          className="min-h-[100px]"
        />
        {isSeoSection && (
          <p className={`text-xs ${form.description.length > 160 ? "text-destructive" : "text-muted-foreground"}`}>
            {form.description.length}/160 characters
          </p>
        )}
      </div>

      {/* Button fields — skip for SEO & footer */}
      {!isSeoSection && !isFooterSection && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${section.key}-btn`}>Button Text</Label>
            <Input
              id={`${section.key}-btn`}
              value={form.button_text}
              onChange={(e) => field("button_text")(e.target.value)}
              placeholder="Get Started"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${section.key}-link`}>Button Link</Label>
            <Input
              id={`${section.key}-link`}
              value={form.button_link}
              onChange={(e) => field("button_link")(e.target.value)}
              placeholder="/login or #section"
            />
          </div>
        </div>
      )}

      {/* Extra JSON */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setShowExtra((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showExtra ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showExtra ? "Hide" : "Show"} Extra JSON (advanced)
        </button>

        {showExtra && (
          <div className="space-y-1">
            <Textarea
              value={form.extra_json}
              onChange={(e) => field("extra_json")(e.target.value)}
              className="min-h-[140px] font-mono text-xs"
              placeholder='{"key": "value"}'
            />
            {jsonError && (
              <p className="text-xs text-destructive">{jsonError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Store structured data (badge text, emails, social links, etc.)
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-xs text-muted-foreground">
          {data?.updated_at ? `Last saved: ${format(new Date(data.updated_at), "dd MMM yyyy, HH:mm")}` : "Not yet saved"}
        </span>
        <Button onClick={handleSave} disabled={isSaving} size="sm" className="gap-2">
          {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isSaving ? "Saving…" : "Save Section"}
        </Button>
      </div>
    </div>
  );
};

const SACmsPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  const { data: allContent = [], isLoading } = useQuery<WebsiteContent[]>({
    queryKey: ["website-content-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_content")
        .select("*")
        .order("section_key");
      if (error) throw new Error(error.message);
      return (data ?? []) as WebsiteContent[];
    },
  });

  const contentByKey = Object.fromEntries(allContent.map((c) => [c.section_key, c]));

  const { mutate: saveSection, isPending: isSaving } = useMutation({
    mutationFn: async (values: Partial<WebsiteContent>) => {
      const payload = {
        section_key: values.section_key!,
        title:       values.title       ?? null,
        subtitle:    values.subtitle    ?? null,
        description: values.description ?? null,
        button_text: values.button_text ?? null,
        button_link: values.button_link ?? null,
        extra_json:  values.extra_json  ?? {},
      };
      const { error } = await supabase
        .from("website_content")
        .upsert(payload, { onConflict: "section_key" });
      if (error) throw new Error(error.message);
      return values.section_key;
    },
    onSuccess: (key) => {
      toast({ title: "Section saved", description: `"${key}" has been updated.` });
      setSavedKeys((prev) => new Set([...prev, key as string]));
      qc.invalidateQueries({ queryKey: ["website-content-all"] });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Loading CMS content…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Landing Page CMS</h1>
            <p className="text-sm text-muted-foreground">
              Edit content for each section of your public landing page.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
            {allContent.length} / {SECTIONS.length} sections loaded
          </Badge>
        </div>
      </div>

      {/* Status row */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {SECTIONS.map((s) => {
          const saved = savedKeys.has(s.key);
          const exists = Boolean(contentByKey[s.key]);
          return (
            <div
              key={s.key}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center ${
                saved ? "border-primary/50 bg-primary/5" : exists ? "border-border bg-muted/30" : "border-dashed border-border"
              }`}
            >
              <s.icon className={`h-3.5 w-3.5 ${saved ? "text-primary" : "text-muted-foreground"}`} />
              <span className="text-[10px] font-medium capitalize text-foreground leading-none">{s.key}</span>
              {saved && <CheckCircle2 className="h-3 w-3 text-primary" />}
            </div>
          );
        })}
      </div>

      {/* Section Tabs */}
      <Tabs defaultValue="hero">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1">
          {SECTIONS.map((s) => (
            <TabsTrigger key={s.key} value={s.key} className="gap-1.5 text-xs capitalize">
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {SECTIONS.map((s) => (
          <TabsContent key={s.key} value={s.key} className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <s.icon className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">{s.label} Section</CardTitle>
                </div>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <SectionForm
                  section={s}
                  data={contentByKey[s.key]}
                  onSave={saveSection}
                  isSaving={isSaving}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default SACmsPage;
