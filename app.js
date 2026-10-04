// app.js: the map, your location, the list of nearest spaces and the bay details.
// The parking rules themselves live in rules.js.
(function () {
const $ = id => document.getElementById(id);
const COL = { yes: '#2FB36D', pay: '#E0AE12', no: '#E5484D', check: '#8E99A4' };

// Flat-earth projection in metres, accurate enough for distances inside Camden
const LAT0 = 51.545, LNG0 = -0.16, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110574;
const P = (lng, lat) => [(lng - LNG0) * KX, -(lat - LAT0) * KY];

// Remember settings on this phone
const store = {
  get(k) { try { return localStorage.getItem('cip:' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('cip:' + k, v); } catch (e) {} }
};

let map, bays = [], C, sel = null, me = null, meLayers = null, pin = null, hl = null, firstFix = true, bounds;

fetch('data.json').then(r => r.json()).then(init).catch(() => {
  $('panel').innerHTML = '<p class="empty">Couldn\'t load the parking data. Check your connection and reload.</p>';
});

function init(D) {
  // 1. Turn the raw rows into bay objects
  bays = D.bays.map((r, i) => {
    const ll = r[10].map(a => { const o = []; for (let k = 0; k < a.length; k += 2) o.push([a[k + 1], a[k]]); if (o.length === 1) o.push([o[0][0] + 0.00001, o[0][1]]); return o; });
    const f = ll[0], mid = f[Math.floor((f.length - 1) / 2)];
    const [cx, cy] = P(mid[1], mid[0]);
    return { i, type: D.types[r[0]], comps: comps(D.types[r[0]]), timesRaw: D.times[r[1]], wins: parseTimes(D.times[r[1]]),
      stay: D.stays[r[2]], tariff: D.tariffs[r[3]], road: D.roads[r[4]], pc: r[5], zone: D.zones[r[6]],
      permits: parsePermits(D.permits[r[7]]), spaces: r[8], cash: r[9], ll, lat: mid[0], lng: mid[1], cx, cy, st: 'no' };
  });
  bounds = L.latLngBounds(bays.map(b => [b.lat, b.lng]));
  window.__updated = D.updated;

  // 2. Controls
  const zones = [...new Set(bays.flatMap(b => [...b.permits, b.zone]).filter(z => /^CA-[A-Z]$/.test(z)))].sort();
  $('zone').innerHTML = '<option value="">No Camden permit</option>' + zones.map(z => `<option value="${z}">Zone ${z}</option>`).join('');
  $('day').innerHTML += ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => `<option value="${i}">${d}</option>`).join('');
  $('roads').innerHTML = [...new Set(bays.map(b => b.road))].sort().map(r => `<option value="${r.replace(/"/g, '&quot;')}">`).join('');
  const saved = store.get('zone') !== null;
  ['zone', 'veh'].forEach(k => { const v = store.get(k); if (v !== null && [...$(k).options].some(o => o.value === v)) $(k).value = v; });
  $('badge').checked = store.get('badge') === '1';
  setSettingsOpen(!saved);

  // 3. Map with real streets underneath
  map = L.map('map', { zoomControl: false }).fitBounds(bounds);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd', maxZoom: 20
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  new ResizeObserver(() => map.invalidateSize()).observe($('map')); // keep the map sized as panels open and close
  const renderer = L.canvas({ tolerance: 12 });
  bays.forEach(b => {
    b.layer = L.polyline(b.ll, { renderer, weight: 4, lineCap: 'round', opacity: .95 }).addTo(map);
    b.layer.on('click', e => { L.DomEvent.stop(e); select(b); });
  });
  map.on('click', e => { // tapped empty map: drop a pin and list spaces near it
    sel = null; me && (me.follow = false);
    if (pin) pin.setLatLng(e.latlng); else pin = L.circleMarker(e.latlng, { radius: 7, color: '#1D4E9E', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(map);
    clearHl(); renderPanel();
  });
  map.on('moveend', () => { if (!me && !pin && !sel) renderPanel(); });
  map.on('zoomend', restyle);

  // 4. Wire up controls
  $('zone').onchange = () => { store.set('zone', $('zone').value); recompute(); };
  $('veh').onchange = () => { store.set('veh', $('veh').value); recompute(); };
  $('badge').onchange = () => { store.set('badge', $('badge').checked ? '1' : '0'); recompute(); };
  $('day').onchange = () => { $('tm').hidden = $('day').value === 'now'; recompute(); };
  $('tm').onchange = recompute;
  $('setBtn').onclick = () => setSettingsOpen($('controls').hidden);
  $('q').addEventListener('change', search);
  $('loc').onclick = () => { if (me) { me.follow = true; map.setView([me.lat, me.lng], Math.max(map.getZoom(), 17)); } else locate(); };
  setInterval(() => { if ($('day').value === 'now') recompute(); }, 60000);

  recompute();
  locate(); // ask for GPS straight away
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function setSettingsOpen(open) { $('controls').hidden = !open; $('setBtn').setAttribute('aria-expanded', open); $('setBtn').textContent = open ? 'Done' : 'Settings'; }

// --- Time and verdicts -------------------------------------------------
function londonNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return { d: DAYN.indexOf(g('weekday').slice(0, 3)), m: +g('hour') * 60 + +g('minute') };
}
function ctx() {
  let d, m;
  if ($('day').value === 'now') ({ d, m } = londonNow());
  else { d = +$('day').value; const [h, mi] = ($('tm').value || '18:00').split(':'); m = +h * 60 + +mi; }
  return { d, m, zone: $('zone').value || null, veh: $('veh').value, badge: $('badge').checked };
}
function recompute() {
  C = ctx();
  bays.forEach(b => { b.st = verdict(b, C).s; });
  restyle(); renderPanel(); summary();
}
function weight() { const z = map.getZoom(); return z >= 18 ? 9 : z >= 17 ? 7 : z >= 16 ? 5 : 3; }
function restyle() {
  const w = weight();
  bays.forEach(b => b.layer.setStyle({ color: COL[b.st], weight: w }));
  ['no', 'check', 'pay', 'yes'].forEach(s => bays.forEach(b => { if (b.st === s) b.layer.bringToFront(); })); // greens on top
  if (sel) highlight(sel);
}
function summary() {
  const z = $('zone').value ? `Zone ${$('zone').value}` : 'No permit';
  const v = { car: 'petrol or diesel', ev: 'electric', moto: 'motorbike' }[$('veh').value];
  const t = $('day').value === 'now' ? 'right now' : `${DAYN[+$('day').value]} ${$('tm').value}`;
  $('summary').textContent = `${z}, ${v}${$('badge').checked ? ', Blue Badge' : ''}, ${t}`;
}

// --- Location ----------------------------------------------------------
function locate() {
  if (!navigator.geolocation) { toast('This browser can\'t share your location. Tap the map to drop a pin instead.'); return; }
  navigator.geolocation.watchPosition(pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude, acc = pos.coords.accuracy || 30;
    const [x, y] = P(lng, lat);
    me = { lat, lng, x, y, acc, follow: me ? me.follow : true };
    if (!meLayers) meLayers = [L.circle([lat, lng], { radius: acc, color: '#3A6FC8', weight: 1, fillOpacity: .15, interactive: false }).addTo(map),
      L.circleMarker([lat, lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#3A6FC8', fillOpacity: 1, interactive: false }).addTo(map)];
    else { meLayers[0].setLatLng([lat, lng]).setRadius(acc); meLayers[1].setLatLng([lat, lng]); }
    if (firstFix) {
      firstFix = false;
      if (!bounds.pad(0.2).contains([lat, lng])) toast('You\'re outside Camden. This only covers Camden bays for now.');
      else map.setView([lat, lng], 17);
    }
    if (pin) { map.removeLayer(pin); pin = null; }
    if (!sel) renderPanel();
  }, err => {
    toast(err.code === 1 ? 'Location is switched off for this app. Allow it in your phone settings, or tap the map to drop a pin.' : 'Couldn\'t find your location. Tap the map to drop a pin instead.');
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}

// --- Search ------------------------------------------------------------
function search() {
  const q = $('q').value.trim().toLowerCase(); if (!q) return; const qp = q.replace(/\s/g, '');
  let m = bays.filter(b => b.road.toLowerCase() === q);
  if (!m.length) m = bays.filter(b => b.pc && b.pc.toLowerCase().replace(/\s/g, '').startsWith(qp));
  if (!m.length) m = bays.filter(b => b.road.toLowerCase().includes(q));
  if (!m.length) { toast(`No Camden bays found for "${$('q').value}".`); return; }
  const bb = L.latLngBounds(m.map(b => [b.lat, b.lng]));
  map.fitBounds(bb.pad(0.3), { maxZoom: 18 });
  const c = bb.getCenter();
  if (pin) pin.setLatLng(c); else pin = L.circleMarker(c, { radius: 7, color: '#1D4E9E', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(map);
  if (me) me.follow = false;
  sel = null; clearHl(); renderPanel(); $('q').blur();
  if (window.innerWidth < 900) setSettingsOpen(false);
}

// --- Selection and the panel -------------------------------------------
function clearHl() { if (hl) { map.removeLayer(hl); hl = null; } }
function highlight(b) {
  clearHl();
  hl = L.polyline(b.ll, { color: '#16202B', weight: weight() + 6, lineCap: 'round', interactive: false }).addTo(map);
  b.layer.bringToFront();
}
function select(b) { sel = b; highlight(b); renderPanel(); }

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = s => s.replace(/\b(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\b/gi, w => w[0].toUpperCase() + w.slice(1).toLowerCase()).replace(/^at any time$/i, 'At any time');
const distTxt = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km';
function refPoint() {
  if (pin) { const ll = pin.getLatLng(); const [x, y] = P(ll.lng, ll.lat); return { x, y, label: 'the pin' }; }
  if (me) return { x: me.x, y: me.y, label: 'you' };
  const c = map.getCenter(); const [x, y] = P(c.lng, c.lat); return { x, y, label: 'the map centre' };
}
function renderPanel() {
  const p = $('panel');
  const foot = `<div class="foot">Camden Council open data, updated ${esc(window.__updated)}. Doesn't include yellow lines, suspensions, bank holidays or temporary signs. The sign on the street always wins.</div>`;
  if (sel) {
    const v = verdict(sel, C), b = sel;
    const tariff = b.tariff ? b.tariff.split(/ \/ (?=(?:EV|\d+):)/).map(esc).join('<br>') : '';
    p.innerHTML = `<div class="verdict ${v.s}" style="background:${COL[v.s]}"><div class="h">${esc(v.h)}</div><div class="sub">${esc(v.sub)}</div></div>
      <dl class="facts"><dt>Street</dt><dd>${esc(b.road)}${b.pc ? ', ' + esc(b.pc) : ''}</dd>
      <dt>Bay</dt><dd>${esc(b.type[0].toUpperCase() + b.type.slice(1))}${b.spaces ? `, ${b.spaces} space${b.spaces > 1 ? 's' : ''}` : ''}</dd>
      <dt>Hours</dt><dd>${esc(cap(b.timesRaw))}</dd>
      ${b.zone ? `<dt>Zone</dt><dd>${esc(b.zone)}</dd>` : ''}
      ${b.permits.length ? `<dt>Permits</dt><dd>${esc([...new Set(b.permits)].join(', '))}</dd>` : ''}
      ${b.stay ? `<dt>Max stay</dt><dd>${esc(b.stay)}</dd>` : ''}
      ${tariff ? `<dt>Tariff</dt><dd>${tariff}</dd>` : ''}
      ${b.cash ? `<dt>Pay by phone code</dt><dd>${esc(b.cash)}</dd>` : ''}</dl>
      <div class="actions"><a class="primary" href="https://www.google.com/maps/dir/?api=1&destination=${b.lat.toFixed(6)},${b.lng.toFixed(6)}" target="_blank" rel="noopener">Get directions</a><button id="back">Back to list</button></div>${foot}`;
    $('back').onclick = () => { sel = null; clearHl(); renderPanel(); };
    return;
  }
  const r = refPoint();
  const near = bays.filter(b => b.st === 'yes' || b.st === 'pay').map(b => ({ b, d: Math.hypot(b.cx - r.x, b.cy - r.y) })).sort((a, b) => a.d - b.d);
  const seen = new Set(), rows = [];
  for (const n of near) { const v = verdict(n.b, C); const k = n.b.road + v.h; if (seen.has(k)) continue; seen.add(k); rows.push({ ...n, v }); if (rows.length >= 10) break; }
  const whenTxt = $('day').value === 'now' ? 'now' : 'at that time';
  p.innerHTML = `<h2>Where you can park ${whenTxt}, nearest ${r.label}</h2>` +
    (rows.length ? `<ul class="list">${rows.map(n => `<li><button data-i="${n.b.i}"><span class="bar" style="background:${COL[n.v.s]}"></span><span><span class="l1">${esc(n.b.road)}</span><br><span class="l2">${esc(n.v.h)}. ${esc(n.v.sub)}</span></span><span class="dist">${distTxt(n.d)}</span></button></li>`).join('')}</ul>`
      : `<p class="empty">No bays you can use ${whenTxt}. Try another time or permit.</p>`) + foot;
  p.querySelectorAll('.list button').forEach(el => el.onclick = () => {
    const b = bays[+el.dataset.i]; if (me) me.follow = false;
    map.setView([b.lat, b.lng], Math.max(map.getZoom(), 17)); select(b);
  });
}
function toast(t) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(el._t); el._t = setTimeout(() => el.style.display = 'none', 5000); }
})();
