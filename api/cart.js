const emailOk = s => /^\S+@\S+\.\S+$/.test(String(s||""));
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:"Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel Preview."});
 const b=req.body||{};
 if(!b.cartToken||typeof b.cartToken!=="string"||b.cartToken.length>100)return res.status(400).json({error:"Identificador de carrito inválido."});
 const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"};
 if(b.converted){
  const r=await fetch(url+"/rest/v1/smartcart_abandoned_carts?cart_token=eq."+encodeURIComponent(b.cartToken),{method:"PATCH",headers,body:JSON.stringify({status:"converted",updated_at:new Date().toISOString()})});
  if(!r.ok)return res.status(502).json({error:"No se pudo marcar el carrito como comprado."});
  return res.status(200).json({saved:true,converted:true});
 }
 if(!emailOk(b.email)||!Array.isArray(b.items))return res.status(400).json({error:"Correo y productos son obligatorios."});
 const payload={cart_token:b.cartToken,customer_email:String(b.email).toLowerCase(),marketing_consent:b.consent===true,cart_items:b.items.slice(0,60),subtotal_clp:Math.max(0,Math.round(Number(b.subtotal)||0)),status:"active",last_activity_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 const r=await fetch(url+"/rest/v1/smartcart_abandoned_carts?on_conflict=cart_token",{method:"POST",headers,body:JSON.stringify(payload)});
 if(!r.ok)return res.status(502).json({error:"No se pudo guardar el carrito para seguimiento."});
 return res.status(200).json({saved:true});
}
