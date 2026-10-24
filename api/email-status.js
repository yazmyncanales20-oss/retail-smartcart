export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const result={
  emailProvider:"Brevo",
  emailProviderConfigured:!!process.env.BREVO_API_KEY,
  senderConfigured:!!(process.env.BREVO_SENDER_EMAIL||"retailsmartcart@gmail.com"),
  orderTemplateConfigured:!!(process.env.BREVO_ORDER_TEMPLATE_ID||"3"),
  cartTemplateConfigured:!!(process.env.BREVO_CART_REMINDER_TEMPLATE_ID||"4"),
  adminRecipientConfigured:!!(process.env.ADMIN_NOTIFICATION_EMAIL||process.env.VITE_ADMIN_NOTIFICATION_EMAIL),
  cartDatabaseConfigured:!!(url&&key),
  reminderSecretConfigured:!!process.env.CRON_SECRET,
  activeCarts:null,eligibleForReminder:null,remindersSent:null
 };
 if(url&&key){
  const headers={apikey:key,Authorization:"Bearer "+key,Prefer:"count=exact"};
  const count=async filter=>{const r=await fetch(url+"/rest/v1/smartcart_abandoned_carts?select=id"+filter,{headers:{...headers,Range:"0-0"}});if(!r.ok)return null;const range=r.headers.get("content-range")||"";const n=range.split("/").pop();return n&&n!=="*"?Number(n):0};
  [result.activeCarts,result.eligibleForReminder,result.remindersSent]=await Promise.all([
   count("&status=eq.active"),
   count("&status=eq.active&marketing_consent=eq.true&reminder_sent_at=is.null"),
   count("&status=eq.reminded")
  ]);
 }
 return res.status(200).json(result);
}
