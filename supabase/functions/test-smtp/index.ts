import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const enc = (s: string) => new TextEncoder().encode(s + "\r\n");
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

async function readResponse(conn: Deno.Conn | Deno.TlsConn): Promise<string> {
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

async function writeCmd(conn: Deno.Conn | Deno.TlsConn, line: string): Promise<string> {
  await conn.write(enc(line));
  return await readResponse(conn);
}

async function smtpSession(conn: Deno.Conn | Deno.TlsConn, opts: {
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
  if (opts.port === 465) {
    // Direct TLS (SSL/TLS)
    const conn = await Deno.connectTls({ hostname: opts.host, port: opts.port });
    try { await smtpSession(conn, opts); } finally { conn.close(); }
  } else {
    // STARTTLS: plain connect → STARTTLS → upgrade with Deno.startTls()
    const plain = await Deno.connect({ hostname: opts.host, port: opts.port });
    await readResponse(plain);                    // greeting
    await plain.write(enc(`EHLO ${opts.host}`));  // EHLO
    await readResponse(plain);

    const startTlsResp = await writeCmd(plain, "STARTTLS");
    if (!startTlsResp.startsWith("220")) {
      plain.close();
      throw new Error(`STARTTLS rejected: ${startTlsResp}`);
    }

    // Upgrade the same connection to TLS
    const tls = await Deno.startTls(plain, { hostname: opts.host });
    try {
      // After STARTTLS the session restarts — no greeting, send fresh EHLO
      await writeCmd(tls, `EHLO ${opts.host}`);
      await writeCmd(tls, "AUTH LOGIN");
      await writeCmd(tls, b64(opts.user));
      await writeCmd(tls, b64(opts.pass));

      const mf = await writeCmd(tls, `MAIL FROM:<${opts.from}>`);
      if (!mf.startsWith("250")) throw new Error(`MAIL FROM failed: ${mf}`);

      const rt = await writeCmd(tls, `RCPT TO:<${opts.to}>`);
      if (!rt.startsWith("250")) throw new Error(`RCPT TO failed: ${rt}`);

      await writeCmd(tls, "DATA");
      const email = `From: ${opts.from}\r\nTo: ${opts.to}\r\nSubject: ${opts.subject}\r\n\r\n${opts.body}\r\n.`;
      await writeCmd(tls, email);
      await writeCmd(tls, "QUIT");
    } finally {
      tls.close();
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SMTP_HOST   = Deno.env.get("SMTP_HOST");
  const SMTP_PORT   = parseInt(Deno.env.get("SMTP_PORT") || "587");
  const SMTP_USER   = Deno.env.get("SMTP_USER");
  const SMTP_PASS   = Deno.env.get("SMTP_PASS");
  const SMTP_FROM   = Deno.env.get("SMTP_FROM") || SMTP_USER;
  const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");

  const missing = (["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "ADMIN_EMAIL"] as const)
    .filter(k => !Deno.env.get(k));

  if (missing.length > 0) {
    return new Response(
      JSON.stringify({ success: false, error: `Missing secrets: ${missing.join(", ")}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    await sendSmtpEmail({
      host: SMTP_HOST!,
      port: SMTP_PORT,
      user: SMTP_USER!,
      pass: SMTP_PASS!,
      from: SMTP_FROM!,
      to: ADMIN_EMAIL!,
      subject: "SMTP Test",
      body: "Email configuration successful.",
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Test email sent to ${ADMIN_EMAIL}`,
        config: { host: SMTP_HOST, port: SMTP_PORT, from: SMTP_FROM, to: ADMIN_EMAIL },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("SMTP test error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
