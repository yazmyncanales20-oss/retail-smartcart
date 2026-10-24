const emailOk=s=>/^\\S+@\\S+\\.\\S+$/.test(String(s||""));
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:"La base de datos de la vista previa aún no está conectada: falta SUPABASE_SERVICE_ROLE_KEY en Vercel Preview."});
 const b=req.body||{};
 if(!emailOk(b.email)||!Array.isArray(b.items)||!b.items.length||b.items.length>60)return res.status(400).json({error:"Correo o detalle de compra inválido."});
 const items=b.items.map(i=>({product_name_snapshot:String(i.name||"Prenda").slice(0,160),color_name_snapshot:String(i.color||"Sin especificar").slice(0,80),size_snapshot:String(i.size||"Sin especificar").slice(0,30),quantity:Math.max(1,Math.min(50,Math.floor(Number(i.qty)||1))),unit_price_clp:Math.max(0,Math.round(Number(i.price)||0)),variant_id:null}));
 const subtotal=items.reduce((n,i)=>n+i.quantity*i.unit_price_clp,0);
 const shipping=Math.max(0,Math.round(Number(b.shipping)||0));
 const discount=Math.max(0,Math.round(Number(b.discount)||0));
 const total=Math.max(0,subtotal+shipping-discount);
 const orderNumber="RS-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+Math.random().toString(36).slice(2,7).toUpperCase();
 const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"};
 try{
  const created=await fetch(url+"/rest/v1/orders",{method:"POST",headers,body:JSON.stringify({order_number:orderNumber,customer_email:String(b.email).toLowerCase(),status:"pending",delivery_method:b.delivery==="Retiro en tienda"?"store_pickup":"home_delivery",subtotal_clp:subtotal,shipping_clp:shipping,total_clp:total,payment_mode:"simulated"})});
  const orderRows=await created.json().catch(()=>[]);
  if(!created.ok||!orderRows[0])return res.status(502).json({error:"Supabase no pudo registrar el pedido: "+(orderRows?.message||created.statusText)});
  const order=orderRows[0];
  const lines=items.map(i=>({...i,order_id:order.id}));
  const lineResponse=await fetch(url+"/rest/v1/order_items",{method:"POST",headers,body:JSON.stringify(lines)});
  if(!lineResponse.ok){
   await fetch(url+"/rest/v1/orders?id=eq."+encodeURIComponent(order.id),{method:"DELETE",headers});
   const detail=await lineResponse.json().catch(()=>({}));
   return res.status(502).json({error:"No se pudo guardar el detalle de las prendas: "+(detail.message||lineResponse.statusText)});
  }
  return res.status(201).json({id:order.order_number,dbId:order.id,email:order.customer_email,customer:order.customer_email,items:items.reduce((n,i)=>n+i.quantity,0),subtotal,total,status:"Pedido recibido",createdAt:order.created_at});
 }catch(e){return res.status(502).json({error:e.message||"No se pudo registrar el pedido."});}
}
