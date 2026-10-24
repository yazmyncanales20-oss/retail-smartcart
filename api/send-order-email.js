import { sendEmail } from "../lib/email.js";

const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clp = n => new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(Number(n)||0);
const plain = s => String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E]/g,"?");
function receiptPdf(order) {
  const lines=[
    "RETAIL SMARTCART - COMPROBANTE DE DEMOSTRACION",
    "NO ES BOLETA ELECTRONICA TRIBUTARIA DEL SII",
    "Pedido: "+order.id,
    "Fecha: "+new Date().toLocaleString("es-CL"),
    "Cliente: "+(order.customer?.fullName||"Cliente"),
    "Correo: "+(order.email||""),
    "Entrega: "+(order.delivery||"Despacho a domicilio"),
    "-----------------------------------------------",
    ...(order.items||[]).map(i=>String(i.qty||1)+" x "+i.name+" / "+i.color+" / talla "+i.size+" = "+clp((i.price||0)*(i.qty||1))),
    "-----------------------------------------------",
    "Subtotal: "+clp(order.subtotal),
    "Despacho: "+clp(order.shipping),
    "Pago: "+(order.paymentMethod||"Pago de demostracion"),
    "TOTAL: "+clp(order.total),
    "",
    "Este documento acredita solo un pedido de demostracion.",
    "No se proceso ningun pago ni tiene validez tributaria."
  ].map(plain);
  const commands=["BT","/F1 10 Tf","50 790 Td","14 TL"];
  lines.forEach((line,i)=>commands.push(i===0?"("+line.replace(/[()\\]/g,"\\$&")+") Tj":"T* ("+line.replace(/[()\\]/g,"\\$&")+") Tj"));
  commands.push("ET");
  const stream=commands.join("\n");
  const objs=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length "+Buffer.byteLength(stream,"latin1")+" >>\nstream\n"+stream+"\nendstream"
  ];
  let pdf="%PDF-1.4\n", offsets=[0];
  objs.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf,"latin1"));pdf+=(i+1)+" 0 obj\n"+o+"\nendobj\n";});
  const xref=Buffer.byteLength(pdf,"latin1");
  pdf+="xref\n0 "+(objs.length+1)+"\n0000000000 65535 f \n";
  offsets.slice(1).forEach(n=>pdf+=String(n).padStart(10,"0")+" 00000 n \n");
  pdf+="trailer\n<< /Size "+(objs.length+1)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF";
  return Buffer.from(pdf,"latin1").toString("base64");
}
async function logEvent(type,to,orderId,status,providerId,error,metadata={}) {
  const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return;
  await fetch(url+"/rest/v1/smartcart_email_events",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({event_type:type,recipient_email:to,order_number:orderId,status,provider_id:providerId||null,error_message:error||null,metadata})}).catch(()=>{});
}
export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const body=req.body||{};
  const {email,order}=body;
  if(!email||!/^\S+@\S+\.\S+$/.test(email)||!order?.id)return res.status(400).json({error:"Faltan correo o número de pedido."});
  const dbUrl=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,dbKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!dbUrl||!dbKey)return res.status(503).json({sent:false,error:"Falta configurar la clave privada de Supabase en Vercel."});
  const verified=await fetch(dbUrl+"/rest/v1/orders?order_number=eq."+encodeURIComponent(String(order.id))+"&customer_email=eq."+encodeURIComponent(String(email).toLowerCase())+"&select=order_number&limit=1",{headers:{apikey:dbKey,Authorization:"Bearer "+dbKey}});
  if(!verified.ok)return res.status(502).json({sent:false,error:"No se pudo validar el pedido en la base de datos."});
  if(!(await verified.json()).length)return res.status(403).json({sent:false,error:"El pedido no está registrado en la base de datos; no se envió el correo."});
  const admin=process.env.ADMIN_NOTIFICATION_EMAIL||process.env.VITE_ADMIN_NOTIFICATION_EMAIL;
  const items=Array.isArray(order.items)?order.items:[];
  const lines=items.map(i=>'<tr><td style="padding:12px 0;border-bottom:1px solid #eee">'+esc(i.name)+'<div style="color:#777;font-size:12px">'+esc(i.color)+' · Talla '+esc(i.size)+' · '+(Number(i.qty)||1)+' unidad(es)</div></td><td align="right" style="padding:12px 0;border-bottom:1px solid #eee;white-space:nowrap">'+clp((Number(i.price)||0)*(Number(i.qty)||1))+'</td></tr>').join("");
  const tracking=(process.env.VITE_PUBLIC_SITE_URL||"https://retail-smartcart-git-feat-reportes-supabase-pwa-preview-yazmyn.vercel.app");
  const html='<div style="margin:0;background:#f4f3ef;padding:28px 12px;font-family:Arial,sans-serif;color:#292b25"><div style="max-width:620px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#27352b;padding:30px;color:#fff"><div style="font-size:25px;font-weight:700;letter-spacing:-1px">retail<span style="color:#d9c8a6">smartcart</span></div><div style="font-size:10px;letter-spacing:3px;margin-top:8px;color:#e1e2d9">MODA CON INTENCIÓN</div></div><div style="padding:30px"><p style="color:#777;font-size:11px;letter-spacing:2px">GRACIAS POR ELEGIRNOS</p><h1 style="font-size:27px;margin:8px 0 12px">¡Gracias, '+esc(order.customer?.fullName||"por tu compra")+'!</h1><p style="color:#5c6058;line-height:1.7">Tu pedido quedó registrado en nuestra tienda de demostración. Aquí tienes el resumen y el código para consultar su estado.</p><div style="background:#f5f4ef;border:1px solid #e5e2d8;border-radius:12px;padding:18px;margin:22px 0"><div style="font-size:11px;color:#777">CÓDIGO DE PEDIDO</div><div style="font-size:24px;font-weight:700;letter-spacing:1px;margin:7px 0">'+esc(order.id)+'</div><div style="font-size:12px;color:#666">Estado inicial: Pedido recibido</div></div><h3 style="font-size:16px">Tu compra</h3><table style="width:100%;border-collapse:collapse;font-size:13px">'+lines+'</table><div style="margin-top:18px;font-size:13px"><p>Subtotal <b style="float:right">'+clp(order.subtotal)+'</b></p><p>Despacho <b style="float:right">'+clp(order.shipping)+'</b></p><p style="border-top:1px solid #ddd;padding-top:14px;font-size:18px">Total de demostración <b style="float:right">'+clp(order.total)+'</b></p></div><p style="margin:26px 0"><a href="'+esc(tracking)+'" style="background:#27352b;color:#fff;text-decoration:none;padding:14px 20px;border-radius:8px;display:inline-block">Seguir mi pedido</a></p><p style="font-size:12px;color:#6e7169;line-height:1.7">Adjuntamos tu comprobante en PDF. Este es un prototipo académico: no se procesó ningún cobro y el documento no es una boleta tributaria electrónica del SII.</p><p style="font-size:12px;color:#6e7169">Con cariño,<br><b>Equipo Retail SmartCart</b></p></div></div></div>';
  const pdf=receiptPdf(order), attachments=[{filename:"comprobante-"+String(order.id).replace(/[^a-zA-Z0-9-]/g,"")+".pdf",content:pdf}];
  let sent=[];
  const orderSummary='<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse">'+items.map(i=>{const image=String(i.image||i.image_url||"");const safeImage=/^https:\/\//i.test(image)?esc(image):"";return '<tr><td width="88" valign="top" style="width:88px;padding:12px 12px 12px 0;border-bottom:1px solid #e7e2d7">'+(safeImage?'<img src="'+safeImage+'" width="76" height="92" alt="'+esc(i.name||"Prenda")+'" style="display:block;width:76px;height:92px;object-fit:cover;border:0;background:#f3f1eb">':'<div style="width:76px;height:92px;background:#f3f1eb;color:#7b806e;text-align:center;font-size:10px;line-height:92px">Retail</div>')+'</td><td valign="top" style="padding:12px 0;border-bottom:1px solid #e7e2d7;font-size:13px;line-height:1.6;color:#30352b"><strong>'+esc(i.name||"Prenda")+'</strong><br><span style="font-size:12px;color:#777b70">'+esc(i.color||"")+' · Talla '+esc(i.size||"")+' · '+(Number(i.qty)||1)+' unidad(es)</span></td><td valign="top" align="right" style="padding:12px 0 12px 8px;border-bottom:1px solid #e7e2d7;font-size:13px;white-space:nowrap">'+clp((Number(i.price)||0)*(Number(i.qty)||1))+'</td></tr>'}).join('')+'</table>';
  const orderTemplateId=Number(process.env.BREVO_ORDER_TEMPLATE_ID||3);
  try {
    const id=await sendEmail({
      to:email,
      subject:"Recibimos tu pedido en Retail SmartCart",
      templateId:orderTemplateId,
      templateParams:{
        customer_name:String(order.customer?.fullName||"Cliente"),
        order_number:String(order.id),
        order_summary:orderSummary,
        order_total:clp(order.total),
        order_status:"Pedido recibido"
      },
      attachments
    });
    sent.push({to:email,id});
    await logEvent("order_confirmation",email,order.id,"sent",id,null,{provider:"brevo",template_id:orderTemplateId});
  } catch(e) {
    await logEvent("order_confirmation",email,order.id,"failed",null,e.message,{provider:"brevo"});
    return res.status(503).json({sent:false,error:e.message});
  }
  if(admin&&admin!==email) {
    try {const id=await sendEmail({to:admin,subject:"Nuevo pedido "+order.id+" · Retail SmartCart",html:html.replace("¡Gracias, "+esc(order.customer?.fullName||"por tu compra")+"!","Nuevo pedido recibido").replace("Adjuntamos tu comprobante en PDF.","Se adjunta el comprobante del pedido."),attachments});sent.push({to:admin,id});await logEvent("new_order_admin",admin,order.id,"sent",id,null,{customer_email:email,provider:"brevo"});}
    catch(e){await logEvent("new_order_admin",admin,order.id,"failed",null,e.message,{customer_email:email});}
  }
  return res.status(200).json({sent:true,recipients:sent.map(x=>x.to),message:"Correo de confirmación enviado."});
}
