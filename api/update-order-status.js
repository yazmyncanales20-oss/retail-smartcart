const statusMap={"Pedido recibido":"pending","En preparación":"processing","Despachado":"shipped","En camino":"in_transit","Entregado":"delivered","Cancelado":"cancelled"};
const allowed=new Set(Object.keys(statusMap));
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const {orderNumber,status}=req.body||{};
 if(!orderNumber||!allowed.has(status))return res.status(400).json({error:"Pedido o estado inválido."});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:"Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel Preview."});
 const r=await fetch(url+"/rest/v1/orders?order_number=eq."+encodeURIComponent(String(orderNumber)),{method:"PATCH",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({status:statusMap[status]})});
 if(!r.ok)return res.status(502).json({error:"No se pudo actualizar el estado del pedido."});
 const rows=await r.json();if(!rows.length)return res.status(404).json({error:"Pedido no encontrado en Supabase."});
 return res.status(200).json({updated:true,status:rows[0].status});
}
