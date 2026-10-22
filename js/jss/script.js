/* ===== FUNCIONAMIENTO DE LA PÁGINA (JavaScript) ===== */
/* ===== 1. DATOS: cada objeto es una fila de la base de datos (ejemplos) ===== */
const CATS = ["Alimentos","Higiene","Pañales","Ropa","Útiles escolares","Juguetes","Muebles","Electrodomésticos"];
const DIA = 864e5, hoy = Date.now();
const hace = d => new Date(hoy - d*DIA);
/* Los hogares y las empresas que nos apoyan ahora vienen de la hoja de Google (Apps Script).
   Solo aparecen los hogares con Estado = Aprobado (ya confirmados por WhatsApp o por teléfono). */
const URL_APPS = 'https://script.google.com/macros/s/AKfycbwmobF7KxX2SEFCQAjUpey0j3w_jDmi0tqGOhZYDNdvssBUTcqph8dglRvPSEl0Amh2IA/exec';
/* WhatsApp de Paulina (Nos apoyan). Para cambiarlo, escribe otro número aquí (8 números, sin +591). */
const WHATSAPP_NOS_APOYAN = '77362667';
/* Todo se maneja desde la hoja de Google (pestaña Hogares):
   - "✓ Verificado": casilla M "Datos confirmados".
   - Horario de atención: columna W.
   - Para sumar un hogar: agregar la fila con Estado = Aprobado. */
let HOGARES = [], APOYAN = [], PENDIENTES = 0, cargando = true, errorCarga = false;
let MURO = [];   // las fotos del muro vienen de la hoja (pestaña Muro)

/* ===== 2. REGLAS DEL SEMÁFORO ===== */
const dias = f => Math.floor((hoy - f.getTime())/DIA);
const nivelFinal = h => dias(h.fecha) > 30 ? "Gris" : h.reportado;   // más de 30 días sin actualizar = Gris
const orden = {Rojo:1, Amarillo:2, Verde:3, Gris:4};
/* El mensaje de WhatsApp nombra lo que elegiste en el filtro (o todo lo que el hogar necesita) */
const waLink = h => { const cs = catsElegidas(), dona = cs.length ? h.cats.filter(c => cs.includes(c)) : h.cats;
  const txt = dona.length ? "Hola, vengo de Cruz Solidaria y quiero donar: " + dona.join(", ") + ". ¿Cuándo puedo llevarlo?"
                          : "Hola, vengo de Cruz Solidaria y quiero hacer una donación. ¿Qué necesitan?";
  return "https://wa.me/591" + h.wa.replace(/\D/g,"") + "?text=" + encodeURIComponent(txt); };
/* Teléfonos: un celular (8 dígitos que empiezan con 6 o 7) se abre en WhatsApp; un teléfono fijo se llama.
   En la hoja se puede escribir uno solo o los dos separados con "/" (ejemplo: 73151322 / 3361234). */
function telefonos(raw){
  // Junta todos los dígitos, quita el +591 y los va cortando: celular = 8 dígitos (6 o 7 adelante),
  // fijo = 7 dígitos, u 8 si empieza con el código de área 3. Así funciona con "/", comas o espacios.
  let d = String(raw ?? "").split(/[\/,;|]|\sy\s|\so\s/).map(t => t.replace(/\D/g, "").replace(/^591(?=\d{7})/, "")).join("");
  let cel = "", fijo = "";
  while (d.length >= 7) {
    if (/^[67]/.test(d) && d.length >= 8) { cel = cel || d.slice(0, 8); d = d.slice(8); }
    else if (/^3/.test(d) && (d.length === 8 || d.length === 16 || (d.length > 8 && /^3[3-9]/.test(d) && /^[67]/.test(d.slice(8))) )) { fijo = fijo || d.slice(0, 8); d = d.slice(8); }
    else { fijo = fijo || d.slice(0, 7); d = d.slice(7); }
  }
  return { cel, fijo };
}
const fijoBonito = f => { const n = f.length === 7 ? f : f.slice(1); return "3 " + n.slice(0, 3) + " " + n.slice(3); };   // 3 353 2716
const telLink = f => "tel:+591" + (f.length === 7 ? "3" + f : f);   // en Santa Cruz el código de área es 3
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue("--" + n.toLowerCase()).trim();
const fmt = f => f.toLocaleDateString("es-BO",{day:"numeric",month:"short"});
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ===== 3. FILTROS ===== */
const $ = id => document.getElementById(id);
$("fCat").innerHTML = CATS.map((c,i) => `<label><input type="checkbox" id="fc${i}" value="${c}">${c}</label>`).join("");
const catsElegidas = () => [...$("fCat").querySelectorAll(":checked")].map(i => i.value);
const aprobados = () => HOGARES.filter(h => h.estado === "Aprobado");
function visibles(){
  const cs = catsElegidas(), z = $("fZona").value;
  return aprobados()
    .filter(h => (!cs.length || h.cats.some(c => cs.includes(c))) && (!z || h.zona === z))
    .sort((a,b) => orden[nivelFinal(a)] - orden[nivelFinal(b)] || a.fecha - b.fecha);
}

