# Configuración de correo y carritos abandonados — Retail SmartCart

Esta integración está limitada a la rama de vista previa. No publicar a producción sin autorización.

## Funciones incluidas
- Correo de agradecimiento al confirmar un pedido, con código de pedido, resumen de compra y PDF de comprobante de demostración.
- Aviso del nuevo pedido al correo administrativo configurado.
- Persistencia del carrito en Supabase cuando el cliente dio consentimiento para recibir recordatorios.
- Proceso horario de recuperación: tras más de una hora sin actividad, envía un cupón si el carrito sigue activo y el cliente consintió.
- Regla de cupón: subtotal menor a $25.000 → $4.990; desde $25.000 hasta $44.999 → $5.000; desde $45.000 → $9.990.
- Validación del cupón por correo electrónico. El comprobante PDF es demostrativo y NO es una boleta tributaria electrónica del SII.

## Variables privadas en Vercel
En el proyecto `retail-smartcart`, sección Settings → Environment Variables, crea estas variables para **Preview** y la rama `feat/reportes-supabase-pwa-preview` solamente:
- `RESEND_API_KEY`: API key privada de Resend.
- `RESEND_FROM_EMAIL`: remitente que Resend tenga verificado, por ejemplo `Retail SmartCart <pedidos@tu-dominio-verificado.cl>`.
- `SUPABASE_SERVICE_ROLE_KEY`: clave privada de servicio del proyecto Supabase. Nunca usarla como variable `VITE_*` ni subirla a GitHub.
- `CRON_SECRET`: cadena aleatoria robusta usada para autenticar el proceso programado.

La variable `VITE_ADMIN_NOTIFICATION_EMAIL` ya se utiliza como destinatario administrativo en la vista previa. Tras añadir variables, crear un nuevo despliegue de Preview.

## Guardar el mismo secreto en Supabase Vault
En el SQL Editor del proyecto Supabase, ejecutar una sola vez reemplazando el marcador por exactamente el mismo valor que se guardó en Vercel como `CRON_SECRET`:

```sql
select vault.create_secret(
  'REEMPLAZAR_POR_EL_MISMO_CRON_SECRET_DE_VERCEL',
  'smartcart_cron_secret',
  'Token para autenticar el cron horario de carritos abandonados de Retail SmartCart Preview'
);
```

El cron horario `retail-smartcart-abandoned-carts-hourly` ya está creado en Supabase y llama a la API de la rama Preview. No enviará correos reales hasta que estén configurados el remitente verificado, la API key de Resend y la clave privada de Supabase.

## Comprobación
Abrir `/api/email-status` en la vista previa para ver qué componentes aparecen configurados. No compartir claves privadas en el chat ni almacenarlas en GitHub.
