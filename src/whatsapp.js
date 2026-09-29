const formatDate = date => date.split('-').reverse().join('/');

// Número en formato internacional para wa.me (Argentina: 549 + característica + número)
function toWaNumber(phone) {
  let d = String(phone).replace(/\D/g, '').replace(/^00/, '');
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '549' + d;
  else if (d.startsWith('54') && !d.startsWith('549') && d.length === 12) d = '549' + d.slice(2);
  return d;
}

function waLink(phone, text) {
  return `https://wa.me/${toWaNumber(phone)}?text=${encodeURIComponent(text)}`;
}

function bookingMessage(appt, businessName) {
  return [
    `💅 Nuevo turno — ${businessName}`,
    `Cliente: ${appt.client_name}`,
    `Servicio: ${appt.service_name}`,
    `Fecha: ${formatDate(appt.date)}`,
    `Hora: ${appt.time}`,
    `WhatsApp: ${appt.client_phone}`,
    `Turno N° ${appt.id}`,
  ].join('\n');
}

module.exports = { waLink, bookingMessage, toWaNumber, formatDate };