/* ===== 4. MAPA: Leaflet + OpenStreetMap (con mapa esquemático de respaldo) ===== */
let sel = null, lmap = null, capa = null, usarEsquema = false;
const pinSVG = (color, grande) => { const w = grande ? 34 : 28, h = Math.round(w*1.3);
  return `<svg width="${w}" height="${h}" viewBox="0 0 30 39"><path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.4 15 38 15 38s14-12.6 14-23.1C29 7.2 22.7 1 15 1z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg>`; };

function iniciarMapa(){
  if (!window.L) { activarEsquema(); return; }
  lmap = L.map("lmap", {scrollWheelZoom:false}).setView([-17.7834, -63.1821], 12);
  let cargo = false;
  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:18, attribution:"© OpenStreetMap"});
  tiles.on("tileload", () => { cargo = true; });
  tiles.addTo(lmap);
  capa = L.layerGroup().addTo(lmap);
  setTimeout(() => { if (!cargo && !usarEsquema) activarEsquema(); }, 8000);  // si los mapas no cargan, usamos el esquema
}
function activarEsquema(){
  usarEsquema = true; $("lmap").hidden = true; $("smap").removeAttribute("hidden");   // en un dibujo SVG hay que sacar el atributo "hidden"
  $("mapNote").textContent = "No se pudo cargar el mapa de calles, así que mostramos un mapa simple por anillos. Revisa tu conexión y recarga la página.";
  render();
}
const C = {lat:-17.7834,lng:-63.1821}, CX=300, CY=225, K=3700;
const proj = h => ({x: CX + (h.lng - C.lng)*K*0.953, y: CY - (h.lat - C.lat)*K});
function esquemaBase(){ let g="";
  for(let a=0;a<180;a+=22.5){const r=a*Math.PI/180;g+=`<line x1="${CX-230*Math.cos(r)}" y1="${CY-230*Math.sin(r)}" x2="${CX+230*Math.cos(r)}" y2="${CY+230*Math.sin(r)}" stroke="var(--road)" stroke-width="2"/>`}
  [["1er",32],["2do",68],["3er",108],["4to",150],["5to",195]].forEach(([n,r])=>{g+=`<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="var(--ring)" stroke-width="2"/><text x="${CX+r*.71+4}" y="${CY-r*.71-3}" font-size="10" fill="var(--muted)">${n} anillo</text>`});
  g+=`<rect x="${CX-6}" y="${CY-6}" width="12" height="12" fill="var(--green)" rx="2"/><text x="${CX+10}" y="${CY+18}" font-size="10" fill="var(--muted)">Plaza 24 de Septiembre</text>`;
  [["NORTE",CX,28],["SUR",CX,448],["OESTE",40,CY+4],["ESTE",560,CY+4]].forEach(([t,x,y])=>g+=`<text x="${x}" y="${y}" text-anchor="middle" font-size="12" font-weight="700" letter-spacing="2" fill="var(--muted)">${t}</text>`);
  return g;
}
function dibujarMapa(vs){
  if (usarEsquema){
    let pins = "";
    vs.slice().reverse().forEach(h => { const p = proj(h), n = nivelFinal(h), r = n==="Gris" ? 8 : 11;
      pins += `<g class="pin${sel===h.id?" on":""}" data-id="${h.id}" tabindex="0" role="button" aria-label="${esc(h.nombre)}, ${n}">
        <path d="M${p.x} ${p.y} c-${r*.9} -${r*1.3} -${r} -${r*1.6} -${r} -${r*2.1} a${r} ${r} 0 1 1 ${r*2} 0 c0 ${r*.5} -${r*.1} ${r*.8} -${r} ${r*2.1}z" fill="var(--${n.toLowerCase()})" stroke="var(--surface)" stroke-width="2"/>
        <circle cx="${p.x}" cy="${p.y-r*2.1}" r="${r*.38}" fill="var(--surface)"/></g>`; });
    $("smap").innerHTML = esquemaBase() + pins;
    return;
  }
  if (!lmap) return;
  capa.clearLayers();
  vs.forEach(h => { const n = nivelFinal(h), grande = sel === h.id;
    const icono = L.divIcon({className:"lpin", html:pinSVG(cssVar(n), grande), iconSize:[grande?34:28, grande?44:36], iconAnchor:[grande?17:14, grande?44:36]});
    L.marker([h.lat, h.lng], {icon:icono, title:h.nombre, zIndexOffset: grande ? 1000 : (5-orden[n])*10})
      .on("click", () => pick(h.id)).addTo(capa); });
}

