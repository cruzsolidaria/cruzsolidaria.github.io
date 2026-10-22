/* ===== VENTANA DE REGISTRO DE VISITANTES (JavaScript) ===== */
(function () {
  const URL_REGISTRO = URL_APPS;  // la misma dirección, se cambia arriba

  const fondo = document.getElementById('registro-fondo');
  const form = document.getElementById('form-registro');
  const mensaje = document.getElementById('registro-mensaje');

  function leer(clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } }
  function guardar(clave, valor) { try { localStorage.setItem(clave, valor); } catch (e) {} }

  function enviar(datos) {
    return fetch(URL_REGISTRO, { method: 'POST', mode: 'no-cors', keepalive: true, body: new URLSearchParams(datos) });
  }

  // Muestra la ventana solo si la persona todavía no se registró
  // Se muestra solo la primera vez: si ya se registró o tocó "Ahora no", no vuelve a aparecer
  if (!leer('cs_nombre') && !leer('cs_omitido')) fondo.classList.add('abierto');

  document.getElementById('registro-cerrar').onclick = () => { guardar('cs_omitido', '1'); fondo.classList.remove('abierto'); };

  // El botón "Registrarme" del menú abre la ventana cuando quieras
  document.getElementById('navRegistro').onclick = (e) => { e.preventDefault(); form.reset(); mensaje.textContent = ''; fondo.classList.add('abierto'); };

  // Cuando alguien se registra, se guarda una fila en la hoja
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(form));
    datos.accion = 'Se registró';
    mensaje.textContent = 'Guardando...';
    try {
      await enviar(datos);
      guardar('cs_nombre', datos.nombre);
      guardar('cs_correo', datos.correo);
      mensaje.textContent = '¡Listo! Gracias por registrarte 💛';
      setTimeout(() => fondo.classList.remove('abierto'), 1500);
    } catch (err) {
      mensaje.textContent = 'No se pudo guardar. Revisa tu internet.';
    }
  });

  // Cuando alguien toca un botón de WhatsApp, también se anota quién fue
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="wa.me"], a[href*="whatsapp"], a[href^="tel:"]');
    if (!link) return;
    enviar({
      nombre: leer('cs_nombre') || 'Visitante sin registro',
      correo: leer('cs_correo') || '',
      accion: (link.href.startsWith('tel:') ? 'Llamó por teléfono: ' : 'Contactó por WhatsApp: ') + link.href
    });
  });
})();
