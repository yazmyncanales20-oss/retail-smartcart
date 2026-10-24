export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:"Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel Preview."});
 const headers={apikey:key,Authorization:"Bearer "+key};
 try{
  const [or,cr]=await Promise.all([
   fetch(url+"/rest/v1/orders?select=id,order_number,customer_email,status,total_clp,subtotal_clp,created_at&order=created_at.desc&limit=100",{headers}),
   fetch(url+"/rest/v1/smartcart_abandoned_carts?select=id,cart_token,customer_email,status,subtotal_clp,cart_items,marketing_consent,last_activity_at,reminder_sent_at,coupon_code,coupon_amount_clp&status=neq.converted&order=last_activity_at.desc&limit=100",{headers})
  ]);
  if(!or.ok||!cr.ok)throw new Error("No se pudieron leer pedidos o carritos de Supabase.");
  const orders=await or.json(), carts=await cr.json();
  let counts={};
  if(orders.length){
   const ids=orders.map(o=>o.id).join(",");
   const ir=await fetch(url+"/rest/v1/order_items?select=order_id,quantity&order_id=in.("+ids+")",{headers});
   if(ir.ok)(await ir.json()).forEach(i=>counts[i.order_id]=(counts[i.order_id]||0)+Number(i.quantity||0));
  }
  return res.status(200).json({
   orders:orders.map(o=>({id:o.order_number,dbId:o.id,email:o.customer_email,customer:o.customer_email,items:counts[o.id]||0,total:o.total_clp,status:({"pending":"Pedido recibido","processing":"En preparación","shipped":"Despachado","in_transit":"En camino","delivered":"Entregado","cancelled":"Cancelado"}[o.status]||o.status),createdAt:o.created_at})),
   carts:carts.filter(c=>c.status==="active"||c.status==="reminded").map(c=>({id:c.id,token:c.cart_token,status:c.status,customer:c.customer_email,email:c.customer_email,items:Array.isArray(c.cart_items)?c.cart_items.length:0,total:c.subtotal_clp,age:c.last_activity_at,consent:c.marketing_consent,status:c.status,couponCode:c.coupon_code,couponAmount:c.coupon_amount_clp,reminderSentAt:c.reminder_sent_at}))
  });
 }catch(e){return res.status(502).json({error:e.message||"Error consultando Supabase."});}
}