/* ===== 5. FICHAS ===== */
function render(){
  $("fLimpiar").hidden = !catsElegidas().length && !$("fZona").value;
  if (cargando || errorCarga) { $("cards").innerHTML = `<div class="empty">${errorCarga ? "No se pudieron cargar los hogares. Revisa tu internet y recarga la página." : "Cargando hogares..."}</div>`; return; }
  const vs = visibles();
  dibujarMapa(vs);
  $("cards").innerHTML = vs.length ? vs.map(h => { const n = nivelFinal(h), d = dias(h.fecha);
    return `<article class="card ${n==="Gris"?"gris":""} ${sel===h.id?"on":""}" id="h${h.id}">
      <div style="min-width:0">
        <div class="row" style="justify-content:space-between"><h3>${esc(h.nombre)}</h3><span class="state s-${n}"><i class="dot" style="background:currentColor;margin:0"></i>${h.sinDatos ? "Sin datos" : n}</span></div>
        <div class="meta">${esc(h.zona)} · ${esc(h.dir)}</div>
        ${h.confirmado
          ? `<div class="fine" style="color:var(--green);margin-top:4px;font-weight:700">✓ Verificado por Cruz Solidaria</div>`
          : ``}
        ${h.horario ? `<div class="fine">🕒 Horario de atención: ${esc(h.horario)}</div>` : ""}
        <div class="fine">${h.sinDatos ? "Todavía no nos contó qué necesita este mes. Consulta antes de llevar tu donación."
          : n==="Gris" ? (d > 365 ? "Sin fecha de actualización. Sus necesidades pueden haber cambiado." : `Sin actualizar hace ${d} días. Sus necesidades pueden haber cambiado.`) : `Actualizado el ${fmt(h.fecha)} · ${h.donantes} donantes este mes`}</div>
        <div class="tags">${h.cats.map(c => `<span class="tag${catsElegidas().includes(c) ? " on" : ""}">${esc(c)}</span>`).join("")}</div>
        <div class="row">
          ${h.wa ? `<a class="btn sm wa" href="${waLink(h)}" target="_blank" rel="noopener" data-wa="${h.id}">WhatsApp</a>` : ""}
          ${h.fijo ? `<a class="btn sm ${h.wa ? "ghost" : "wa"}" href="${telLink(h.fijo)}" data-wa="${h.id}">Llamar</a>`
                   : h.wa ? `<a class="btn sm ghost" href="${telLink(h.wa)}" data-wa="${h.id}">Llamar</a>` : ""}
          <a class="btn sm ghost" href="https://www.google.com/maps/dir/?api=1&destination=${h.conCoord ? h.lat + "," + h.lng : encodeURIComponent(h.nombre + ", " + h.dir + ", Santa Cruz, Bolivia")}" target="_blank" rel="noopener">Cómo llegar</a>
        </div>
        <div class="fine" style="margin-top:6px">${[h.wa ? `Celular: +591 ${h.wa}` : "", h.fijo ? `Teléfono fijo: ${fijoBonito(h.fijo)}` : ""].filter(Boolean).join(" · ") || (h.horario ? "No tiene teléfono publicado. Puedes ir directo en su horario de atención con «Cómo llegar»." : "No tiene teléfono publicado. Puedes ir directo con «Cómo llegar».")}</div>
      </div></article>`; }).join("")
    : `<div class="empty">Ningún hogar coincide con esos filtros. Prueba con otra zona o categoría.</div>`;
  const p = PENDIENTES;
  $("pendientes").textContent = p === 1 ? "1 hogar en verificación. Aparecerá en el mapa cuando esté aprobado." : p ? `${p} hogares en verificación. Aparecerán en el mapa cuando estén aprobados.` : "";
}
function pick(id){ sel = id; render(); const el = $("h"+id); el && el.scrollIntoView({block:"nearest", behavior:"smooth"}); }
$("smap").addEventListener("click", e => { const g = e.target.closest(".pin"); g && pick(+g.dataset.id); });
$("smap").addEventListener("keydown", e => { const g = e.target.closest(".pin"); if (g && (e.key==="Enter"||e.key===" ")) { e.preventDefault(); pick(+g.dataset.id); } });
$("fCat").onchange = $("fZona").onchange = () => { sel = null; render(); };
$("fLimpiar").onclick = () => { $("fCat").querySelectorAll(":checked").forEach(i => i.checked = false); $("fZona").value = ""; sel = null; render(); };

