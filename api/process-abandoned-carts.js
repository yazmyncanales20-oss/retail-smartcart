const clp=n=>new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(Number(n)||0);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function send(to,subject,html){const key=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;if(!key||!from)throw new Error("Resend no configurado");const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to,subject,html})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||"Fallo Resend");return d.id;}
export default async function handler(req,res){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.authorization!=="Bearer "+secret)return res.status(401).json({error:"Unauthorized"});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key||!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)return res.status(503).json({error:"Configura SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY y RESEND_FROM_EMAIL."});
 const cutoff=new Date(Date.now()-60*60*1000).toISOString();
 const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"};
 const q=url+"/rest/v1/smartcart_abandoned_carts?status=eq.active&marketing_consent=eq.true&reminder_sent_at=is.null&last_activity_at=lt."+encodeURIComponent(cutoff)+"&select=*";
 const r=await fetch(q,{headers});if(!r.ok)return res.status(502).json({error:"No se pudieron consultar carritos pendientes."});
 const carts=await r.json(),results=[];
 for(const c of carts){
  const amount=c.subtotal_clp<25000?4990:c.subtotal_clp>=45000?9990:5000;
  const code="SMART"+amount+"-"+String(c.cart_token).slice(-4).toUpperCase();
  const items=(c.cart_items||[]).map(i=>'<li style="padding:8px 0;border-bottom:1px solid #eee">'+esc(i.name)+' · '+esc(i.color)+' · talla '+esc(i.size)+' × '+(Number(i.qty)||1)+'</li>').join("");
  const html='<div style="background:#f4f3ef;padding:28px 12px;font-family:Arial,sans-serif;color:#292b25"><div style="max-width:580px;margin:auto;background:#fff;border-radius:16px;overflow:hidden"><div style="background:#27352b;color:#fff;padding:28px;font-size:24px;font-weight:bold">retail<span style="color:#d9c8a6">smartcart</span></div><div style="padding:28px"><p style="font-size:11px;letter-spacing:2px;color:#777">TU BOLSA TE ESTÁ ESPERANDO</p><h1 style="font-size:27px">¿Lo seguimos guardando?</h1><p style="color:#5c6058;line-height:1.7">Dejaste algunas prendas en tu carrito. Para ayudarte a terminar tu compra, te preparamos un descuento personal.</p><ul style="padding-left:18px">'+items+'</ul><div style="background:#f5f4ef;border:1px dashed #b7b6a8;padding:20px;text-align:center;border-radius:10px;margin:22px 0"><div style="font-size:11px;color:#777">TU CÓDIGO DE DESCUENTO</div><div style="font-size:25px;font-weight:bold;letter-spacing:1px;margin:8px 0">'+esc(code)+'</div><div style="font-size:20px;font-weight:bold">-'+clp(amount)+'</div><div style="font-size:12px;color:#777;margin-top:6px">Carrito actual: '+clp(c.subtotal_clp)+'</div></div><p style="font-size:12px;color:#6e7169;line-height:1.6">Este cupón es parte de la vista previa académica. No se realizará ningún cobro hasta integrar una pasarela real.</p><p style="font-size:12px;color:#6e7169">Retail SmartCart · Gracias por darnos otra oportunidad.</p></div></div></div>';
  try{
   const providerId=await send(c.customer_email,"Un descuento de "+clp(amount)+" te espera · Retail SmartCart",html);
   const patch=await fetch(url+"/rest/v1/smartcart_abandoned_carts?id=eq."+c.id,{method:"PATCH",headers,body:JSON.stringify({status:"reminded",reminder_sent_at:new Date().toISOString(),coupon_code:code,coupon_amount_clp:amount})});
   if(!patch.ok)throw new Error("Correo enviado pero no se pudo actualizar el carrito.");
   await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({event_type:"abandoned_cart_coupon",recipient_email:c.customer_email,cart_token:c.cart_token,status:"sent",provider_id:providerId,metadata:{coupon_code:code,coupon_amount_clp:amount}})});
   results.push({cart_token:c.cart_token,sent:true,coupon:code});
  }catch(e){await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({event_type:"abandoned_cart_coupon",recipient_email:c.customer_email,cart_token:c.cart_token,status:"failed",error_message:e.message})}).catch(()=>{});results.push({cart_token:c.cart_token,sent:false,error:e.message});}
 }
 return res.status(200).json({processed:results.length,results});
}
