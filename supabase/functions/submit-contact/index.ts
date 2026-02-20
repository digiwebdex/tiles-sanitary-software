import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { name, business_name, phone, email, message } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 100) {
      return new Response(JSON.stringify({ error: "Valid name is required (max 100 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 255) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!message || typeof message !== "string" || message.trim().length < 5 || message.trim().length > 2000) {
      return new Response(JSON.stringify({ error: "Message must be between 5 and 2000 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save to database using service role (bypass RLS for insert)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: dbError } = await supabase
      .from("contact_submissions")
      .insert({
        name: name.trim(),
        business_name: business_name?.trim() || null,
        phone: phone?.trim() || null,
        email: email.trim().toLowerCase(),
        message: message.trim(),
      });

    if (dbError) {
      console.error("DB insert error:", dbError);
      return new Response(JSON.stringify({ error: "Failed to save submission" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email via SMTP
    const SMTP_HOST = Deno.env.get("SMTP_HOST");
    const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") || "587");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");
    const SMTP_FROM = Deno.env.get("SMTP_FROM") || SMTP_USER;
    const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");

    if (SMTP_HOST && SMTP_USER && SMTP_PASS && ADMIN_EMAIL) {
      try {
        const client = new SmtpClient();

        await client.connectTLS({
          hostname: SMTP_HOST,
          port: SMTP_PORT,
          username: SMTP_USER!,
          password: SMTP_PASS!,
        });

        const emailBody = `New contact form submission from Tiles & Sanitary ERP website:

Name:          ${name.trim()}
Business Name: ${business_name?.trim() || "—"}
Phone:         ${phone?.trim() || "—"}
Email:         ${email.trim()}

Message:
${message.trim()}

---
Submitted at: ${new Date().toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}`;

        await client.send({
          from: SMTP_FROM!,
          to: ADMIN_EMAIL,
          subject: `New Contact: ${name.trim()} — ${business_name?.trim() || "No business name"}`,
          content: emailBody,
        });

        await client.close();
        console.log("SMTP email sent successfully.");
      } catch (emailErr) {
        console.error("SMTP email error:", emailErr);
        // Don't fail the whole request if email fails — submission is already saved
      }
    } else {
      console.log("SMTP not fully configured — submission saved to DB only.");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