/* ===== 6. MICRO-ENCUESTA AL TOCAR WHATSAPP ===== */
let quizHogar = null, votos = {si:0, no:0};
$("cards").addEventListener("click", e => { const a = e.target.closest("[data-wa]"); if (!a) return;
  quizHogar = HOGARES.find(h => h.id == a.dataset.wa);
  $("qSub").textContent = "Estás por contactar a " + quizHogar.nombre + ". Tu respuesta nos ayuda a medir el impacto del proyecto.";
  $("qBtns").hidden = false; $("qOk").hidden = true;
  setTimeout(() => abrir("mQuiz"), 300); });
$("qBtns").addEventListener("click", e => { const b = e.target.closest("[data-a]"); if (!b) return;
  votos[b.dataset.a]++; if (b.dataset.a === "si") quizHogar.donantes++;
  // La respuesta se guarda en la hoja (Registros) y, si es "Sí", suma un donante al hogar
  fetch(URL_APPS, {method:"POST", mode:"no-cors", body:new URLSearchParams({
    form:"encuesta", id:quizHogar.id, nombre:quizHogar.nombre, respuesta: b.dataset.a === "si" ? "Sí" : "No",
    visitante: leerLocal("cs_nombre") || "" })}).catch(() => {});
  $("qBtns").hidden = true; $("qOk").hidden = false;
  $("qOk").textContent = "¡Gracias por responder!";
  render(); setTimeout(() => cerrar("mQuiz"), 1400); });

/* ===== 7. MURO DE IMPACTO ===== */
/* Fotos de Google Drive. Se usa la dirección de imagen directa (lh3), que también funciona en celulares
   sin sesión de Google. Si falla, se prueba la de miniatura de Drive. */
const fotoDrive = id => "https://lh3.googleusercontent.com/d/" + encodeURIComponent(id) + "=w800";
const fotoDrive2 = id => "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w800";
const idDrive = u => { const m = String(u || "").match(/\/d\/([\w-]+)|[?&]id=([\w-]+)/); return m ? (m[1] || m[2]) : ""; };
/* <img> que si no carga prueba la segunda dirección */
const imgDrive = (id, attrs) => `<img src="${fotoDrive(id)}" data-alt="${fotoDrive2(id)}" referrerpolicy="no-referrer" ${attrs}
  onerror="if(this.dataset.alt){this.src=this.dataset.alt;this.dataset.alt=''}">`;
