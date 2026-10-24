import { sendEmail } from "../lib/email.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clp=n=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(Number(n)||0);

export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({sent:false,error:"Falta configurar la conexión con Supabase en Vercel Preview."});
 if(!process.env.BREVO_API_KEY)return res.status(503).json({sent:false,error:"Falta configurar BREVO_API_KEY en Vercel Preview."});
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
  const cartSummary="<ul>"+items.map(i=>"<li>"+esc(i.name)+" · "+esc(i.color)+" · talla "+esc(i.size)+" × "+(Number(i.qty)||1)+" — "+clp((Number(i.price)||0)*(Number(i.qty)||1))+"</li>").join("")+"</ul><p><strong>Total del carrito: "+clp(cart.subtotal_clp)+"</strong></p>";
  const siteUrl=(process.env.VITE_PUBLIC_SITE_URL||"https://retail-smartcart.vercel.app").replace(/\\/$/,"");
  const templateId=Number(process.env.BREVO_CART_REMINDER_TEMPLATE_ID||4);
  const providerId=await sendEmail({
    to:cart.customer_email,
    subject:"Tu carrito de Retail SmartCart te espera",
    templateId,
    templateParams:{customer_name:String(cart.customer_email).split("@")[0],cart_summary:cartSummary,cart_url:siteUrl}
  });
  const patch=await fetch(url+"/rest/v1/smartcart_abandoned_carts?id=eq."+encodeURIComponent(cart.id),{method:"PATCH",headers,body:JSON.stringify({status:"reminded",reminder_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  if(!patch.ok)return res.status(502).json({sent:false,error:"Brevo aceptó el correo, pero no se pudo actualizar el estado del carrito."});
  await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({event_type:"abandoned_cart_manual",recipient_email:cart.customer_email,cart_token:cart.cart_token,status:"sent",provider_id:providerId,metadata:{provider:"brevo",template_id:templateId}})}).catch(()=>{});
  return res.status(200).json({sent:true,message:"Brevo aceptó el recordatorio.",recipient:cart.customer_email});
 }catch(e){
  await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({event_type:"abandoned_cart_manual",recipient_email:"",cart_token:token,status:"failed",error_message:e.message,metadata:{provider:"brevo"}})}).catch(()=>{});
  return res.status(502).json({sent:false,error:e.message||"No se pudo enviar el recordatorio."});
 }
}
