const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clp=n=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(Number(n)||0);
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
 if(!url||!key)return res.status(503).json({sent:false,error:"Falta configurar la conexión con Supabase en Vercel."});
 if(!apiKey||!from)return res.status(503).json({sent:false,error:"Falta configurar RESEND_API_KEY y RESEND_FROM_EMAIL."});
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
  const items=(cart.cart_items||[]).map(i=>"<li>"+esc(i.name)+" · "+esc(i.color)+" · talla "+esc(i.size)+" × "+(Number(i.qty)||1)+"</li>").join("");
  const html='<div style="font-family:Arial,sans-serif;color:#292b25;max-width:580px;margin:auto;padding:24px"><h2>retailsmartcart</h2><h1>Tu bolsa te está esperando</h1><p>Dejaste estas prendas en tu carrito. Puedes volver a la tienda para continuar tu compra de demostración.</p><ul>'+items+'</ul><p><b>Total del carrito: '+clp(cart.subtotal_clp)+'</b></p><p><a href="'+esc(process.env.VITE_PUBLIC_SITE_URL||"https://retail-smartcart.vercel.app")+'" style="display:inline-block;padding:12px 18px;background:#27352b;color:white;text-decoration:none">Volver a la tienda</a></p><small>Recibes este mensaje porque autorizaste recordatorios de carrito. Prototipo académico, sin cobros reales.</small></div>';
  const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({from,to:cart.customer_email,subject:"Tu carrito te está esperando · Retail SmartCart",html})});
  const result=await sent.json().catch(()=>({}));
  if(!sent.ok){
   await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({event_type:"abandoned_cart_manual",recipient_email:cart.customer_email,cart_token:cart.cart_token,status:"failed",error_message:result.message||"Resend rechazó el envío."})}).catch(()=>{});
   return res.status(502).json({sent:false,error:result.message||"Resend rechazó el envío."});
  }
  const patch=await fetch(url+"/rest/v1/smartcart_abandoned_carts?id=eq."+encodeURIComponent(cart.id),{method:"PATCH",headers,body:JSON.stringify({status:"reminded",reminder_sent_at:new Date().toISOString()})});
  if(!patch.ok)return res.status(502).json({sent:false,error:"Resend aceptó el correo, pero no se pudo actualizar el estado del carrito."});
  await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({event_type:"abandoned_cart_manual",recipient_email:cart.customer_email,cart_token:cart.cart_token,status:"sent",provider_id:result.id||null})}).catch(()=>{});
  return res.status(200).json({sent:true,message:"Resend aceptó el recordatorio.",recipient:cart.customer_email});
 }catch(e){return res.status(502).json({sent:false,error:e.message||"No se pudo enviar el recordatorio."});}
}