function renderMuro(){
  if (!MURO.length) { $("wall").innerHTML = `<div class="empty">${cargando ? "Cargando donaciones..." : "Todavía no hay donaciones publicadas. ¡Sé la primera persona!"}</div>`; return; }
  $("wall").innerHTML = MURO.map(m => `<article class="post">
  ${m.foto ? `<div class="ph ph-foto">${imgDrive(m.foto, 'alt="Foto de la donación" loading="lazy"')}</div>`
           : `<div class="ph" style="background:linear-gradient(135deg,#1b6a45,#2e9a5a)">Sin foto</div>`}
  <div class="tx"><div class="who">${esc(m.who)}</div><div class="to">Donó a ${esc(m.to)}</div><p>${esc(m.txt)}</p></div></article>`).join(""); }

/* ===== 8. VENTANAS Y FORMULARIOS ===== */
function abrir(id){ $(id).hidden = false; const f = $(id).querySelector("input,select,button"); f && f.focus(); }
function cerrar(id){ $(id).hidden = true; }
document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m || e.target.hasAttribute("data-close")) m.hidden = true; }));
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".modal").forEach(m => m.hidden = true); });
const llenarHogares = s => { s.innerHTML = ""; aprobados().forEach(h => s.add(new Option(h.nombre, h.id))); };

/* Lee algo guardado en el navegador (por ejemplo, el nombre de quien se registró) */
function leerLocal(clave){ try { return localStorage.getItem(clave); } catch (e) { return null; } }

/* Achica la foto antes de mandarla (máximo 1200 px) para que se suba rápido */
function comprimirFoto(archivo){
  return new Promise((ok, mal) => {
    if (!archivo) return ok("");
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1200 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => mal(new Error("foto"));
    img.src = URL.createObjectURL(archivo);
  });
}

/* Manda datos a la hoja y lee la respuesta */
async function enviarHoja(datos){
  const r = await fetch(URL_APPS, {method:"POST", body:new URLSearchParams(datos), cache:"no-store"});
  return r.json();
}

/* Botón con estado "Enviando..." */
function ocupado(id, si, texto){ $(id).disabled = si; $(id).textContent = texto; }

$("btnSubir").onclick = () => { llenarHogares($("sHog")); $("fSubir").reset(); $("sErr").textContent = "";
  $("fSubir").hidden = false; $("sOk").hidden = true; ocupado("sBtn", false, "Enviar al muro"); abrir("mSubir"); };
$("fSubir").onsubmit = async e => { e.preventDefault();
  const h = HOGARES.find(x => x.id == $("sHog").value);
  if (!h) { $("sErr").textContent = "Elige un hogar."; return; }
  ocupado("sBtn", true, "Enviando...");
  try {
    const foto = await comprimirFoto($("sFoto").files[0]);
    // Se guarda en la pestaña Muro como Pendiente; aparece cuando el equipo la aprueba
    const r = await enviarHoja({form:"muro", nombre:$("sNom").value, hogar:h.nombre, resena:$("sRes").value, foto});
    if (!r.ok) throw new Error(r.mensaje);
    $("fSubir").hidden = true; $("sOk").hidden = false;
    $("sOk").textContent = "¡Gracias! Revisamos tu foto y en unos días aparece en el muro.";
    setTimeout(() => cerrar("mSubir"), 2500);
  } catch (err) {
    $("sErr").textContent = err.message === "foto" ? "No pudimos leer la foto. Prueba con una foto JPG o PNG."
                                                    : "No se pudo enviar. Revisa tu internet y prueba de nuevo.";
    ocupado("sBtn", false, "Enviar al muro");
  } };

/* Inscripción: el hogar también elige su semáforo y lo que necesita */
$("iCats").innerHTML = CATS.map((c,i) => `<label><input type="checkbox" value="${c}" id="ic${i}">${c}</label>`).join("");
const urgInscripcion = () => document.querySelector("input[name=iUrg]:checked").value;
const REGLA_INSCRIPCION = {
  Rojo: "Rojo: urgencia máxima, hasta 2 categorías. Lo confirmamos cuando te llamemos; mientras tanto tu hogar se muestra en amarillo.",
  Amarillo: "Amarillo: necesitan ayuda pero todavía tienen reservas.",
  Verde: "Verde: están estables. Aceptan donaciones no urgentes como ropa, juguetes o muebles." };
