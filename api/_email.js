import nodemailer from "nodemailer";

function htmlToText(html = "") {
  return String(html).replace(/<style[\\s\\S]*?<\\/style>/gi, "")
    .replace(/<script[\\s\\S]*?<\\/script>/gi, "")
    .replace(/<\\/p>|<\\/div>|<br\\s*\\/?\s*>/gi, "\\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\s+/g, " ").trim();
}

async function sendViaGmail({ to, subject, html, attachments = [] }) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error("Falta configurar SMTP_USER y SMTP_PASS en Vercel. Usa una contraseña de aplicación de Google, no la contraseña normal.");
  }
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user, pass: pass.replace(/\\s/g, "") },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
  const fromAddress = process.env.SMTP_FROM_EMAIL || user;
  const fromName = process.env.SMTP_FROM_NAME || "Retail SmartCart";
  const normalizedAttachments = attachments.map((a) => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(String(a.content || ""), a.encoding === "base64" ? "base64" : "utf8"),
    contentType: a.contentType || a.content_type
  }));
  const result = await transporter.sendMail({
    from: { name: fromName, address: fromAddress },
    to,
    subject,
    html,
    text: htmlToText(html),
    attachments: normalizedAttachments
  });
  return result.messageId || "gmail-smtp-accepted";
}

async function sendViaResend({ to, subject, html, attachments = [] }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) throw new Error("Configura SMTP_USER y SMTP_PASS para Gmail o RESEND_API_KEY y RESEND_FROM_EMAIL para Resend.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, attachments })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "El proveedor de correo rechazó el envío.");
  return body.id;
}

export async function sendEmail(options) {
  const smtpConfigured = Boolean(process.env.SMTP_USER || process.env.SMTP_PASS);
  if (smtpConfigured) return sendViaGmail(options);
  return sendViaResend(options);
}

export function isEmailConfigured() {
  const smtpConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
  const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  return smtpConfigured || resendConfigured;
}
