export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const url=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||"").replace(/\\/+$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:"El registro de opiniones aún no está configurado."});
 const b=req.body||{},email=String(b.email||"").trim().toLowerCase(),orderNumber=String(b.orderNumber||"").trim(),productName=String(b.productName||"").trim(),rating=Math.round(Number(b.rating)),liked=b.liked===true;
 if(!/^\\S+@\\S+\\.\\S+$/.test(email)||!orderNumber||!productName||rating<1||rating>5)return res.status(400).json({error:"Completa correo, pedido, producto y calificación."});
 const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"};
 try{
  const orderRes=await fetch(url+"/rest/v1/orders?order_number=eq."+encodeURIComponent(orderNumber)+"&customer_email=eq."+encodeURIComponent(email)+"&select=id&limit=1",{headers});
  const orders=await orderRes.json();if(!orderRes.ok||!orders[0])return res.status(404).json({error:"No encontramos una compra asociada a ese correo."});
  const itemRes=await fetch(url+"/rest/v1/order_items?order_id=eq."+encodeURIComponent(orders[0].id)+"&product_name_snapshot=eq."+encodeURIComponent(productName)+"&select=id&limit=1",{headers});
  const items=await itemRes.json();if(!itemRes.ok||!items[0])return res.status(403).json({error:"Solo puedes opinar sobre un producto incluido en este pedido."});
  const previousRes=await fetch(url+"/rest/v1/orders?customer_email=eq."+encodeURIComponent(email)+"&select=id&limit=100",{headers});
  const previous=await previousRes.json();const repeatPurchase=Array.isArray(previous)&&previous.length>1;
  const saved=await fetch(url+"/rest/v1/product_reviews",{method:"POST",headers,body:JSON.stringify({order_id:orders[0].id,customer_email:email,product_name:productName,rating,liked,comment:String(b.comment||"").slice(0,1000),repeat_purchase:repeatPurchase})});
  if(!saved.ok){const e=await saved.json().catch(()=>({}));return res.status(502).json({error:e.message||"No se pudo guardar la opinión."});}
  return res.status(201).json({saved:true,repeatPurchase});
 }catch(e){return res.status(502).json({error:e.message||"No se pudo guardar la opinión."});}
}