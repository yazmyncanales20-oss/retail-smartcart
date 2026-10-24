import nodemailer from "nodemailer";

function htmlToText(html = "") {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/p>|<\/div>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
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
    auth: { user, pass: pass.replace(/\s/g, "") },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
  const fromAddress = process.env.SMTP_FROM_EMAIL || user;
  const fromName = process.env.SMTP_FROM_NAME || "Retail SmartCart";
  const normalizedAttachments = attachments.map((a) => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(String(a.content || ""), "base64"),
    ...(a.contentType || a.content_type ? { contentType: a.contentType || a.content_type } : {})
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

async function sendViaEmailJS({ templateId, templateParams }) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const selectedTemplate = templateId || process.env.EMAILJS_TEMPLATE_ID;
  if (!serviceId || !publicKey || !selectedTemplate) {
    throw new Error("Falta configurar EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID y EMAILJS_PUBLIC_KEY en la vista previa.");
  }
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: selectedTemplate,
      user_id: publicKey,
      template_params: templateParams || {}
    })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(body || "EmailJS rechazó el envío.");
  return "emailjs-accepted";
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
  if (options?.templateId || options?.templateParams) return sendViaEmailJS(options);
  const smtpConfigured = Boolean(process.env.SMTP_USER || process.env.SMTP_PASS);
  if (smtpConfigured) return sendViaGmail(options);
  return sendViaResend(options);
}

export function isEmailConfigured() {
  const smtpConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
  const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  return smtpConfigured || resendConfigured;
}
