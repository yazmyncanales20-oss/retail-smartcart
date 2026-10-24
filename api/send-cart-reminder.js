import { sendEmail } from "../lib/email.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clp=n=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(Number(n)||0);

export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({sent:false,error:"Falta configurar la conexión con Supabase en Vercel Production."});
 if(!process.env.BREVO_API_KEY)return res.status(503).json({sent:false,error:"Falta BREVO_API_KEY en las variables de entorno de esta previsualización."});
 const token=String(req.body?.cartToken||"").trim();
 if(!token||token.length>100)return res.status(400).json({sent:false,error:"Identificador de carrito inválido."});
 const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"};
 try{
  const lookup=await fetch(url+"/rest/v1/smartcart_abandoned_carts?cart_token=eq."+encodeURIComponent(token)+"&select=id,cart_token,customer_email,marketing_consent,cart_items,subtotal_clp,status,reminder_sent_at&limit=1",{headers});
  if(!lookup.ok)return res.status(502).json({sent:false,error:"No se pudo consultar el carrito en Supabase."});
  const rows=await lookup.json(),cart=rows[0];
  if(!cart)return res.status(404).json({sent:false,error:"No se encontró el carrito."});
  if(cart.marketing_consent!==true)return res.status(403).json({sent:false,error:"El cliente no autorizó recibir recordatorios."});
  if(cart.status!=="active"||cart.reminder_sent_at)return res.status(409).json({sent:false,error:"Este carrito ya fue comprado o ya recibió un recordatorio."});
  const items=Array.isArray(cart.cart_items)?cart.cart_items:[];
  const cartSummary='<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse">'+items.map(i=>{const image=String(i.image||i.image_url||"");const safeImage=/^https:\/\//i.test(image)?esc(image):"";return '<tr><td width="88" valign="top" style="width:88px;padding:12px 12px 12px 0;border-bottom:1px solid #e7e2d7">'+(safeImage?'<img src="'+safeImage+'" width="76" height="92" alt="'+esc(i.name||"Prenda")+'" style="display:block;width:76px;height:92px;object-fit:cover;border:0;background:#f3f1eb">':'<div style="width:76px;height:92px;background:#f3f1eb;color:#7b806e;text-align:center;font-size:10px;line-height:92px">Retail</div>')+'</td><td valign="top" style="padding:12px 0;border-bottom:1px solid #e7e2d7;font-size:13px;line-height:1.6;color:#30352b"><strong>'+esc(i.name||"Prenda")+'</strong><br><span style="font-size:12px;color:#777b70">'+esc(i.color||"")+' · Talla '+esc(i.size||"")+' · '+(Number(i.qty)||1)+' unidad(es)</span></td><td valign="top" align="right" style="padding:12px 0 12px 8px;border-bottom:1px solid #e7e2d7;font-size:13px;white-space:nowrap">'+clp((Number(i.price)||0)*(Number(i.qty)||1))+'</td></tr>'}).join('')+'<tr><td colspan="3" align="right" style="padding-top:16px;font-size:14px;font-weight:bold">Total del carrito: '+clp(cart.subtotal_clp)+'</td></tr></table>';
  const siteUrl=(process.env.VITE_PUBLIC_SITE_URL||"https://retail-smartcart.vercel.app").replace(/\\/$/,"");
  const html='<div style="margin:0;padding:32px 12px;background:#f5f3ed;font-family:Arial,sans-serif;color:#30352b"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e7e2d7"><div style="padding:28px 30px;background:#596148;color:#fff"><div style="font-size:22px;font-weight:bold;letter-spacing:.4px">retailsmartcart</div><div style="font-size:11px;letter-spacing:2px;margin-top:6px">MODA CON INTENCIÓN</div></div><div style="padding:28px 30px"><p style="font-size:20px;font-weight:bold;margin:0 0 12px">Tu carrito te está esperando</p><p style="font-size:14px;line-height:1.7;color:#666">Hola '+esc(String(cart.customer_email).split("@")[0])+', guardamos los productos de tu carrito para que puedas revisarlos.</p>'+cartSummary+'<p style="margin:28px 0"><a href="'+esc(siteUrl)+'" style="display:inline-block;background:#596148;color:#fff;text-decoration:none;padding:14px 22px;font-size:13px;font-weight:bold">Volver a la tienda</a></p><p style="font-size:11px;color:#777">Recibes este mensaje porque aceptaste recibir recordatorios de Retail SmartCart.</p></div></div></div>';
  const providerId=await sendEmail({to:cart.customer_email,subject:"Tu carrito de Retail SmartCart te espera",html});
  const patch=await fetch(url+"/rest/v1/smartcart_abandoned_carts?id=eq."+encodeURIComponent(cart.id),{method:"PATCH",headers,body:JSON.stringify({status:"reminded",reminder_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  if(!patch.ok)return res.status(502).json({sent:false,error:"Brevo aceptó el correo, pero no se pudo actualizar el estado del carrito."});
  await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({event_type:"abandoned_cart_manual",recipient_email:cart.customer_email,cart_token:cart.cart_token,status:"sent",provider_id:providerId,metadata:{provider:"brevo",delivery:"html"}})}).catch(()=>{});
  return res.status(200).json({sent:true,message:"Brevo aceptó el recordatorio.",recipient:cart.customer_email});
 }catch(e){
  await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({event_type:"abandoned_cart_manual",recipient_email:"",cart_token:token,status:"failed",error_message:e.message,metadata:{provider:"brevo"}})}).catch(()=>{});
  return res.status(502).json({sent:false,error:e.message||"No se pudo enviar el recordatorio."});
 }
}
