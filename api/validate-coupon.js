export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:"El sistema de cupones aún no está configurado."});
 const b=req.body||{};
 if(!b.code||!b.email)return res.status(400).json({error:"Ingresa código y correo."});
 const q=url+"/rest/v1/smartcart_abandoned_carts?cart_token=eq."+encodeURIComponent(b.cartToken)+"&customer_email=eq."+encodeURIComponent(String(b.email).toLowerCase())+"&coupon_code=eq."+encodeURIComponent(String(b.code).trim().toUpperCase())+"&status=eq.reminded&select=coupon_code,coupon_amount_clp,reminder_sent_at";
 const r=await fetch(q,{headers:{apikey:key,Authorization:"Bearer "+key}});
 if(!r.ok)return res.status(502).json({error:"No se pudo validar el cupón."});
 const rows=await r.json(),row=rows[0];
 if(!row)return res.status(404).json({error:"Cupón no válido para este correo o carrito."});
 if(!row.reminder_sent_at||Date.now()-new Date(row.reminder_sent_at).getTime()>7*24*60*60*1000)return res.status(410).json({error:"Este cupón venció. Los cupones duran 7 días."});
 return res.status(200).json({valid:true,code:row.coupon_code,amount:Number(row.coupon_amount_clp)||0});
}
