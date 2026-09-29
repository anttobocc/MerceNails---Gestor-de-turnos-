# Merce Nails

Web y sistema de turnos online de Merce Nails. Mobile-first: la mayoría de las clientas entra desde Instagram o WhatsApp.

- **Web para clientas** (`/`): presentación, servicios con precio y duración, carrusel de trabajos, contacto y barra inferior fija (Inicio · Servicios · Trabajos · Turnos · WhatsApp).
- **Reserva de turno** (`/reservar`): servicio → fecha → horario disponible → nombre + WhatsApp → confirmación.
- **Panel de administración** (`/admin/`): dashboard del día, próximos, pendientes, calendario, servicios y precios, horarios, días bloqueados, configuración y mensajes de WhatsApp.

## Cómo funciona una reserva

1. La clienta elige servicio, día y horario. Solo se muestran horarios libres según los horarios de atención, la duración del servicio y los turnos ya tomados.
2. Al confirmar, el servidor **vuelve a verificar** que el horario siga libre y **guarda el turno en la base de datos** con estado *pendiente*.
3. Recién después se abre WhatsApp con el mensaje armado para Merce:
   ```
   💅 Nuevo turno — Merce Nails
   Cliente: Camila Rodríguez
   Servicio: Capping
   Fecha: 05/10/2026
   Hora: 17:00
   WhatsApp: 3794123456
   ```
4. El turno aparece en el panel. Desde ahí Merce lo confirma con un toque ("Confirmar y avisar por WhatsApp" le abre el chat con la clienta con el mensaje listo).

WhatsApp es el aviso, no el registro: aunque la clienta no envíe el mensaje, el turno ya está guardado y ocupa el horario.

> El mensaje se abre con un link `wa.me` (la persona toca "enviar"). Para que se envíe solo, sin intervención, hace falta la API de WhatsApp Business (Meta Cloud API), que es paga y requiere verificar el negocio.

## Requisitos

- Node.js 22.13 o superior (usa la base SQLite que viene incluida en Node, no hay que instalar una base aparte).

## Uso local

```bash
npm install
cp .env.example .env      # y poné una ADMIN_PASSWORD
npm start
```

- Web: http://localhost:3000
- Panel: http://localhost:3000/admin/ (usuario `merce` y la contraseña de `ADMIN_PASSWORD`)

La contraseña de `.env` solo se usa la primera vez; después se cambia desde **Configuración** en el panel. Si se olvida:

```bash
npm run set-password -- "nueva-clave"
```

La primera vez se cargan servicios, precios y horarios de ejemplo: **revisalos y editalos desde el panel** (Servicios, Horarios disponibles, WhatsApp y Configuración).

## Estructura

```
server.js            servidor Express
src/db.js            base de datos (tablas y datos iniciales)
src/slots.js         cálculo de horarios libres (hora de Argentina)
src/auth.js          login de la administradora (contraseña con scrypt, sesión con cookie)
src/routes/public.js API pública: servicios, días, horarios, crear turno
src/routes/admin.js  API del panel
public/              web de clientas, página de reserva y panel (/admin)
data/                base de datos (se crea sola, no se sube a git)
```

## Fotos

Las fotos del carrusel "Mis trabajos" están en `public/img/trabajos/`. Para agregar o cambiar fotos, ponelas en esa carpeta y sumalas a la lista `GALERIA` en `public/script.js`. La foto de portada es `public/img/hero.jpg` (todavía es un recorte del diseño).

## Publicarlo

Necesita un hosting que corra Node y tenga **disco persistente** para la carpeta `data/` (por ejemplo Railway o Render con disco, o un VPS). No sirve un hosting solo estático (Netlify, GitHub Pages) ni uno sin disco persistente, porque se perderían los turnos.

- Configurá `NODE_ENV=production` (cookie segura bajo HTTPS), `ADMIN_PASSWORD` y, si el disco se monta en otra ruta, `DATA_DIR`.
- **Backup**: todo está en un solo archivo, `data/mercenails.db`. Conviene copiarlo periódicamente.
