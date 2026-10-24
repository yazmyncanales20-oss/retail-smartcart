export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(!["GET","POST"].includes(req.method))return res.status(405).json({error:"Method not allowed"});
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:"Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel Preview."});
 const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"};
 try{
  if(req.method==="GET"){
   const r=await fetch(url+"/rest/v1/smartcart_reminder_settings?id=eq.1&select=mode,delay_hours,updated_at&limit=1",{headers});
   if(!r.ok)return res.status(502).json({error:"No se pudo leer la configuración de recordatorios."});
   const rows=await r.json();
   return res.status(200).json(rows[0]||{mode:"manual",delay_hours:1});
  }
  const mode=req.body?.mode,delayHours=Number(req.body?.delayHours);
  if(!["manual","automatic"].includes(mode)||!Number.isInteger(delayHours)||delayHours<1||delayHours>168)return res.status(400).json({error:"Selecciona envío manual o automático y un plazo entre 1 y 168 horas."});
  const r=await fetch(url+"/rest/v1/smartcart_reminder_settings?id=eq.1",{method:"PATCH",headers,body:JSON.stringify({mode,delay_hours:delayHours,updated_at:new Date().toISOString()})});
  if(!r.ok)return res.status(502).json({error:"No se pudo guardar la configuración."});
  const rows=await r.json();
  if(!rows.length)return res.status(404).json({error:"No existe la configuración inicial de recordatorios."});
  return res.status(200).json({saved:true,mode:rows[0].mode,delayHours:rows[0].delay_hours,updatedAt:rows[0].updated_at});
 }catch(e){return res.status(502).json({error:e.message||"Error de configuración."});}
}
