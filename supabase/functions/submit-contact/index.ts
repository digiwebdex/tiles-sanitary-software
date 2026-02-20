import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const enc = (s: string) => new TextEncoder().encode(s + "\r\n");
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

async function readResponse(conn: Deno.Conn): Promise<string> {
  const buf = new Uint8Array(4096);
  let result = "";
  while (true) {
    const n = await conn.read(buf);
    if (n === null) break;
    result += dec(buf.subarray(0, n));
    if (result.includes("\r\n")) break;
  }
  return result.trim();
}

async function writeCmd(conn: Deno.Conn, line: string): Promise<string> {
  await conn.write(enc(line));
  return await readResponse(conn);
}

async function smtpSession(conn: Deno.Conn, opts: {
  host: string; user: string; pass: string;
  from: string; to: string; subject: string; body: string;
}) {
  await readResponse(conn); // greeting
  await writeCmd(conn, `EHLO ${opts.host}`);
  await writeCmd(conn, "AUTH LOGIN");
  await writeCmd(conn, b64(opts.user));
  await writeCmd(conn, b64(opts.pass));

  const mf = await writeCmd(conn, `MAIL FROM:<${opts.from}>`);
  if (!mf.startsWith("250")) throw new Error(`MAIL FROM failed: ${mf}`);

  const rt = await writeCmd(conn, `RCPT TO:<${opts.to}>`);
  if (!rt.startsWith("250")) throw new Error(`RCPT TO failed: ${rt}`);

  await writeCmd(conn, "DATA");
  const email = `From: ${opts.from}\r\nTo: ${opts.to}\r\nSubject: ${opts.subject}\r\n\r\n${opts.body}\r\n.`;
  await writeCmd(conn, email);
  await writeCmd(conn, "QUIT");
}

async function sendSmtpEmail(opts: {
  host: string; port: number; user: string; pass: string;
  from: string; to: string; subject: string; body: string;
}): Promise<void> {
  const useTLS = opts.port === 465;

  if (useTLS) {
    const conn = await Deno.connectTls({ hostname: opts.host, port: opts.port });
    await smtpSession(conn, opts);
    conn.close();
  } else {
    const plain = await Deno.connect({ hostname: opts.host, port: opts.port });
    await readResponse(plain); // greeting
    await writeCmd(plain, `EHLO ${opts.host}`);
    const stResp = await writeCmd(plain, "STARTTLS");
    plain.close();

    if (!stResp.startsWith("220")) throw new Error(`STARTTLS rejected: ${stResp}`);

    const tls = await Deno.connectTls({ hostname: opts.host, port: opts.port });
    await smtpSession(tls, opts);
    tls.close();
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { name, business_name, phone, email, message } = body;

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

    const SMTP_HOST   = Deno.env.get("SMTP_HOST");
    const SMTP_PORT   = parseInt(Deno.env.get("SMTP_PORT") || "587");
    const SMTP_USER   = Deno.env.get("SMTP_USER");
    const SMTP_PASS   = Deno.env.get("SMTP_PASS");
    const SMTP_FROM   = Deno.env.get("SMTP_FROM") || SMTP_USER;
    const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");

    if (SMTP_HOST && SMTP_USER && SMTP_PASS && ADMIN_EMAIL) {
      try {
        const emailBody =
`New contact form submission from Tiles & Sanitary ERP website:

Name:          ${name.trim()}
Business Name: ${business_name?.trim() || "—"}
Phone:         ${phone?.trim() || "—"}
Email:         ${email.trim()}

Message:
${message.trim()}

---
Submitted at: ${new Date().toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}`;

        await sendSmtpEmail({
          host: SMTP_HOST,
          port: SMTP_PORT,
          user: SMTP_USER!,
          pass: SMTP_PASS!,
          from: SMTP_FROM!,
          to: ADMIN_EMAIL,
          subject: `New Contact: ${name.trim()} — ${business_name?.trim() || "No business name"}`,
          body: emailBody,
        });
      } catch (emailErr) {
        console.error("SMTP email error:", emailErr);
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