const mostrarReglaInscripcion = () => { $("iRule").textContent = REGLA_INSCRIPCION[urgInscripcion()]; };
document.querySelectorAll("input[name=iUrg]").forEach(r => r.onchange = mostrarReglaInscripcion);
$("iCats").addEventListener("change", e => { if (urgInscripcion() === "Rojo" && $("iCats").querySelectorAll(":checked").length > 2) { e.target.checked = false; $("iErr").textContent = "En rojo solo puedes marcar hasta 2 categorías."; } });
$("btnInscribir").onclick = () => { $("fInscribir").reset(); mostrarReglaInscripcion(); $("iErr").textContent = ""; $("iBtn").disabled = false; $("iBtn").textContent = "Enviar solicitud"; abrir("mInscribir"); };
$("fInscribir").onsubmit = async e => { e.preventDefault(); const wa = $("iWa").value.replace(/\D/g,"").replace(/^591(?=\d{7,8}$)/, "");
  if (!/^[67]\d{7}$/.test(wa) && !/^3?\d{7}$/.test(wa)) { $("iErr").textContent = "Escribe un celular de 8 dígitos o un teléfono fijo de 7, sin el +591."; return; }
  const iu = urgInscripcion(), ics = [...$("iCats").querySelectorAll(":checked")].map(c => c.value);
  if (!ics.length) { $("iErr").textContent = "Marca al menos una cosa que necesiten este mes."; return; }
  if (iu === "Rojo" && ics.length > 2) { $("iErr").textContent = "En rojo solo puedes marcar hasta 2 categorías."; return; }
  $("iErr").textContent = ""; $("iBtn").disabled = true; $("iBtn").textContent = "Enviando...";
  try {
    // La solicitud se guarda en la hoja (pestaña Hogares) como Pendiente y llega un aviso por correo
    await fetch(URL_APPS, {method:"POST", mode:"no-cors", body:new URLSearchParams({
      form:"hogar", nombre:$("iNom").value, zona:$("iZona").value, direccion:$("iDir").value,
      maps:$("iMaps").value, whatsapp:wa, responsable:$("iResp").value, horario:$("iHor").value, semaforo:iu, cats:ics.join(", ") })});
    PENDIENTES++; cerrar("mInscribir"); render();
    $("pendientes").textContent = "¡Solicitud enviada! Te vamos a contactar para verificar los datos.";
    $("pendientes").scrollIntoView({block:"center"});
  } catch (err) {
    $("iErr").textContent = "No se pudo enviar. Revisa tu internet y prueba de nuevo.";
    $("iBtn").disabled = false; $("iBtn").textContent = "Enviar solicitud";
  } };

/* Reglas anti-trampas de la actualización mensual */
$("aCats").innerHTML = CATS.map((c,i) => `<label><input type="checkbox" value="${c}" id="ac${i}">${c}</label>`).join("");
const REGLAS = {
  Rojo: "Rojo: máximo 2 categorías y foto de evidencia obligatoria (por ejemplo, la despensa vacía). Si reciben donaciones comprobadas en el muro, al mes siguiente bajan a amarillo.",
  Amarillo: "Amarillo: necesitan ayuda pero todavía tienen reservas.",
  Verde: "Verde: estables. Aceptan donaciones no vitales como ropa, juguetes o muebles." };
const urgencia = () => document.querySelector("input[name=aUrg]:checked").value;
function mostrarRegla(){ const u = urgencia(); $("aRule").textContent = REGLAS[u]; $("aFotoCampo").hidden = u !== "Rojo"; $("aErr").textContent = ""; }
document.querySelectorAll("input[name=aUrg]").forEach(r => r.onchange = mostrarRegla);
$("aCats").addEventListener("change", e => { if (urgencia() === "Rojo" && $("aCats").querySelectorAll(":checked").length > 2) { e.target.checked = false; $("aErr").textContent = "En rojo solo puedes marcar hasta 2 categorías."; } });
$("btnActualizar").onclick = () => { llenarHogares($("aHog")); $("fActualizar").reset(); mostrarRegla();
  $("fActualizar").hidden = false; $("aOk").hidden = true; ocupado("aBtn", false, "Guardar actualización"); abrir("mActualizar"); };
