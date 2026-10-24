export default function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 return res.status(200).json({
  emailProviderConfigured:!!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL),
  senderConfigured:!!process.env.RESEND_FROM_EMAIL,
  adminRecipientConfigured:!!(process.env.ADMIN_NOTIFICATION_EMAIL||process.env.VITE_ADMIN_NOTIFICATION_EMAIL),
  cartDatabaseConfigured:!!((process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL)&&process.env.SUPABASE_SERVICE_ROLE_KEY),
  reminderJobConfigured:!!process.env.CRON_SECRET,
  publicSiteUrl:process.env.VITE_PUBLIC_SITE_URL||""
 });
}
