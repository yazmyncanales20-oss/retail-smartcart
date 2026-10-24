import { sendEmail } from "../lib/email.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clp=n=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(Number(n)||0);

export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(!["GET","POST"].includes(req.method))return res.status(405).json({error:"Method not allowed"});
 const secret=process.env.CRON_SECRET;
 const auth=String(req.headers.authorization||"");
 if(!secret||auth!=="Bearer "+secret)return res.status(401).json({error:"No autorizado."});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key||!process.env.BREVO_API_KEY)return res.status(503).json({error:"Configura Supabase, BREVO_API_KEY y CRON_SECRET en Vercel Preview."});
 const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"};
 try{
  const settingsResponse=await fetch(url+"/rest/v1/smartcart_reminder_settings?id=eq.1&select=mode,delay_hours&limit=1",{headers});
  if(!settingsResponse.ok)return res.status(502).json({error:"No se pudo leer la configuración de recordatorios."});
  const settings=(await settingsResponse.json())[0]||{mode:"manual",delay_hours:1};
  if(settings.mode!=="automatic")return res.status(200).json({processed:0,mode:"manual",message:"El modo de recordatorio está configurado como manual."});
  const cutoff=new Date(Date.now()-Math.max(1,Number(settings.delay_hours)||1)*3600000).toISOString();
  const cartsResponse=await fetch(url+"/rest/v1/smartcart_abandoned_carts?select=id,cart_token,customer_email,marketing_consent,cart_items,subtotal_clp,status,reminder_sent_at,last_activity_at&status=eq.active&marketing_consent=eq.true&reminder_sent_at=is.null&last_activity_at=lte."+encodeURIComponent(cutoff)+"&order=last_activity_at.asc&limit=25",{headers});
  if(!cartsResponse.ok)return res.status(502).json({error:"No se pudieron consultar los carritos pendientes."});
  const carts=await cartsResponse.json();
  const results=[];
  for(const cart of carts){
   try{
    const items=Array.isArray(cart.cart_items)?cart.cart_items:[];
    const summary='<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse">'+items.map(i=>{const image=String(i.image||i.image_url||"");const safeImage=/^https:\/\//i.test(image)?esc(image):"";return '<tr><td width="88" valign="top" style="width:88px;padding:12px 12px 12px 0;border-bottom:1px solid #e7e2d7">'+(safeImage?'<img src="'+safeImage+'" width="76" height="92" alt="'+esc(i.name||"Prenda")+'" style="display:block;width:76px;height:92px;object-fit:cover;border:0;background:#f3f1eb">':'<div style="width:76px;height:92px;background:#f3f1eb;color:#7b806e;text-align:center;font-size:10px;line-height:92px">Retail</div>')+'</td><td valign="top" style="padding:12px 0;border-bottom:1px solid #e7e2d7;font-size:13px;line-height:1.6;color:#30352b"><strong>'+esc(i.name||"Prenda")+'</strong><br><span style="font-size:12px;color:#777b70">'+esc(i.color||"")+' · Talla '+esc(i.size||"")+' · '+(Number(i.qty)||1)+' unidad(es)</span></td><td valign="top" align="right" style="padding:12px 0 12px 8px;border-bottom:1px solid #e7e2d7;font-size:13px;white-space:nowrap">'+clp((Number(i.price)||0)*(Number(i.qty)||1))+'</td></tr>'}).join('')+'<tr><td colspan="3" align="right" style="padding-top:16px;font-size:14px;font-weight:bold">Total del carrito: '+clp(cart.subtotal_clp)+'</td></tr></table>';
    const templateId=Number(process.env.BREVO_CART_REMINDER_TEMPLATE_ID||4);
    const providerId=await sendEmail({to:cart.customer_email,subject:"Tu carrito de Retail SmartCart te espera",templateId,templateParams:{customer_name:String(cart.customer_email).split("@")[0],cart_summary:summary,cart_url:(process.env.VITE_PUBLIC_SITE_URL||"https://retail-smartcart.vercel.app").replace(/\\/$/,"")}});
    const patch=await fetch(url+"/rest/v1/smartcart_abandoned_carts?id=eq."+encodeURIComponent(cart.id)+"&status=eq.active&reminder_sent_at=is.null",{method:"PATCH",headers,body:JSON.stringify({status:"reminded",reminder_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    if(!patch.ok)throw new Error("Correo aceptado, pero no se pudo actualizar el carrito.");
    await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({event_type:"abandoned_cart_automatic",recipient_email:cart.customer_email,cart_token:cart.cart_token,status:"sent",provider_id:providerId,metadata:{provider:"brevo",template_id:templateId}})}).catch(()=>{});
    results.push({cartToken:cart.cart_token,sent:true});
   }catch(error){
    await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({event_type:"abandoned_cart_automatic",recipient_email:cart.customer_email,cart_token:cart.cart_token,status:"failed",error_message:error.message,metadata:{provider:"brevo"}})}).catch(()=>{});
    results.push({cartToken:cart.cart_token,sent:false,error:error.message});
   }
  }
  return res.status(200).json({mode:"automatic",delayHours:Number(settings.delay_hours)||1,checked:carts.length,sent:results.filter(r=>r.sent).length,failed:results.filter(r=>!r.sent).length,results});
 }catch(error){return res.status(502).json({error:error.message||"Error procesando recordatorios."});}
}
