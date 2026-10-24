const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const htmlToText = (html = "") => String(html)
  .replace(/<style[\\s\\S]*?<\\/style>/gi, "")
  .replace(/<script[\\s\\S]*?<\\/script>/gi, "")
  .replace(/<\\/p>|<\\/div>|<br\\s*\\/?>/gi, "\\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/\\s+/g, " ").trim();

export async function sendEmail(options = {}) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("Falta configurar BREVO_API_KEY en las variables de entorno de Vercel Preview.");
  const to = Array.isArray(options.to) ? options.to : [options.to];
  if (!to.length || to.some(value => !value || !/^\\S+@\\S+\\.\\S+$/.test(String(value)))) {
    throw new Error("El destinatario del correo no es válido.");
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || "retailsmartcart@gmail.com";
  const senderName = process.env.BREVO_SENDER_NAME || "Retail SmartCart";
  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: to.map(email => typeof email === "string" ? { email } : email),
    subject: options.subject || "Notificación de Retail SmartCart",
    ...(options.templateId
      ? { templateId: Number(options.templateId), params: options.templateParams || {} }
      : {
          htmlContent: options.html || "<p>Notificación de Retail SmartCart</p>",
          textContent: htmlToText(options.html || "")
        }),
    ...(options.replyTo ? { replyTo: { email: options.replyTo } } : {}),
    ...(options.attachments?.length ? {
      attachment: options.attachments.map(file => ({
        name: file.filename || file.name || "adjunto",
        content: Buffer.isBuffer(file.content)
          ? file.content.toString("base64")
          : String(file.content || "")
      }))
    } : {})
  };

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result.message || result.code || "Brevo rechazó el envío.";
    throw new Error(detail);
  }
  return result.messageId || "brevo-accepted";
}

export function isEmailConfigured() {
  return Boolean(process.env.BREVO_API_KEY && (process.env.BREVO_SENDER_EMAIL || "retailsmartcart@gmail.com"));
}
