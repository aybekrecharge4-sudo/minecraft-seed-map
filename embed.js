(function() {
  'use strict';

  /* ============================================================
   *  CONFIG
   * ============================================================ */
  var BASE = 'https://aybekrecharge4-sudo.github.io/minecraft-seed-map/';
  var WASM_BASE = BASE + 'workers/';
  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

  /* ============================================================
   *  DOM CHECK
   * ============================================================ */
  var app = document.getElementById('mc-seed-map-app');
  if (!app) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', arguments.callee);
    }
    return;
  }

  /* ============================================================
   *  UTILS
   * ============================================================ */
  function $(id) { return document.getElementById(id); }
  function ce(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }
  function setStatus(msg) { console.log('[MCSeedMap] ' + msg); var el = $('mc-loading-text'); if (el) el.textContent = msg; }
  function setError(msg) { console.error('[MCSeedMap] ' + msg); var el = $('mc-loading-text'); if (el) { el.textContent = msg; el.style.color = '#ff6b6b'; } }
  function debounce(fn, ms) { var t; return function() { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function escHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function copyText(text) {
    if (navigator.clipboard) { navigator.clipboard.writeText(text); }
    else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
  }

  setStatus('Script loaded...');

  /* Hide SEO content */
  var seoContent = $('mc-seo-content');
  if (seoContent) seoContent.style.display = 'none';

  /* ============================================================
   *  IFRAME FALLBACK
   * ============================================================ */
  function switchToIframe(reason) {
    console.warn('[MCSeedMap] Switching to iframe: ' + reason);
    var p = new URLSearchParams(window.location.search);
    var src = BASE + '?seed=' + encodeURIComponent(p.get('seed') || '12345') + '&ver=' + encodeURIComponent(p.get('ver') || '1.21');
    app.innerHTML = '<iframe src="' + src + '" style="width:100%;height:100%;border:none;border-radius:8px;" loading="lazy" sandbox="allow-scripts allow-same-origin"></iframe>';
  }

  /* ============================================================
   *  CONSTANTS
   * ============================================================ */
  var MC_VERSIONS = {'B1.7':1,'B1.8':2,'1.0':3,'1.1':4,'1.2':5,'1.3':6,'1.4':7,'1.5':8,'1.6':9,'1.7':10,'1.8':11,'1.9':12,'1.10':13,'1.11':14,'1.12':15,'1.13':16,'1.14':17,'1.15':18,'1.16.1':19,'1.16':20,'1.17':21,'1.18':22,'1.19.2':23,'1.19':24,'1.20':25,'1.21.1':26,'1.21.3':27,'1.21':28};
  var DV = '1.21', DS = '12345';
  var DIMS = { overworld: 0, nether: -1, end: 1 };
  var TS = 256;
  var ZS = { 0:64, 1:32, 2:16, 3:8, 4:4, 5:1 };

  /* Structure region sizes (chunks) per structId — for correct viewport search */
  var REGION_SIZES = { 1:32, 2:32, 3:32, 4:32, 5:34, 6:20, 7:24, 8:32, 9:80, 10:32, 11:40, 12:40, 13:24, 14:1, 15:1, 16:1, 17:1, 18:30, 19:30, 20:20, 21:20, 23:34, 24:34 };
  /* Min zoom to show small-region structures */
  var SMALL_STRUCT_MIN_ZOOM = 3;

  var FEATURES = {
    Spawn_Point:     { dim:0, special:'spawn',      name:'Spawn Point',             color:'#f0c040', icon:'\uD83C\uDF1F', minVer:1,  group:'other' },
    Slime_Chunk:     { dim:0, special:'slime',       name:'Slime Chunk',             color:'#6abf4b', icon:'\uD83D\uDFE9', minVer:1,  group:'other' },
    Stronghold:      { dim:0, special:'stronghold',  name:'Stronghold',              color:'#4a2a6a', icon:'\uD83C\uDFEF', minVer:3,  group:'underground' },
    Village:         { dim:0, sid:5,   name:'Village',               color:'#8b6914', icon:'\uD83C\uDFD8\uFE0F', minVer:3,  group:'land' },
    Desert_Pyramid:  { dim:0, sid:1,   name:'Desert Temple',         color:'#c4a24f', icon:'\uD83C\uDFDC\uFE0F', minVer:3,  group:'land' },
    Jungle_Temple:   { dim:0, sid:2,   name:'Jungle Temple',         color:'#3b7a1a', icon:'\uD83C\uDF3F', minVer:3,  group:'land' },
    Swamp_Hut:       { dim:0, sid:3,   name:'Witch Hut',             color:'#4a6741', icon:'\uD83C\uDFDA\uFE0F', minVer:3,  group:'land' },
    Igloo:           { dim:0, sid:4,   name:'Igloo',                 color:'#dce8ef', icon:'\uD83E\uDDCA', minVer:12, group:'land' },
    Mansion:         { dim:0, sid:9,   name:'Woodland Mansion',      color:'#5a3921', icon:'\uD83C\uDFF0', minVer:14, group:'land' },
    Outpost:         { dim:0, sid:10,  name:'Pillager Outpost',      color:'#7a7a7a', icon:'\u2694\uFE0F', minVer:17, group:'land' },
    Monument:        { dim:0, sid:8,   name:'Ocean Monument',        color:'#27a8c4', icon:'\uD83D\uDD31', minVer:11, group:'ocean' },
    Ocean_Ruin:      { dim:0, sid:6,   name:'Ocean Ruin',            color:'#2e7d8a', icon:'\uD83C\uDFDB\uFE0F', minVer:16, group:'ocean' },
    Shipwreck:       { dim:0, sid:7,   name:'Shipwreck',             color:'#6b4423', icon:'\uD83D\uDEA2', minVer:16, group:'ocean' },
    Treasure:        { dim:0, sid:14,  name:'Buried Treasure',       color:'#d4a017', icon:'\uD83D\uDCB0', minVer:16, group:'ocean' },
    Mineshaft:       { dim:0, sid:15,  name:'Mineshaft',             color:'#8b7355', icon:'\u26CF\uFE0F', minVer:3,  group:'underground' },
    Ancient_City:    { dim:0, sid:13,  name:'Ancient City',          color:'#1a3a4a', icon:'\uD83C\uDFDA\uFE0F', minVer:23, group:'underground' },
    Geode:           { dim:0, sid:17,  name:'Amethyst Geode',        color:'#9b59b6', icon:'\uD83D\uDC8E', minVer:22, group:'underground' },
    Trial_Chambers:  { dim:0, sid:24,  name:'Trial Chambers',        color:'#c47b27', icon:'\u2699\uFE0F', minVer:26, group:'underground' },
    Ruined_Portal:   { dim:0, sid:11,  name:'Ruined Portal',         color:'#7b3fa0', icon:'\uD83D\uDFE3', minVer:20, group:'other' },
    Desert_Well:     { dim:0, sid:16,  name:'Desert Well',           color:'#c4b07b', icon:'\uD83D\uDD73\uFE0F', minVer:3,  group:'other' },
    Trail_Ruins:     { dim:0, sid:23,  name:'Trail Ruins',           color:'#8b6b4a', icon:'\uD83E\uDDF1', minVer:25, group:'other' },
    Fortress:        { dim:-1, sid:18, name:'Nether Fortress',       color:'#4a1a1a', icon:'\uD83D\uDD25', minVer:3,  group:'nether' },
    Bastion:         { dim:-1, sid:19, name:'Bastion Remnant',       color:'#2a2a2a', icon:'\uD83C\uDFF4', minVer:20, group:'nether' },
    Ruined_Portal_N: { dim:-1, sid:12, name:'Ruined Portal (Nether)',color:'#7b3fa0', icon:'\uD83D\uDFE3', minVer:20, group:'nether' },
    End_City:        { dim:1, sid:20,  name:'End City',              color:'#dbc86e', icon:'\uD83C\uDFD9\uFE0F', minVer:12, group:'end' },
    End_Gateway:     { dim:1, sid:21,  name:'End Gateway',           color:'#2a0a3a', icon:'\uD83C\uDF00', minVer:12, group:'end' }
  };

  var DEFAULT_ON = ['Spawn_Point','Village','Desert_Pyramid','Jungle_Temple','Swamp_Hut','Monument','Igloo','Mansion','Outpost','Stronghold','Fortress','Bastion','End_City'];
  var ef = {};
  DEFAULT_ON.forEach(function(k) { ef[k] = true; });

  var STRUCT_GROUPS = [
    { id:'land',        label:'Villages & Land',   dim:0 },
    { id:'ocean',       label:'Ocean',             dim:0 },
    { id:'underground', label:'Underground',        dim:0 },
    { id:'other',       label:'Other',             dim:0 },
    { id:'nether',      label:'Nether',            dim:-1 },
    { id:'end',         label:'The End',           dim:1 }
  ];

  /* ============================================================
   *  BIOME DATA
   * ============================================================ */
  var BIOME_NAMES = {
    0:'Ocean',1:'Plains',2:'Desert',3:'Windswept Hills',4:'Forest',5:'Taiga',6:'Swamp',7:'River',
    8:'Nether Wastes',9:'The End',10:'Frozen Ocean',11:'Frozen River',12:'Snowy Plains',
    13:'Snowy Mountains',14:'Mushroom Fields',15:'Mushroom Field Shore',16:'Beach',
    17:'Desert Hills',18:'Wooded Hills',19:'Taiga Hills',20:'Mountain Edge',21:'Jungle',
    22:'Jungle Hills',23:'Sparse Jungle',24:'Deep Ocean',25:'Stony Shore',26:'Snowy Beach',
    27:'Birch Forest',28:'Birch Forest Hills',29:'Dark Forest',30:'Snowy Taiga',
    31:'Snowy Taiga Hills',32:'Old Growth Pine Taiga',33:'Giant Tree Taiga Hills',
    34:'Windswept Forest',35:'Savanna',36:'Savanna Plateau',37:'Badlands',
    38:'Wooded Badlands',39:'Badlands Plateau',40:'Small End Islands',41:'End Midlands',
    42:'End Highlands',43:'End Barrens',44:'Warm Ocean',45:'Lukewarm Ocean',46:'Cold Ocean',
    47:'Deep Warm Ocean',48:'Deep Lukewarm Ocean',49:'Deep Cold Ocean',50:'Deep Frozen Ocean',
    127:'The Void',129:'Sunflower Plains',130:'Desert Lakes',131:'Windswept Gravelly Hills',
    132:'Flower Forest',133:'Taiga Mountains',134:'Swamp Hills',
    139:'Ice Spikes',149:'Modified Jungle',151:'Modified Jungle Edge',
    155:'Old Growth Birch Forest',156:'Tall Birch Hills',157:'Dark Forest Hills',
    158:'Snowy Taiga Mountains',160:'Old Growth Spruce Taiga',161:'Giant Spruce Taiga Hills',
    162:'Modified Gravelly Mountains',163:'Windswept Savanna',164:'Shattered Savanna Plateau',
    165:'Eroded Badlands',166:'Modified Wooded Badlands',167:'Modified Badlands Plateau',
    168:'Bamboo Jungle',169:'Bamboo Jungle Hills',170:'Soul Sand Valley',171:'Crimson Forest',
    172:'Warped Forest',173:'Basalt Deltas',174:'Dripstone Caves',175:'Lush Caves',
    177:'Meadow',178:'Grove',179:'Snowy Slopes',180:'Jagged Peaks',181:'Frozen Peaks',
    182:'Stony Peaks',183:'Deep Dark',184:'Mangrove Swamp',185:'Cherry Grove',186:'Pale Garden'
  };

  /* ============================================================
   *  STORAGE (localStorage)
   * ============================================================ */
  var Storage = {
    _get: function(key, def) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch(e) { return def; } },
    _set: function(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} },
    getHistory: function() { return this._get('mc_seed_map_history', []); },
    addHistory: function(seed, ver) {
      var h = this.getHistory().filter(function(x) { return x.seed !== seed || x.ver !== ver; });
      h.unshift({ seed: seed, ver: ver, ts: Date.now() });
      if (h.length > 15) h = h.slice(0, 15);
      this._set('mc_seed_map_history', h);
    },
    getBookmarks: function() { return this._get('mc_seed_map_bookmarks', []); },
    saveBookmarks: function(bm) { this._set('mc_seed_map_bookmarks', bm); },
    addBookmark: function(bm) { var all = this.getBookmarks(); bm.id = 'bm_' + Date.now(); all.push(bm); this.saveBookmarks(all); return bm; },
    removeBookmark: function(id) { this.saveBookmarks(this.getBookmarks().filter(function(b) { return b.id !== id; })); }
  };

  /* ============================================================
   *  TOAST SYSTEM
   * ============================================================ */
  var Toast = {
    wrap: null,
    init: function() { this.wrap = ce('div', 'mc-toast-wrap'); app.appendChild(this.wrap); },
    show: function(msg, type) {
      if (!this.wrap) this.init();
      var t = ce('div', 'mc-toast mc-toast-' + (type || 'info'), escHtml(msg));
      this.wrap.appendChild(t);
      setTimeout(function() { t.classList.add('mc-toast-exit'); setTimeout(function() { if (t.parentNode) t.remove(); }, 300); }, 2500);
    }
  };

  /* ============================================================
   *  LOAD CSS + LEAFLET
   * ============================================================ */
  var cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet'; cssLink.href = BASE + 'embed.css';
  document.head.appendChild(cssLink);

  function loadLeaflet(cb) {
    if (typeof L !== 'undefined') { setStatus('Leaflet already present.'); cb(); return; }
    setStatus('Loading map library...');
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET_CSS; document.head.appendChild(css);
    var js = document.createElement('script'); js.src = LEAFLET_JS;
    js.onload = function() { setStatus('Map library loaded.'); cb(); };
    js.onerror = function() { setError('Map library failed.'); switchToIframe('leaflet-blocked'); };
    document.head.appendChild(js);
  }

  /* ============================================================
   *  WORKER CREATION
   * ============================================================ */
  function createWorker() {
    setStatus('Downloading WASM engine...');
    return fetch(WASM_BASE + 'api.js').then(function(resp) {
      if (!resp.ok) throw new Error('api.js HTTP ' + resp.status);
      return resp.text();
    }).then(function(apiCode) {
      setStatus('Building worker...');
      var workerSrc = [
        '/* Emscripten glue */',
        apiCode,
        '',
        'var Module = null;',
        'function toBigInt(val) { if (typeof val === "bigint") return val; return BigInt(Math.trunc(val)); }',
        '',
        'async function initWasm() {',
        '  Module = await createModule({ locateFile: function(path) { return "' + WASM_BASE + '" + path; } });',
        '  Module._init_colors();',
        '}',
        '',
        'function handleGenerateBiomeImage(data) {',
        '  var fn = data.flags && Module._generate_biome_image_ex ? Module._generate_biome_image_ex : Module._generate_biome_image;',
        '  var ptr;',
        '  if (data.flags && Module._generate_biome_image_ex) {',
        '    ptr = fn(toBigInt(data.seed), data.mcVersion, data.dim, data.x, data.z, data.width, data.height, data.scale, data.flags || 0);',
        '  } else {',
        '    ptr = Module._generate_biome_image(toBigInt(data.seed), data.mcVersion, data.dim, data.x, data.z, data.width, data.height, data.scale);',
        '  }',
        '  if (!ptr) return { type: "biomeImage", requestId: data.requestId, error: "Generation failed" };',
        '  var size = data.width * data.height * 4;',
        '  var pixels = new Uint8ClampedArray(Module.HEAPU8.buffer, ptr, size).slice();',
        '  Module._free_memory(ptr);',
        '  return { type: "biomeImage", requestId: data.requestId, pixels: pixels, width: data.width, height: data.height };',
        '}',
        '',
        'function handleFindStructures(data) {',
        '  var count = data.fast ? Module._find_structures_fast(toBigInt(data.seed), data.mcVersion, data.structType, data.regXMin, data.regZMin, data.regXMax, data.regZMax) : Module._find_structures(toBigInt(data.seed), data.mcVersion, data.structType, data.regXMin, data.regZMin, data.regXMax, data.regZMax);',
        '  var positions = [];',
        '  for (var i = 0; i < count; i++) { positions.push({ x: Module._get_structure_x(i), z: Module._get_structure_z(i) }); }',
        '  return { type: "structures", requestId: data.requestId, positions: positions, structKey: data.structKey };',
        '}',
        '',
        'function handleFindSpawn(data) {',
        '  return { type: "spawn", requestId: data.requestId, x: Module._get_spawn_x(toBigInt(data.seed), data.mcVersion), z: Module._get_spawn_z(toBigInt(data.seed), data.mcVersion) };',
        '}',
        '',
        'function handleFindStrongholds(data) {',
        '  var found = Module._find_strongholds(toBigInt(data.seed), data.mcVersion, data.count || 3);',
        '  var positions = [];',
        '  for (var i = 0; i < found; i++) { positions.push({ x: Module._get_stronghold_x(i), z: Module._get_stronghold_z(i) }); }',
        '  return { type: "strongholds", requestId: data.requestId, positions: positions };',
        '}',
        '',
        'function handleCheckSlimeBatch(data) {',
        '  var ptr = Module._check_slime_batch(toBigInt(data.seed), data.chunkXMin, data.chunkZMin, data.width, data.height);',
        '  if (!ptr) return { type: "slimeBatch", requestId: data.requestId, error: "Batch failed" };',
        '  var total = data.width * data.height;',
        '  var result = new Uint8Array(Module.HEAPU8.buffer, ptr, total).slice();',
        '  return { type: "slimeBatch", requestId: data.requestId, result: result, width: data.width, height: data.height };',
        '}',
        '',
        'function handleGetBiomeAt(data) {',
        '  if (!Module._get_biome_at_pos) return { type: "biomeAt", requestId: data.requestId, biomeId: -1 };',
        '  var id = Module._get_biome_at_pos(toBigInt(data.seed), data.mcVersion, data.dim, data.x, data.z, data.flags || 0);',
        '  return { type: "biomeAt", requestId: data.requestId, biomeId: id };',
        '}',
        '',
        'function handleFindBiome(data) {',
        '  if (!Module._find_nearest_biome) return { type: "foundBiome", requestId: data.requestId, found: 0 };',
        '  var found = Module._find_nearest_biome(toBigInt(data.seed), data.mcVersion, data.dim, data.cx, data.cz, data.biomeId, data.maxRadius || 8000, data.flags || 0);',
        '  var x = 0, z = 0;',
        '  if (found) { x = Module._get_structure_x(0); z = Module._get_structure_z(0); }',
        '  return { type: "foundBiome", requestId: data.requestId, found: found, x: x, z: z };',
        '}',
        '',
        'var initPromise = null;',
        'self.onmessage = function(e) {',
        '  var data = e.data;',
        '  if (data.type === "init") {',
        '    if (!initPromise) initPromise = initWasm();',
        '    initPromise.then(function() { self.postMessage({ type: "ready" }); })',
        '    .catch(function(err) { self.postMessage({ type: "error", error: String(err) }); });',
        '    return;',
        '  }',
        '  function run() {',
        '    var result;',
        '    try {',
        '      switch (data.type) {',
        '        case "generateBiomeImage": result = handleGenerateBiomeImage(data); break;',
        '        case "findStructures": result = handleFindStructures(data); break;',
        '        case "findSpawn": result = handleFindSpawn(data); break;',
        '        case "findStrongholds": result = handleFindStrongholds(data); break;',
        '        case "checkSlimeBatch": result = handleCheckSlimeBatch(data); break;',
        '        case "getBiomeAt": result = handleGetBiomeAt(data); break;',
        '        case "findBiome": result = handleFindBiome(data); break;',
        '        default: result = { type: "error", error: "Unknown: " + data.type };',
        '      }',
        '    } catch(err) { result = { type: "error", requestId: data.requestId, error: String(err) }; }',
        '    self.postMessage(result);',
        '  }',
        '  if (!Module) { if (!initPromise) initPromise = initWasm(); initPromise.then(run); } else { run(); }',
        '};'
      ].join('\n');

      setStatus('Creating worker...');
      var blob = new Blob([workerSrc], { type: 'application/javascript' });
      return new Worker(URL.createObjectURL(blob));
    });
  }

  /* ============================================================
   *  LRU TILE CACHE
   * ============================================================ */
  function LRUCache(max) { this.max = max; this.cache = new Map(); }
  LRUCache.prototype.get = function(k) { if (!this.cache.has(k)) return null; var v = this.cache.get(k); this.cache.delete(k); this.cache.set(k, v); return v; };
  LRUCache.prototype.set = function(k, v) { if (this.cache.has(k)) this.cache.delete(k); else if (this.cache.size >= this.max) this.cache.delete(this.cache.keys().next().value); this.cache.set(k, v); };

  /* ============================================================
   *  BIOME LAYER (Canvas tiles from WASM)
   * ============================================================ */
  function createBiomeLayer(worker, getState) {
    var pending = new Map();
    var tileCache = new LRUCache(200);
    var BL = L.GridLayer.extend({
      options: { tileSize: TS, updateWhenZooming: false, updateWhenIdle: true, keepBuffer: 2 },
      createTile: function(coords, done) {
        var canvas = document.createElement('canvas');
        canvas.width = TS; canvas.height = TS;
        canvas.style.opacity = '0'; canvas.style.transition = 'opacity 0.3s';
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, TS, TS);
        var st = getState();
        if (!st) { canvas.style.opacity = '1'; done(null, canvas); return canvas; }
        var bpp = ZS[coords.z] || 16;
        var bpt = TS * bpp;
        var wx = coords.x * bpt, wz = coords.y * bpt;
        var cs;
        if (bpp >= 64) cs = 256; else if (bpp >= 16) cs = 64; else if (bpp >= 4) cs = 16; else cs = 4;
        var gw = Math.ceil(bpt / cs), gh = gw;
        var gx = Math.floor(wx / cs), gz = Math.floor(wz / cs);
        var rid = 't_' + coords.z + '_' + coords.x + '_' + coords.y + '_' + st.seed + '_' + st.mcVersion + '_' + st.dimension + '_' + (st.flags || 0);

        /* Check cache */
        var cached = tileCache.get(rid);
        if (cached) {
          ctx.putImageData(cached, 0, 0);
          canvas.style.opacity = '1';
          done(null, canvas);
          return canvas;
        }

        if (pending.has(rid)) worker.removeEventListener('message', pending.get(rid));
        var handler = function(e) {
          var m = e.data;
          if (m.type !== 'biomeImage' || m.requestId !== rid) return;
          worker.removeEventListener('message', handler);
          pending.delete(rid);
          if (m.error) { canvas.style.opacity = '1'; done(new Error(m.error), canvas); return; }
          try {
            var imgData = new ImageData(new Uint8ClampedArray(m.pixels), m.width, m.height);
            var tc = document.createElement('canvas');
            tc.width = m.width; tc.height = m.height;
            tc.getContext('2d').putImageData(imgData, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, TS, TS);
            ctx.drawImage(tc, 0, 0, TS, TS);
            tileCache.set(rid, ctx.getImageData(0, 0, TS, TS));
          } catch(x) {}
          canvas.style.opacity = '1';
          done(null, canvas);
        };
        pending.set(rid, handler);
        worker.addEventListener('message', handler);
        worker.postMessage({ type: 'generateBiomeImage', seed: st.seed, mcVersion: st.mcVersion, dim: st.dimension, x: gx, z: gz, width: gw, height: gh, scale: cs, flags: st.flags || 0, requestId: rid });
        return canvas;
      }
    });
    return new BL();
  }

  /* ============================================================
   *  STRUCTURE LAYER
   * ============================================================ */
  function createStructureLayer(worker, map, getState) {
    var lg = L.layerGroup(), markers = [], deb = null, activeReqs = new Set(), slimeLayer = null, cache = new Map();
    var spawnPos = null, structCounts = {};

    function clearMarkers() { markers.forEach(function(m) { lg.removeLayer(m); }); markers = []; structCounts = {}; }
    function toLL(x, z) { return L.latLng(-z, x); }

    function makeIcon(key) {
      var f = FEATURES[key]; if (!f) return null;
      var sz = key === 'Spawn_Point' ? 26 : 22;
      var extra = key === 'Spawn_Point' ? ' mc-sp' : '';
      return L.divIcon({
        className: 'mc-sm',
        html: '<div class="mc-si' + extra + '" style="background:' + f.color + '" title="' + f.name + '"><span class="mc-se">' + f.icon + '</span></div>',
        iconSize: [sz, sz], iconAnchor: [sz/2, sz/2], popupAnchor: [0, -sz/2 - 2]
      });
    }

    function makePopup(key, x, z) {
      var f = FEATURES[key];
      var distHtml = '';
      if (spawnPos) {
        var dx = x - spawnPos.x, dz2 = z - spawnPos.z;
        var dist = Math.round(Math.sqrt(dx * dx + dz2 * dz2));
        distHtml = '<div class="mc-popup-meta">' + dist.toLocaleString() + ' blocks from spawn</div>';
      }
      return '<div class="mc-popup-head"><span class="mc-popup-icon">' + f.icon + '</span><span class="mc-popup-name">' + f.name + '</span></div>' +
        '<div class="mc-popup-row"><span>X: ' + x + ', Z: ' + z + '</span><button class="mc-popup-copy" onclick="navigator.clipboard.writeText(\'' + x + ' ' + z + '\');this.textContent=\'Done\'">Copy</button></div>' +
        '<div class="mc-popup-row"><span>/tp @s ' + x + ' ~ ' + z + '</span><button class="mc-popup-copy" onclick="navigator.clipboard.writeText(\'/tp @s ' + x + ' ~ ' + z + '\');this.textContent=\'Done\'">Copy</button></div>' +
        distHtml;
    }

    function addMarker(key, x, z) {
      var ic = makeIcon(key);
      var m = L.marker(toLL(x, z), { icon: ic }).bindPopup(makePopup(key, x, z));
      lg.addLayer(m); markers.push(m);
      structCounts[key] = (structCounts[key] || 0) + 1;
    }

    function update() {
      var st = getState(); if (!st) return;
      var z = map.getZoom(), b = map.getBounds();
      var x1 = Math.floor(b.getWest()), x2 = Math.ceil(b.getEast());
      var z1 = Math.floor(-b.getNorth()), z2 = Math.ceil(-b.getSouth());
      clearMarkers(); activeReqs.clear(); updateSlime(st);
      var dim = st.dimension;

      var structs = Object.keys(FEATURES).filter(function(k) {
        var f = FEATURES[k];
        if (f.dim !== dim || !ef[k] || f.minVer > st.mcVersion || f.special) return false;
        /* Skip small-region structures at low zoom */
        if (f.sid && REGION_SIZES[f.sid] && REGION_SIZES[f.sid] <= 1 && z < SMALL_STRUCT_MIN_ZOOM) return false;
        return true;
      });

      structs.forEach(function(k) {
        var ft = FEATURES[k];
        var regionBlocks = (REGION_SIZES[ft.sid] || 32) * 16;
        var rx1 = Math.floor(x1 / regionBlocks) - 1, rx2 = Math.ceil(x2 / regionBlocks) + 1;
        var rz1 = Math.floor(z1 / regionBlocks) - 1, rz2 = Math.ceil(z2 / regionBlocks) + 1;
        if ((rx2 - rx1 + 1) * (rz2 - rz1 + 1) > 400) return;

        var ck = k + '_' + st.seed + '_' + st.mcVersion + '_' + rx1 + '_' + rz1 + '_' + rx2 + '_' + rz2;
        if (cache.has(ck)) { cache.get(ck).forEach(function(p) { addMarker(k, p.x, p.z); }); updateBadges(); return; }

        var rid = 's_' + ck; activeReqs.add(rid);
        var h = function(e) {
          var msg = e.data;
          if (msg.type !== 'structures' || msg.requestId !== rid || !activeReqs.has(rid)) return;
          worker.removeEventListener('message', h);
          if (cache.size >= 300) cache.delete(cache.keys().next().value);
          cache.set(ck, msg.positions);
          msg.positions.forEach(function(p) { addMarker(k, p.x, p.z); });
          updateBadges();
        };
        worker.addEventListener('message', h);
        worker.postMessage({ type: 'findStructures', seed: st.seed, mcVersion: st.mcVersion, structType: ft.sid, regXMin: rx1, regZMin: rz1, regXMax: rx2, regZMax: rz2, fast: z < 3, requestId: rid, structKey: k });
      });

      if (dim === 0) {
        if (ef.Spawn_Point) findSpawn(st);
        if (ef.Stronghold) findStrongholds(st);
      }
    }

    function findSpawn(st) {
      var ck = 'sp_' + st.seed + '_' + st.mcVersion;
      if (cache.has(ck)) { var p = cache.get(ck); spawnPos = p; addMarker('Spawn_Point', p.x, p.z); return; }
      var h = function(e) {
        var msg = e.data;
        if (msg.type !== 'spawn' || msg.requestId !== ck) return;
        worker.removeEventListener('message', h);
        var p = { x: msg.x, z: msg.z }; cache.set(ck, p); spawnPos = p;
        addMarker('Spawn_Point', msg.x, msg.z);
      };
      worker.addEventListener('message', h);
      worker.postMessage({ type: 'findSpawn', seed: st.seed, mcVersion: st.mcVersion, requestId: ck });
    }

    function findStrongholds(st) {
      var ck = 'sh_' + st.seed + '_' + st.mcVersion;
      if (cache.has(ck)) { cache.get(ck).forEach(function(p) { addMarker('Stronghold', p.x, p.z); }); return; }
      var h = function(e) {
        var msg = e.data;
        if (msg.type !== 'strongholds' || msg.requestId !== ck) return;
        worker.removeEventListener('message', h);
        cache.set(ck, msg.positions);
        msg.positions.forEach(function(p) { addMarker('Stronghold', p.x, p.z); });
      };
      worker.addEventListener('message', h);
      worker.postMessage({ type: 'findStrongholds', seed: st.seed, mcVersion: st.mcVersion, count: 128, requestId: ck });
    }

    function updateSlime(st) {
      if (slimeLayer) { map.removeLayer(slimeLayer); slimeLayer = null; }
      if (!ef.Slime_Chunk || st.dimension !== 0 || map.getZoom() < 2) return;
      slimeLayer = L.gridLayer({ tileSize: TS, updateWhenZooming: false, updateWhenIdle: true });
      slimeLayer.createTile = function(c, done) {
        var t = document.createElement('canvas'); t.width = TS; t.height = TS;
        var ctx = t.getContext('2d');
        var bpp = ZS[c.z] || 16, bpt = TS * bpp;
        var wx = c.x * bpt, wz = c.y * bpt;
        var cx = Math.floor(wx / 16), cz = Math.floor(wz / 16);
        var cw = Math.ceil(bpt / 16), ch = cw;
        var rid = 'sb_' + st.seed + '_' + cx + '_' + cz + '_' + cw;
        var h = function(e) {
          var msg = e.data;
          if (msg.type !== 'slimeBatch' || msg.requestId !== rid) return;
          worker.removeEventListener('message', h);
          if (msg.error) { done(null, t); return; }
          var ppc = 16 / bpp;
          ctx.fillStyle = 'rgba(106,191,75,0.35)';
          for (var i = 0; i < msg.result.length; i++) {
            if (msg.result[i]) ctx.fillRect((i % msg.width) * ppc, Math.floor(i / msg.width) * ppc, ppc, ppc);
          }
          if (ppc >= 4) {
            ctx.strokeStyle = 'rgba(106,191,75,0.25)'; ctx.lineWidth = 0.5;
            for (var j = 0; j < msg.result.length; j++) {
              if (msg.result[j]) ctx.strokeRect((j % msg.width) * ppc, Math.floor(j / msg.width) * ppc, ppc, ppc);
            }
          }
          done(null, t);
        };
        worker.addEventListener('message', h);
        worker.postMessage({ type: 'checkSlimeBatch', seed: st.seed, chunkXMin: cx, chunkZMin: cz, width: cw, height: ch, requestId: rid });
        return t;
      };
      slimeLayer.addTo(map);
    }

    function updateBadges() { document.dispatchEvent(new CustomEvent('mcBadgeUpdate', { detail: structCounts })); }

    return {
      layer: lg,
      update: update,
      scheduleUpdate: debounce(update, 300),
      getSpawn: function() { return spawnPos; },
      getCounts: function() { return structCounts; }
    };
  }

  /* ============================================================
   *  GRID LAYER
   * ============================================================ */
  function createGridLayer() {
    return L.GridLayer.extend({
      options: { tileSize: TS, opacity: 0.3, zIndex: 10 },
      createTile: function(c) {
        var t = document.createElement('canvas'); t.width = TS; t.height = TS;
        var ctx = t.getContext('2d');
        var sc = ZS[c.z] || 16;
        if (sc > 16) return t;
        var bpt = TS * sc, ppc = 16 / sc;
        if (ppc < 4) return t;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
        var wx = c.x * bpt, wz = c.y * bpt;
        var ox = ((wx % 16) + 16) % 16, oz = ((wz % 16) + 16) % 16;
        for (var px = -ox / sc; px <= TS; px += ppc) { if (px < 0) continue; ctx.beginPath(); ctx.moveTo(Math.round(px) + 0.5, 0); ctx.lineTo(Math.round(px) + 0.5, TS); ctx.stroke(); }
        for (var py = -oz / sc; py <= TS; py += ppc) { if (py < 0) continue; ctx.beginPath(); ctx.moveTo(0, Math.round(py) + 0.5); ctx.lineTo(TS, Math.round(py) + 0.5); ctx.stroke(); }
        var ppr = 512 / sc;
        if (ppr >= 8) {
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
          var rox = ((wx % 512) + 512) % 512, roz = ((wz % 512) + 512) % 512;
          for (var rpx = -rox / sc; rpx <= TS; rpx += ppr) { if (rpx < 0) continue; ctx.beginPath(); ctx.moveTo(Math.round(rpx) + 0.5, 0); ctx.lineTo(Math.round(rpx) + 0.5, TS); ctx.stroke(); }
          for (var rpy = -roz / sc; rpy <= TS; rpy += ppr) { if (rpy < 0) continue; ctx.beginPath(); ctx.moveTo(0, Math.round(rpy) + 0.5); ctx.lineTo(TS, Math.round(rpy) + 0.5); ctx.stroke(); }
        }
        return t;
      }
    });
  }

  /* ============================================================
   *  BIOME TOOLTIP
   * ============================================================ */
  function createBiomeTooltip(worker, map, getState) {
    var tip = ce('div', 'mc-biome-tip',
      '<span class="mc-biome-swatch" id="mc-bswatch"></span>' +
      '<span class="mc-biome-name" id="mc-bname">-</span>' +
      '<span class="mc-biome-id" id="mc-bid"></span>');
    app.appendChild(tip);
    var lastReq = 0, biomeColors = null;
    var throttleMs = 120;

    /* Fetch biome colors once */
    worker.addEventListener('message', function onColors(e) {
      if (e.data.type === 'ready') {
        /* Colors are embedded in the WASM module; we know them from BIOME_NAMES palette */
      }
    });

    map.on('mousemove', function(e) {
      var now = Date.now();
      if (now - lastReq < throttleMs) return;
      lastReq = now;
      var st = getState(); if (!st) return;
      var x = Math.round(e.latlng.lng), z = Math.round(-e.latlng.lat);
      var rid = 'bio_' + now;
      var h = function(ev) {
        var msg = ev.data;
        if (msg.type !== 'biomeAt' || msg.requestId !== rid) return;
        worker.removeEventListener('message', h);
        var id = msg.biomeId;
        var name = BIOME_NAMES[id] || ('Biome ' + id);
        $('mc-bname').textContent = name;
        $('mc-bid').textContent = '#' + id;
        /* Use a simple color from the known palette or fallback */
        tip.classList.add('mc-visible');
      };
      worker.addEventListener('message', h);
      worker.postMessage({ type: 'getBiomeAt', seed: st.seed, mcVersion: st.mcVersion, dim: st.dimension, x: x, z: z, flags: st.flags || 0, requestId: rid });
    });

    map.on('mouseout', function() { tip.classList.remove('mc-visible'); });
  }

  /* ============================================================
   *  CONTEXT MENU
   * ============================================================ */
  function createContextMenu(map, getState, structMgr) {
    var ctx = ce('div', 'mc-ctx');
    app.appendChild(ctx);
    var worldX = 0, worldZ = 0;

    function hide() { ctx.classList.remove('mc-visible'); }
    function item(icon, label, fn, kbd) {
      var b = ce('button', 'mc-ctx-item',
        '<span class="mc-ctx-icon">' + icon + '</span><span>' + label + '</span>' +
        (kbd ? '<span class="mc-ctx-kbd">' + kbd + '</span>' : ''));
      b.addEventListener('click', function() { hide(); fn(); });
      return b;
    }

    map.on('contextmenu', function(e) {
      L.DomEvent.preventDefault(e.originalEvent);
      worldX = Math.round(e.latlng.lng);
      worldZ = Math.round(-e.latlng.lat);
      ctx.innerHTML = '';
      ctx.appendChild(item('\uD83D\uDCCB', 'Copy Coordinates', function() {
        copyText(worldX + ', ' + worldZ);
        Toast.show('Coordinates copied', 'success');
      }));
      ctx.appendChild(item('\uD83C\uDFAE', 'Copy /tp Command', function() {
        copyText('/tp @s ' + worldX + ' ~ ' + worldZ);
        Toast.show('Teleport command copied', 'success');
      }));
      ctx.appendChild(ce('div', 'mc-ctx-sep'));
      ctx.appendChild(item('\uD83D\uDCCC', 'Add Bookmark', function() {
        var label = prompt('Bookmark label:');
        if (!label) return;
        var st = getState();
        Storage.addBookmark({ x: worldX, z: worldZ, label: label, dim: st.dimension, seed: st.seedStr, color: '#7ec8e3' });
        Toast.show('Bookmark saved', 'success');
        document.dispatchEvent(new CustomEvent('mcBookmarksChanged'));
      }));
      ctx.appendChild(item('\uD83D\uDCCF', 'Measure From Here', function() {
        document.dispatchEvent(new CustomEvent('mcMeasureStart', { detail: { x: worldX, z: worldZ } }));
      }));

      /* Position */
      var rect = app.getBoundingClientRect();
      var px = e.originalEvent.clientX - rect.left;
      var py = e.originalEvent.clientY - rect.top;
      ctx.style.left = Math.min(px, rect.width - 200) + 'px';
      ctx.style.top = Math.min(py, rect.height - 200) + 'px';
      ctx.classList.add('mc-visible');
    });

    document.addEventListener('click', hide);
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') hide(); });
  }

  /* ============================================================
   *  MEASURE TOOL
   * ============================================================ */
  function createMeasureTool(map) {
    var active = false, pointA = null, line = null;
    var info = ce('div', 'mc-measure-info');
    app.appendChild(info);

    function clear() {
      if (line) { map.removeLayer(line); line = null; }
      pointA = null;
      info.classList.remove('mc-visible');
      active = false;
    }

    document.addEventListener('mcMeasureStart', function(e) {
      clear();
      active = true;
      pointA = { x: e.detail.x, z: e.detail.z };
      Toast.show('Click another point to measure', 'info');
    });

    map.on('click', function(e) {
      if (!active || !pointA) return;
      var bx = Math.round(e.latlng.lng), bz = Math.round(-e.latlng.lat);
      var dx = bx - pointA.x, dz = bz - pointA.z;
      var dist = Math.round(Math.sqrt(dx * dx + dz * dz));
      var nether = Math.round(dist / 8);

      if (line) map.removeLayer(line);
      line = L.polyline([L.latLng(-pointA.z, pointA.x), L.latLng(-bz, bx)], { color: '#7ec8e3', weight: 2, dashArray: '6,4' }).addTo(map);

      info.innerHTML = dist.toLocaleString() + ' blocks | Nether: ' + nether.toLocaleString() + ' blocks';
      info.classList.add('mc-visible');
      active = false;
    });

    return { clear: clear };
  }

  /* ============================================================
   *  SCALE BAR
   * ============================================================ */
  function createScaleBar(map) {
    var el = ce('div', 'mc-scale', '<span id="mc-scale-text">0 blocks</span><div class="mc-scale-bar" id="mc-scale-line"></div>');
    app.appendChild(el);

    function update() {
      var z = map.getZoom();
      var bpp = ZS[z] || 16;
      var targetPx = 80;
      var blocks = targetPx * bpp;
      /* Round to nice number */
      var nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
      var best = nice[0];
      for (var i = 0; i < nice.length; i++) { if (nice[i] <= blocks * 1.5) best = nice[i]; }
      var px = Math.round(best / bpp);
      $('mc-scale-text').textContent = best >= 1000 ? (best / 1000) + 'k blocks' : best + ' blocks';
      $('mc-scale-line').style.width = px + 'px';
    }
    map.on('zoomend', update);
    update();
  }

  /* ============================================================
   *  FULLSCREEN
   * ============================================================ */
  var Fullscreen = {
    active: false,
    savedStyle: '',
    toggle: function(theMap) {
      this.active = !this.active;
      if (this.active) {
        this.savedStyle = app.getAttribute('style') || '';
        app.classList.add('mc-fullscreen');
      } else {
        app.classList.remove('mc-fullscreen');
        if (this.savedStyle) app.setAttribute('style', this.savedStyle);
      }
      setTimeout(function() { theMap.invalidateSize(); }, 150);
      var btn = $('mc-fs-btn');
      if (btn) btn.textContent = this.active ? '\u2715' : '\u26F6';
    }
  };

  /* ============================================================
   *  KEYBOARD SHORTCUTS
   * ============================================================ */
  function initKeyboard(map) {
    app.setAttribute('tabindex', '0');
    app.addEventListener('keydown', function(e) {
      /* Don't capture when in input */
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      var panAmt = 100;
      switch (e.key) {
        case 'w': case 'W': map.panBy([0, -panAmt]); break;
        case 's': case 'S': map.panBy([0, panAmt]); break;
        case 'a': case 'A': map.panBy([-panAmt, 0]); break;
        case 'd': case 'D': map.panBy([panAmt, 0]); break;
        case '+': case '=': map.zoomIn(); break;
        case '-': map.zoomOut(); break;
        case '1': $('mc-dim').value = 'overworld'; $('mc-dim').dispatchEvent(new Event('change')); break;
        case '2': $('mc-dim').value = 'nether'; $('mc-dim').dispatchEvent(new Event('change')); break;
        case '3': $('mc-dim').value = 'end'; $('mc-dim').dispatchEvent(new Event('change')); break;
        case 'f': case 'F': Fullscreen.toggle(map); break;
        case 'g': case 'G': var gc = $('mc-lg'); if (gc) { gc.checked = !gc.checked; gc.dispatchEvent(new Event('change')); } break;
        case 'Escape':
          if (Fullscreen.active) Fullscreen.toggle(map);
          break;
      }
    });
  }

  /* ============================================================
   *  CONTROLS
   * ============================================================ */
  function setupControls(map, worker, onStateChange) {
    var ct = $('mc-controls');

    function featBtn(k, f) {
      var act = ef[k];
      return '<button class="mc-fb' + (act ? ' mc-active' : '') + '" data-feature="' + k + '" style="--mc-fc:' + f.color + ';">' +
        '<span class="mc-fd" style="background:' + f.color + ';"></span>' +
        '<span class="mc-fi">' + f.icon + '</span>' +
        '<span class="mc-fl">' + f.name + '</span>' +
        '<span class="mc-badge" data-badge="' + k + '"></span></button>';
    }

    function buildStructGroups(dim) {
      var html = '';
      STRUCT_GROUPS.filter(function(g) { return g.dim === dim; }).forEach(function(grp) {
        var feats = Object.keys(FEATURES).filter(function(k) { return FEATURES[k].group === grp.id; });
        if (!feats.length) return;
        var enabledCount = feats.filter(function(k) { return ef[k]; }).length;
        html += '<div class="mc-sg">' +
          '<button class="mc-sg-header" data-group="' + grp.id + '">' +
          '<span><span class="mc-sg-arrow">\u25BC</span>' + grp.label + '</span>' +
          '<span class="mc-sg-count" data-gcount="' + grp.id + '">' + enabledCount + '/' + feats.length + '</span></button>' +
          '<div class="mc-sg-body" data-gbody="' + grp.id + '">' +
          feats.map(function(k) { return featBtn(k, FEATURES[k]); }).join('') +
          '</div></div>';
      });
      return html;
    }

    /* Main HTML */
    ct.innerHTML =
      '<div class="mc-header"><h2>MC Seed Map</h2><div class="mc-header-actions">' +
      '<button id="mc-toggle" class="mc-btn-i" title="Collapse">\u25BC</button></div></div>' +
      '<div class="mc-panel-body">' +
      '<div class="mc-tabs">' +
      '<button class="mc-tab mc-active" data-tab="map">Map</button>' +
      '<button class="mc-tab" data-tab="structs">Structures</button>' +
      '<button class="mc-tab" data-tab="tools">Tools</button>' +
      '</div>' +

      /* MAP TAB */
      '<div class="mc-tab-content mc-visible" data-tabcontent="map">' +
      '<div class="mc-cg"><label>Seed</label><div class="mc-ir"><div class="mc-seed-wrap"><input type="text" id="mc-seed" placeholder="Enter seed..." />' +
      '<div class="mc-history" id="mc-history"></div></div>' +
      '<button id="mc-go" class="mc-btn-p">Go</button></div></div>' +
      '<div class="mc-cg"><label>Version</label><select id="mc-ver"></select></div>' +
      '<div class="mc-cg"><label>Dimension</label><select id="mc-dim"><option value="overworld" selected>Overworld</option><option value="nether">Nether</option><option value="end">The End</option></select></div>' +
      '<div class="mc-cg"><label>Layers</label><div class="mc-lt">' +
      '<label class="mc-tl"><input type="checkbox" id="mc-lb" checked /> Biomes</label>' +
      '<label class="mc-tl"><input type="checkbox" id="mc-lg" /> Chunk Grid</label>' +
      '<label class="mc-tl"><input type="checkbox" id="mc-lbig" /> Large Biomes</label>' +
      '</div></div>' +
      '<div class="mc-cg mc-cd"><span id="mc-mc">X: 0, Z: 0</span><span id="mc-cc">Chunk: 0, 0</span></div>' +
      '</div>' +

      /* STRUCTURES TAB */
      '<div class="mc-tab-content" data-tabcontent="structs">' +
      '<div class="mc-fh"><label>Structures</label><div class="mc-fa"><button id="mc-sa" class="mc-bl">All</button><span class="mc-fs">|</span><button id="mc-da" class="mc-bl">None</button></div></div>' +
      '<div id="mc-zw" class="mc-zw" style="display:none;">Zoom in to show structures</div>' +
      '<div id="mc-sgroups">' + buildStructGroups(0) + '</div>' +
      '</div>' +

      /* TOOLS TAB */
      '<div class="mc-tab-content" data-tabcontent="tools">' +
      '<div class="mc-cg"><label>Go To Coordinates</label><div class="mc-ir mc-cr"><input type="number" id="mc-gx" placeholder="X" /><input type="number" id="mc-gz" placeholder="Z" /><button id="mc-gbtn" class="mc-btn-s">Go</button></div></div>' +
      '<div class="mc-cg"><label>Search</label><input type="text" id="mc-search" placeholder="Structure, biome, or coordinates..." /><div class="mc-search-results" id="mc-search-results"></div></div>' +
      '<div class="mc-cg"><label>Bookmarks</label><div class="mc-bm-list" id="mc-bm-list"><span style="font-size:11px;color:rgba(255,255,255,0.3);">Right-click map to add bookmarks</span></div></div>' +
      '<div class="mc-cg"><label>Share</label><div style="display:flex;gap:4px;flex-wrap:wrap;">' +
      '<button id="mc-share-url" class="mc-btn-s">Copy Link</button>' +
      '<button id="mc-share-seed" class="mc-btn-s">Copy Seed Info</button>' +
      '</div></div>' +
      '<div class="mc-cg" style="padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">' +
      '<div style="font-size:10px;color:rgba(255,255,255,0.25);line-height:1.6;">' +
      'Shortcuts: WASD pan, +/- zoom, 1/2/3 dimension, F fullscreen, G grid, Esc close' +
      '</div></div>' +
      '</div>' +

      '</div>';

    /* Populate version dropdown */
    var verSelect = $('mc-ver');
    Object.keys(MC_VERSIONS).reverse().forEach(function(v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = 'Java ' + v;
      if (v === DV) o.selected = true;
      verSelect.appendChild(o);
    });

    /* URL params */
    var params = new URLSearchParams(window.location.search);
    $('mc-seed').value = params.get('seed') || DS;
    verSelect.value = params.get('ver') || DV;
    $('mc-dim').value = params.get('dim') || 'overworld';
    var ux = parseFloat(params.get('x')) || 0;
    var uz = parseFloat(params.get('z')) || 0;
    var uzoom = parseInt(params.get('zoom')) || 2;
    map.setView([-uz, ux], uzoom);

    /* === TABS === */
    var tabs = ct.querySelectorAll('.mc-tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.classList.remove('mc-active'); });
        tab.classList.add('mc-active');
        ct.querySelectorAll('.mc-tab-content').forEach(function(c) { c.classList.remove('mc-visible'); });
        ct.querySelector('[data-tabcontent="' + tab.dataset.tab + '"]').classList.add('mc-visible');
      });
    });

    /* === COLLAPSE === */
    $('mc-toggle').addEventListener('click', function() {
      var body = ct.querySelector('.mc-panel-body');
      body.classList.toggle('mc-collapsed');
      $('mc-toggle').textContent = body.classList.contains('mc-collapsed') ? '\u25B6' : '\u25BC';
    });

    /* === STRUCTURE GROUPS COLLAPSE === */
    function attachGroupListeners() {
      ct.querySelectorAll('.mc-sg-header').forEach(function(h) {
        h.addEventListener('click', function() {
          var body = ct.querySelector('[data-gbody="' + h.dataset.group + '"]');
          var arrow = h.querySelector('.mc-sg-arrow');
          body.classList.toggle('mc-sg-collapsed');
          arrow.classList.toggle('mc-sg-collapsed-arrow');
        });
      });
    }
    attachGroupListeners();

    /* === STATE === */
    function getState() {
      var seedStr = $('mc-seed').value.trim() || DS;
      var seedNum;
      if (/^-?\d+$/.test(seedStr)) {
        seedNum = parseInt(seedStr, 10);
      } else {
        var hash = 0;
        for (var i = 0; i < seedStr.length; i++) { hash = (hash * 32) - hash + seedStr.charCodeAt(i) | 0; }
        seedNum = hash;
      }
      var dd = $('mc-dim').value;
      var flags = $('mc-lbig') && $('mc-lbig').checked ? 1 : 0;
      return { seed: seedNum, seedStr: seedStr, mcVersion: MC_VERSIONS[verSelect.value] || MC_VERSIONS[DV], versionStr: verSelect.value, dimension: DIMS[dd] || 0, dimensionStr: dd, flags: flags };
    }

    /* === FEATURE TOGGLES === */
    function toggleFeature(k) {
      ef[k] = !ef[k];
      var btn = ct.querySelector('.mc-fb[data-feature="' + k + '"]');
      if (btn) btn.classList.toggle('mc-active', !!ef[k]);
      updateGroupCounts();
      document.dispatchEvent(new CustomEvent('mcFeatChanged'));
    }

    function attachFeatListeners() {
      ct.querySelectorAll('.mc-fb').forEach(function(b) {
        b.addEventListener('click', function(e) { e.stopPropagation(); toggleFeature(b.dataset.feature); });
      });
    }
    attachFeatListeners();

    function updateGroupCounts() {
      STRUCT_GROUPS.forEach(function(grp) {
        var feats = Object.keys(FEATURES).filter(function(k) { return FEATURES[k].group === grp.id; });
        var en = feats.filter(function(k) { return ef[k]; }).length;
        var el = ct.querySelector('[data-gcount="' + grp.id + '"]');
        if (el) el.textContent = en + '/' + feats.length;
      });
    }

    function refreshStructGroups(dimStr) {
      var dim = DIMS[dimStr] || 0;
      $('mc-sgroups').innerHTML = buildStructGroups(dim);
      attachFeatListeners();
      attachGroupListeners();
    }

    if ((params.get('dim') || 'overworld') !== 'overworld') refreshStructGroups(params.get('dim'));

    /* Select all / deselect all */
    $('mc-sa').addEventListener('click', function() {
      var d = $('mc-dim').value, dm = DIMS[d] || 0;
      Object.keys(FEATURES).forEach(function(k) { if (FEATURES[k].dim === dm) ef[k] = true; });
      refreshStructGroups(d);
      document.dispatchEvent(new CustomEvent('mcFeatChanged'));
    });
    $('mc-da').addEventListener('click', function() {
      var d = $('mc-dim').value, dm = DIMS[d] || 0;
      Object.keys(FEATURES).forEach(function(k) { if (FEATURES[k].dim === dm) ef[k] = false; });
      refreshStructGroups(d);
      document.dispatchEvent(new CustomEvent('mcFeatChanged'));
    });

    /* === TRIGGER STATE CHANGE === */
    var triggerChange = function() {
      var st = getState();
      Storage.addHistory(st.seedStr, st.versionStr);
      onStateChange(st);
    };
    $('mc-go').addEventListener('click', triggerChange);
    $('mc-seed').addEventListener('keydown', function(e) { if (e.key === 'Enter') triggerChange(); });
    verSelect.addEventListener('change', triggerChange);
    $('mc-dim').addEventListener('change', function(e) { refreshStructGroups(e.target.value); triggerChange(); });
    $('mc-lbig').addEventListener('change', triggerChange);

    /* === LAYER TOGGLES === */
    $('mc-lb').addEventListener('change', function(e) { document.dispatchEvent(new CustomEvent('mcLayerToggle', { detail: { layer: 'biomes', visible: e.target.checked } })); });
    $('mc-lg').addEventListener('change', function(e) { document.dispatchEvent(new CustomEvent('mcLayerToggle', { detail: { layer: 'grid', visible: e.target.checked } })); });

    /* === GO TO === */
    $('mc-gbtn').addEventListener('click', function() { map.panTo([-(parseInt($('mc-gz').value) || 0), parseInt($('mc-gx').value) || 0]); });

    /* === COORDINATES === */
    map.on('mousemove', function(e) {
      var x = Math.round(e.latlng.lng), z = Math.round(-e.latlng.lat);
      $('mc-mc').textContent = 'X: ' + x + ', Z: ' + z;
      $('mc-cc').textContent = 'Chunk: ' + Math.floor(x / 16) + ', ' + Math.floor(z / 16);
    });

    /* === ZOOM WARNING === */
    function updateZoomWarn() {
      var w = $('mc-zw');
      var any = Object.keys(ef).some(function(k) { return ef[k] && FEATURES[k] && FEATURES[k].sid !== undefined; });
      w.style.display = (any && map.getZoom() < 1) ? 'block' : 'none';
    }
    map.on('moveend zoomend', updateZoomWarn);

    /* === SEED HISTORY === */
    var histEl = $('mc-history');
    function showHistory() {
      var h = Storage.getHistory();
      if (!h.length) { histEl.classList.remove('mc-visible'); return; }
      histEl.innerHTML = h.slice(0, 8).map(function(item) {
        return '<button class="mc-history-item" data-hseed="' + escHtml(item.seed) + '" data-hver="' + escHtml(item.ver) + '">' +
          '<span>' + escHtml(item.seed) + '</span><span class="mc-history-ver">Java ' + escHtml(item.ver) + '</span></button>';
      }).join('');
      histEl.classList.add('mc-visible');
      histEl.querySelectorAll('.mc-history-item').forEach(function(btn) {
        btn.addEventListener('click', function() {
          $('mc-seed').value = btn.dataset.hseed;
          verSelect.value = btn.dataset.hver;
          histEl.classList.remove('mc-visible');
          triggerChange();
        });
      });
    }
    $('mc-seed').addEventListener('focus', showHistory);
    document.addEventListener('click', function(e) { if (!histEl.contains(e.target) && e.target !== $('mc-seed')) histEl.classList.remove('mc-visible'); });

    /* === SEARCH === */
    $('mc-search').addEventListener('input', function() {
      var q = this.value.trim().toLowerCase();
      var results = $('mc-search-results');
      if (!q) { results.innerHTML = ''; return; }
      /* Coordinate search */
      var coordMatch = q.match(/^(-?\d+)\s*[,\s]\s*(-?\d+)$/);
      if (coordMatch) {
        results.innerHTML = '<button class="mc-search-result" data-sx="' + coordMatch[1] + '" data-sz="' + coordMatch[2] + '">Go to X:' + coordMatch[1] + ', Z:' + coordMatch[2] + '</button>';
        results.querySelector('.mc-search-result').addEventListener('click', function() { map.panTo([-(parseInt(coordMatch[2])), parseInt(coordMatch[1])]); });
        return;
      }
      /* Structure + Biome search */
      var html = '';
      Object.keys(FEATURES).forEach(function(k) {
        if (FEATURES[k].name.toLowerCase().indexOf(q) !== -1) {
          html += '<button class="mc-search-result" data-type="struct" data-key="' + k + '">' + FEATURES[k].icon + ' ' + FEATURES[k].name + '</button>';
        }
      });
      Object.keys(BIOME_NAMES).forEach(function(id) {
        if (BIOME_NAMES[id].toLowerCase().indexOf(q) !== -1) {
          html += '<button class="mc-search-result" data-type="biome" data-bid="' + id + '">' + BIOME_NAMES[id] + '</button>';
        }
      });
      results.innerHTML = html || '<span style="font-size:11px;color:rgba(255,255,255,0.3);padding:4px 8px;">No results</span>';
      results.querySelectorAll('.mc-search-result').forEach(function(btn) {
        btn.addEventListener('click', function() {
          if (btn.dataset.type === 'struct') {
            /* Enable and trigger update — just enable it */
            ef[btn.dataset.key] = true;
            refreshStructGroups($('mc-dim').value);
            document.dispatchEvent(new CustomEvent('mcFeatChanged'));
            Toast.show(FEATURES[btn.dataset.key].name + ' enabled', 'info');
          } else if (btn.dataset.type === 'biome') {
            var st = getState();
            var cx = Math.round(map.getCenter().lng), cz = Math.round(-map.getCenter().lat);
            Toast.show('Searching for ' + BIOME_NAMES[btn.dataset.bid] + '...', 'info');
            var rid = 'fb_' + Date.now();
            var h = function(e) {
              if (e.data.type !== 'foundBiome' || e.data.requestId !== rid) return;
              worker.removeEventListener('message', h);
              if (e.data.found) {
                map.panTo([-e.data.z, e.data.x]);
                Toast.show('Found ' + BIOME_NAMES[btn.dataset.bid] + ' at ' + e.data.x + ', ' + e.data.z, 'success');
              } else {
                Toast.show('Biome not found nearby', 'warn');
              }
            };
            worker.addEventListener('message', h);
            worker.postMessage({ type: 'findBiome', seed: st.seed, mcVersion: st.mcVersion, dim: st.dimension, cx: cx, cz: cz, biomeId: parseInt(btn.dataset.bid), flags: st.flags || 0, requestId: rid });
          }
          results.innerHTML = '';
          $('mc-search').value = '';
        });
      });
    });

    /* === BOOKMARKS === */
    function refreshBookmarks() {
      var list = $('mc-bm-list');
      var bms = Storage.getBookmarks();
      var st = getState();
      var relevant = bms.filter(function(b) { return b.seed === st.seedStr; });
      if (!relevant.length) {
        list.innerHTML = '<span style="font-size:11px;color:rgba(255,255,255,0.3);">Right-click map to add bookmarks</span>';
        return;
      }
      list.innerHTML = relevant.map(function(b) {
        return '<div class="mc-bm-item" data-bmid="' + b.id + '">' +
          '<span class="mc-bm-dot" style="background:' + (b.color || '#7ec8e3') + ';"></span>' +
          '<span class="mc-bm-label">' + escHtml(b.label) + '</span>' +
          '<span class="mc-bm-coords">' + b.x + ', ' + b.z + '</span>' +
          '<button class="mc-bm-del" data-bmdel="' + b.id + '">\u00D7</button></div>';
      }).join('');
      list.querySelectorAll('.mc-bm-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          if (e.target.dataset.bmdel) {
            Storage.removeBookmark(e.target.dataset.bmdel);
            refreshBookmarks();
            document.dispatchEvent(new CustomEvent('mcBookmarksChanged'));
            Toast.show('Bookmark removed', 'info');
            return;
          }
          var bm = relevant.find(function(b) { return b.id === item.dataset.bmid; });
          if (bm) map.panTo([-bm.z, bm.x]);
        });
      });
    }
    document.addEventListener('mcBookmarksChanged', refreshBookmarks);
    refreshBookmarks();

    /* === SHARE === */
    $('mc-share-url').addEventListener('click', function() {
      var st = getState();
      var c = map.getCenter();
      var url = BASE + '?seed=' + encodeURIComponent(st.seedStr) + '&ver=' + encodeURIComponent(st.versionStr) +
        '&x=' + Math.round(c.lng) + '&z=' + Math.round(-c.lat) + '&zoom=' + map.getZoom() + '&dim=' + st.dimensionStr;
      copyText(url);
      Toast.show('Link copied!', 'success');
    });
    $('mc-share-seed').addEventListener('click', function() {
      var st = getState();
      var text = 'Seed: ' + st.seedStr + ' (Java ' + st.versionStr + ')';
      copyText(text);
      Toast.show('Seed info copied!', 'success');
    });

    /* === BADGE UPDATES === */
    document.addEventListener('mcBadgeUpdate', function(e) {
      var counts = e.detail;
      ct.querySelectorAll('.mc-badge').forEach(function(b) {
        var k = b.dataset.badge;
        var c = counts[k] || 0;
        b.textContent = c;
        b.classList.toggle('mc-has-count', c > 0);
      });
    });

    return { getState: getState };
  }

  /* ============================================================
   *  BOOKMARK MARKERS ON MAP
   * ============================================================ */
  function createBookmarkMarkers(map, getState) {
    var bmLayer = L.layerGroup().addTo(map);

    function refresh() {
      bmLayer.clearLayers();
      var st = getState();
      Storage.getBookmarks().filter(function(b) { return b.seed === st.seedStr && b.dim === st.dimension; }).forEach(function(bm) {
        var icon = L.divIcon({
          className: 'mc-bm-pin',
          html: '<div class="mc-bm-icon" style="background:' + (bm.color || '#7ec8e3') + ';">\uD83D\uDCCC</div>',
          iconSize: [20, 20], iconAnchor: [10, 10]
        });
        L.marker(L.latLng(-bm.z, bm.x), { icon: icon })
          .bindPopup('<b>' + escHtml(bm.label) + '</b><br>X: ' + bm.x + ', Z: ' + bm.z)
          .addTo(bmLayer);
      });
    }

    document.addEventListener('mcBookmarksChanged', refresh);
    return { refresh: refresh };
  }

  /* ============================================================
   *  BOOT
   * ============================================================ */
  loadLeaflet(function() {
    try {
      setStatus('Setting up map...');
      var curState = null;

      var theMap = L.map('mc-map', {
        crs: L.CRS.Simple, minZoom: 0, maxZoom: 5, zoom: 2, center: [0, 0],
        zoomControl: true, attributionControl: true, preferCanvas: true
      });
      theMap.attributionControl.setPrefix('<a href="https://github.com/Cubitect/cubiomes" target="_blank">cubiomes</a> | <a href="https://leafletjs.com" target="_blank">Leaflet</a>');

      /* Crosshair */
      app.appendChild(ce('div', 'mc-crosshair'));

      /* Fullscreen button as Leaflet control */
      var FSControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function() {
          var btn = ce('a', 'mc-leaflet-btn', '\u26F6');
          btn.id = 'mc-fs-btn'; btn.href = '#'; btn.title = 'Fullscreen (F)';
          L.DomEvent.on(btn, 'click', function(e) { L.DomEvent.stop(e); Fullscreen.toggle(theMap); });
          return btn;
        }
      });
      theMap.addControl(new FSControl());

      /* Toast system */
      Toast.init();

      setStatus('Loading WASM engine...');

      var loadTimeout = setTimeout(function() { setError('Loading timed out.'); switchToIframe('timeout'); }, 15000);

      createWorker().then(function(worker) {
        setStatus('Initializing WASM...');
        var getState = function() { return curState; };
        var biomeLayer = createBiomeLayer(worker, getState);
        var structMgr = createStructureLayer(worker, theMap, getState);
        var GC = createGridLayer(), gridLayer = new GC();
        biomeLayer.addTo(theMap);
        structMgr.layer.addTo(theMap);

        /* Controls */
        var controls = setupControls(theMap, worker, function(ns) {
          curState = ns;
          biomeLayer.redraw();
          structMgr.update();
          bmMarkers.refresh();
        });

        /* Biome tooltip */
        createBiomeTooltip(worker, theMap, getState);

        /* Context menu */
        createContextMenu(theMap, getState, structMgr);

        /* Measure tool */
        createMeasureTool(theMap);

        /* Scale bar */
        createScaleBar(theMap);

        /* Keyboard shortcuts */
        initKeyboard(theMap);

        /* Bookmark markers */
        var bmMarkers = createBookmarkMarkers(theMap, getState);

        /* Layer toggles */
        document.addEventListener('mcLayerToggle', function(e) {
          if (e.detail.layer === 'biomes') { if (e.detail.visible) biomeLayer.addTo(theMap); else theMap.removeLayer(biomeLayer); }
          if (e.detail.layer === 'grid') { if (e.detail.visible) gridLayer.addTo(theMap); else theMap.removeLayer(gridLayer); }
        });
        document.addEventListener('mcFeatChanged', function() { if (curState) structMgr.update(); });
        theMap.on('moveend', function() { if (curState) structMgr.scheduleUpdate(); });

        worker.addEventListener('message', function onReady(e) {
          if (e.data.type === 'ready') {
            clearTimeout(loadTimeout);
            worker.removeEventListener('message', onReady);
            setStatus('Ready!');
            var overlay = $('mc-loading-overlay');
            if (overlay) { overlay.classList.add('mc-hidden'); setTimeout(function() { overlay.style.display = 'none'; }, 600); }
            curState = controls.getState();
            biomeLayer.redraw();
            structMgr.update();
            bmMarkers.refresh();
          } else if (e.data.type === 'error') {
            clearTimeout(loadTimeout);
            worker.removeEventListener('message', onReady);
            setError('Engine error: ' + e.data.error);
            switchToIframe('wasm-error');
          }
        });
        worker.postMessage({ type: 'init' });
      })['catch'](function(err) {
        clearTimeout(loadTimeout);
        setError('Worker failed: ' + err.message);
        switchToIframe(err.message);
      });

    } catch(ex) {
      setError('Init error: ' + ex.message);
      console.error('[MCSeedMap]', ex);
      switchToIframe('init-exception');
    }
  });

})();