$("fActualizar").onsubmit = async e => { e.preventDefault(); const u = urgencia(), cats = [...$("aCats").querySelectorAll(":checked")].map(c => c.value);
  if (!cats.length) { $("aErr").textContent = "Marca al menos una categoría."; return; }
  if (u === "Rojo" && cats.length > 2) { $("aErr").textContent = "En rojo solo puedes marcar hasta 2 categorías."; return; }
  if (u === "Rojo" && !$("aFoto").files.length) { $("aErr").textContent = "Para marcar rojo tienes que adjuntar la foto de evidencia."; return; }
  const h = HOGARES.find(x => x.id == $("aHog").value);
  $("aErr").textContent = ""; ocupado("aBtn", true, "Guardando...");
  try {
    const foto = u === "Rojo" ? await comprimirFoto($("aFoto").files[0]) : "";
    // La hoja revisa el código secreto antes de guardar
    const r = await enviarHoja({form:"actualizar", id:h.id, nombre:h.nombre, codigo:$("aCod").value,
      semaforo:u, cats:cats.join(", "), foto});
    if (!r.ok) { $("aErr").textContent = r.mensaje; ocupado("aBtn", false, "Guardar actualización"); return; }
    Object.assign(h, {reportado: r.revision ? "Amarillo" : u, cats, fecha:new Date(), donantes:0});
    $("fActualizar").hidden = true; $("aOk").hidden = false;
    $("aOk").textContent = r.revision
      ? "¡Listo! Guardamos tu actualización. El rojo aparece cuando revisemos la foto; mientras tanto se ve en amarillo."
      : "¡Listo! Tu hogar ya está actualizado.";
    sel = h.id; render(); setTimeout(() => cerrar("mActualizar"), 3500);
  } catch (err) {
    $("aErr").textContent = err.message === "foto" ? "No pudimos leer la foto. Prueba con una foto JPG o PNG."
                                                    : "No se pudo guardar. Revisa tu internet y prueba de nuevo.";
    ocupado("aBtn", false, "Guardar actualización");
  } };

