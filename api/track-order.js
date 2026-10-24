export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 const orderNumber=String(req.query?.order||"").trim(),email=String(req.query?.email||"").trim().toLowerCase();
 if(!orderNumber||!/^\\S+@\\S+\\.\\S+$/.test(email))return res.status(400).json({error:"Ingresa número de pedido y correo válido."});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:"Seguimiento temporalmente no disponible: falta conectar Supabase en Preview."});
 const q=url+"/rest/v1/orders?order_number=eq."+encodeURIComponent(orderNumber)+"&customer_email=eq."+encodeURIComponent(email)+"&select=order_number,customer_email,status,total_clp,created_at&limit=1";
 const r=await fetch(q,{headers:{apikey:key,Authorization:"Bearer "+key}});
 if(!r.ok)return res.status(502).json({error:"No se pudo consultar el pedido."});
 const rows=await r.json();if(!rows.length)return res.status(404).json({error:"Pedido no encontrado. Verifica el código y el correo."});
 const o=rows[0];return res.status(200).json({id:o.order_number,email:o.customer_email,customer:o.customer_email,total:o.total_clp,status:o.status,createdAt:o.created_at});
}
