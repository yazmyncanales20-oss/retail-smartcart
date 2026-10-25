const getConfig=()=>{const url=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||"").trim().replace(/\/+$/,"").replace(/\/rest\/v1$/i,"");const key=process.env.SUPABASE_SERVICE_ROLE_KEY;return {url,key,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"}}};
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 const {url,key,headers}=getConfig();
 if(!url||!key)return res.status(503).json({error:"Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en Vercel."});
 try{
  if(req.method==="POST"){
   const b=req.body||{},email=String(b.email||"").trim().toLowerCase(),orderNumber=String(b.orderNumber||"").trim(),productName=String(b.productName||"").trim(),rating=Math.round(Number(b.rating)),liked=b.liked===true;
   if(!/^\S+@\S+\.\S+$/.test(email)||!orderNumber||!productName||rating<1||rating>5)return res.status(400).json({error:"Completa correo, pedido, producto y calificación."});
   const orderRes=await fetch(url+"/rest/v1/orders?order_number=eq."+encodeURIComponent(orderNumber)+"&customer_email=eq."+encodeURIComponent(email)+"&select=id&limit=1",{headers});
   const orders=await orderRes.json();if(!orderRes.ok||!orders[0])return res.status(404).json({error:"No encontramos una compra asociada a ese correo."});
   const itemRes=await fetch(url+"/rest/v1/order_items?order_id=eq."+encodeURIComponent(orders[0].id)+"&product_name_snapshot=eq."+encodeURIComponent(productName)+"&select=id&limit=1",{headers});
   const items=await itemRes.json();if(!itemRes.ok||!items[0])return res.status(403).json({error:"Solo puedes opinar sobre un producto incluido en este pedido."});
   const previousRes=await fetch(url+"/rest/v1/orders?customer_email=eq."+encodeURIComponent(email)+"&select=id&limit=100",{headers});
   const previous=await previousRes.json();const repeatPurchase=Array.isArray(previous)&&previous.length>1;
   const saved=await fetch(url+"/rest/v1/product_reviews",{method:"POST",headers,body:JSON.stringify({order_id:orders[0].id,customer_email:email,product_name:productName,rating,liked,comment:String(b.comment||"").slice(0,1000),repeat_purchase:repeatPurchase})});
   if(!saved.ok){const e=await saved.json().catch(()=>({}));return res.status(502).json({error:e.message||"No se pudo guardar la opinión."});}
   return res.status(201).json({saved:true,repeatPurchase});
  }
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  const [or,cr,rr]=await Promise.all([
   fetch(url+"/rest/v1/orders?select=id,order_number,customer_email,status,total_clp,subtotal_clp,created_at&order=created_at.desc&limit=100",{headers}),
   fetch(url+"/rest/v1/smartcart_abandoned_carts?select=id,cart_token,customer_email,status,subtotal_clp,cart_items,marketing_consent,last_activity_at,reminder_sent_at,coupon_code,coupon_amount_clp&status=neq.converted&order=last_activity_at.desc&limit=100",{headers}),
   fetch(url+"/rest/v1/product_reviews?select=id,customer_email,product_name,rating,liked,comment,repeat_purchase,created_at&order=created_at.desc&limit=100",{headers})
  ]);
  if(!or.ok||!cr.ok||!rr.ok)throw new Error("No se pudieron leer pedidos, carritos u opiniones de Supabase.");
  const orders=await or.json(),carts=await cr.json(),reviews=await rr.json(),customerOrderCounts={};
  orders.forEach(o=>customerOrderCounts[o.customer_email]=(customerOrderCounts[o.customer_email]||0)+1);
  const counts={};
  if(orders.length){const ids=orders.map(o=>o.id).join(",");const ir=await fetch(url+"/rest/v1/order_items?select=order_id,quantity&order_id=in.("+ids+")",{headers});if(ir.ok)(await ir.json()).forEach(i=>counts[i.order_id]=(counts[i.order_id]||0)+Number(i.quantity||0));}
  return res.status(200).json({
   orders:orders.map(o=>({id:o.order_number,dbId:o.id,email:o.customer_email,customer:o.customer_email,repeatPurchase:(customerOrderCounts[o.customer_email]||0)>1,customerOrderCount:customerOrderCounts[o.customer_email]||1,items:counts[o.id]||0,total:o.total_clp,status:({"pending":"Pedido recibido","processing":"En preparación","shipped":"Despachado","in_transit":"En camino","delivered":"Entregado","cancelled":"Cancelado"}[o.status]||o.status),createdAt:o.created_at})),
   carts:carts.filter(c=>c.status==="active"||c.status==="reminded").map(c=>({id:c.id,token:c.cart_token,status:c.status,customer:c.customer_email,email:c.customer_email,items:Array.isArray(c.cart_items)?c.cart_items.length:0,total:c.subtotal_clp,age:c.last_activity_at,consent:c.marketing_consent,couponCode:c.coupon_code,couponAmount:c.coupon_amount_clp,reminderSentAt:c.reminder_sent_at})),
   reviews:reviews.map(r=>({id:r.id,email:r.customer_email,product:r.product_name,rating:r.rating,liked:r.liked,comment:r.comment,repeatPurchase:r.repeat_purchase,createdAt:r.created_at}))
  });
 }catch(e){return res.status(502).json({error:e.message||"Error consultando Supabase."});}
}