/* ===== INICIO ===== */
/* ===== 9. CARGAR DATOS DESDE LA HOJA DE GOOGLE ===== */
const num = v => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : null; };
/* Arregla los datos que vienen de la hoja: tildes, mayúsculas, números y fechas */
const sinTilde = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const catOficial = c => CATS.find(k => sinTilde(k) === sinTilde(c)) || String(c).trim();
const listaCats = v => (Array.isArray(v) ? v : String(v ?? "").split(",")).map(c => String(c).trim()).filter(Boolean).map(catOficial);
const nivelOk = v => { const s = sinTilde(v); return s === "rojo" ? "Rojo" : s === "verde" ? "Verde" : "Amarillo"; };  // "Rojo (en revisión)" se ve amarillo
const coordOk = v => { const n = num(v); return n !== null && Math.abs(n) > 1 ? n : null; };  // 0 o vacío = sin coordenadas
const fechaOk = v => { const f = new Date(v); return isNaN(f) ? new Date(0) : f; };
/* Esconde las filas de prueba de la hoja (nombre "hola", "prueba", "test" o números 7000000x) */
const esPrueba = h => /^(hola|prueba|test|ejemplo)\b/.test(sinTilde(h.nombre)) || /^7000000\d$/.test(String(h.wa || ""));
async function cargarDatos(){
  try {
    // "?t=..." y "no-store" hacen que el navegador pida datos nuevos cada vez (sin usar una copia vieja)
    const pedir = () => fetch(URL_APPS + "?t=" + Date.now(), {cache:"no-store"}).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    let d;
    try { d = await pedir(); } catch (e) { d = await pedir(); }   // si falla, prueba una vez más
    HOGARES = (d.hogares || []).map(h => ({ ...h, nombre: String(h.nombre ?? ""), zona: String(h.zona ?? "").trim(),
      dir: String(h.dir ?? ""), wa: telefonos(h.wa).cel, fijo: telefonos(h.wa).fijo,
      cats: listaCats(h.cats), reportado: nivelOk(h.reportado), donantes: Number(h.donantes) || 0,
      lat: coordOk(h.lat) ?? C.lat, lng: coordOk(h.lng) ?? C.lng, conCoord: coordOk(h.lat) != null && coordOk(h.lng) != null, fecha: fechaOk(h.fecha), estado: "Aprobado" }))
      .filter(h => !esPrueba(h))
      .map(h => ({ ...h, confirmado: h.confirmado === true, horario: String(h.horario ?? "").trim(),
        sinDatos: !h.cats.length }));   // sin categorías = todavía no nos contó qué necesita
    APOYAN = d.apoyan || []; PENDIENTES = Number(d.pendientes) || 0; MURO = d.muro || [];
  } catch (e) { errorCarga = true; }
  cargando = false; render(); renderApoyan(); renderMuro();
}
/* Si el logo es un link de Google Drive ("Compartir → Copiar enlace"), lo convierte en imagen */
function linkLogo(u){
  u = String(u || "").trim();
  const m = u.match(/\/d\/([\w-]+)|[?&]id=([\w-]+)/);
  return (/drive\.google\.com/.test(u) && m) ? fotoDrive(m[1] || m[2]) : u;
}
/* Botón "Quiero ser parte de la causa": abre WhatsApp con el mensaje ya escrito */
/* "@usuario" se vuelve link de Instagram; "www.algo.com" se vuelve https://www.algo.com */
function linkWeb(u){
  u = String(u || "").trim(); if (!u) return "";
  if (u.startsWith("@")) return "https://www.instagram.com/" + u.slice(1) + "/";
  return /^https?:\/\//i.test(u) ? u : "https://" + u;
}
const linkSerParte = () => "https://wa.me/591" + WHATSAPP_NOS_APOYAN + "?text=" +
  encodeURIComponent("Hola, vi la página de Cruz Solidaria y me gustaría ser parte de la causa. ¿Me pueden contar cómo funciona?");
function renderApoyan(){
  $("sponsors").innerHTML = APOYAN.map(p => {
    const estiloLogo = 'alt="" style="width:56px;height:56px;object-fit:contain;border-radius:14px"';
    const logo = !p.logo ? "" : (/drive\.google\.com/.test(p.logo) && idDrive(p.logo)) ? imgDrive(idDrive(p.logo), estiloLogo)
                        : `<img src="${esc(linkLogo(p.logo))}" ${estiloLogo}>`;
    const logoFinal = logo || `<div class="logo-ph">${esc(String(p.nombre).charAt(0))}</div>`;
    const nombre = p.link ? `<a href="${esc(linkWeb(p.link))}" target="_blank" rel="noopener"><b>${esc(p.nombre)}</b></a>` : `<b>${esc(p.nombre)}</b>`;
    return `<div class="slot">${logoFinal}${nombre}<span>${esc(p.aporte || "")}</span></div>`;
  }).join("") + `<div class="slot"><div class="logo-ph">+</div><b>Tu empresa puede estar aquí</b>
    <a class="btn sm wa" href="${linkSerParte()}" target="_blank" rel="noopener">Quiero ser parte de la causa</a>
    <span>WhatsApp: +591 ${WHATSAPP_NOS_APOYAN}</span></div>`;
}

iniciarMapa(); render(); renderMuro(); renderApoyan(); cargarDatos();

/* ===== MENÚ FIJO ARRIBA =====
   Guarda la altura del menú en --alto-menu (en celular es más alto) para que,
   al tocar un botón del menú, el título de la sección no quede tapado.
   También le pone una sombrita al menú cuando la página ya bajó. */
(function () {
  const barra = document.getElementById("topbar");
  if (!barra) return;
  const medir = () => document.documentElement.style.setProperty("--alto-menu", barra.offsetHeight + "px");
  const sombra = () => barra.classList.toggle("con-sombra", window.scrollY > 8);
  medir(); sombra();
  window.addEventListener("resize", medir);
  window.addEventListener("scroll", sombra, { passive: true });
})();
