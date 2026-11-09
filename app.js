/* DRAFT LAB · interfaz. Lógica de puntuación en engine.js, datos en data/meta.json */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem("dl_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("dl_" + k, JSON.stringify(v)); } catch (e) {} },
  };
  const API = "https://api.brawlify.com/v1";
  const CDN = "https://cdn.brawlify.com";
  const CLASS = {
    DD: { n: "Daño", c: "#ff5d6c" }, TK: { n: "Tanque", c: "#ffb02e" }, MK: { n: "Tirador", c: "#3fd0ff" },
    AR: { n: "Lanzador", c: "#a6f04a" }, CT: { n: "Control", c: "#c06bff" }, AS: { n: "Asesino", c: "#ff4fd8" },
    SP: { n: "Apoyo", c: "#3dffa8" }, "?": { n: "Nuevo", c: "#8892c8" },
  };
  const API_CLASS = { "damage dealer": "DD", tank: "TK", marksman: "MK", artillery: "AR", controller: "CT", assassin: "AS", support: "SP" };
  const MODE_EMOJI = { gemGrab: "💎", brawlBall: "⚽", hotZone: "🔥", heist: "💰", knockout: "💀", bounty: "⭐" };
  const MODE_ORDER = ["gemGrab", "brawlBall", "hotZone", "heist", "knockout", "bounty"];
  const ALIAS = { glowbert: "glowy" };
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const other = (s) => (s === "us" ? "them" : "us");

  let META, E;
  const S = {
    format: LS.get("format", "ranked"), mode: LS.get("mode", "all"), allMaps: LS.get("allMaps", false),
    pool: LS.get("pool", []), poolOnly: LS.get("poolOnly", false), style: LS.get("style", 0.5),
    history: LS.get("history", []), draft: LS.get("draft", null), undo: [],
    live: { ok: null, maps: {}, nuevos: [] }, sheet: null, pf: { q: "", cls: "all" }, gridSort: LS.get("gridSort", "prob"),
  };

  // ---------------- utilidades visuales ----------------
  function bImg(b) { return b && b.gameId ? CDN + "/brawlers/borderless/" + b.gameId + ".png" : (b && b.img) || null; }
  function ini(n) { const p = n.replace(/[^A-Za-z0-9 &]/g, "").split(/[ &]+/).filter(Boolean); return (p.length > 1 ? p[0][0] + p[1][0] : n.slice(0, 2)).toUpperCase(); }
  function por(b, cls) {
    if (!b) return "";
    const c = (CLASS[b.clase] || CLASS["?"]).c;
    const src = bImg(b);
    const wiki = src && !b.gameId;
    return '<div class="por ' + (cls || "") + (wiki ? " wiki" : "") + '" style="--cc:' + c + '"><span class="ini">' + esc(ini(b.nombre)) + "</span>" +
      (src ? '<img src="' + src + '" alt="' + esc(b.nombre) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">' : "") + "</div>";
  }
  function modeIcon(modo) {
    const m = META.modos[modo];
    return '<span class="memo">' + (MODE_EMOJI[modo] || "🎮") + "</span>";
  }
  function mapName(m) { return (m && (m.nombreEs || (S.live.es || {})[m.id] || m.nombre)) || ""; }
  function mapImg(m) {
    const lm = S.live.maps[norm(m.nombre)];
    return lm && lm.img ? lm.img : null;
  }
  function mapArt(m, big) {
    const src = mapImg(m);
    return '<div class="fb">' + (MODE_EMOJI[m.modo] || "🎮") + "</div>" +
      (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "");
  }
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 1800); }
  function ago(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!isFinite(d)) return "—";
    if (d < 3600) return "hace " + Math.max(1, Math.round(d / 60)) + " min";
    if (d < 86400) return "hace " + Math.round(d / 3600) + " h";
    return "hace " + Math.round(d / 86400) + " d";
  }
  function fmtDate(s) { try { return new Date(s).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return s; } }

  // ---------------- datos en vivo (Brawlify) ----------------
  async function fetchJ(url, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 7000);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  const listOf = (j) => (j && (j.list || j.items || (Array.isArray(j) ? j : null))) || [];

  function applyLive(data) {
    // brawlers: completar IDs de imagen y detectar brawlers nuevos
    const byNorm = {};
    E.list.forEach((b) => (byNorm[norm(b.nombre)] = b));
    const nuevos = [];
    (data.brawlers || []).forEach((x) => {
      let k = norm(x.name); k = ALIAS[k] || k;
      const b = byNorm[k];
      if (b) { if (!b.gameId && x.id) b.gameId = x.id; }
      else if (x.id) {
        const cl = API_CLASS[(x.cls || "").toLowerCase()] || "?";
        const nice = String(x.name).toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, c) => a + c.toUpperCase());
        const nb = { id: k, nombre: nice, clase: cl, gameId: x.id, alcance: 3, tags: [], tier: "?", nuevo: true };
        E.add(nb); nuevos.push(nb);
      }
    });
    S.live.nuevos = nuevos;
    const maps = {};
    (data.maps || []).forEach((m) => { if (m.name) maps[norm(m.name)] = { id: m.id, img: m.img }; });
    S.live.maps = maps;
    S.live.es = data.es || {};
    Object.entries(data.imgBrawlers || {}).forEach(([id, src]) => { if (E.byId[id] && !E.byId[id].gameId) E.byId[id].img = src; });
  }

  async function loadLive() {
    // 1) data/live.json: lo genera GitHub Actions cada 6 h (el navegador no puede llamar a Brawlify por CORS)
    try {
      const r = await fetch("data/live.json", { cache: "no-cache" });
      if (r.ok) {
        const j = await r.json();
        applyLive(j);
        Object.keys(j.stats || {}).forEach((mid) => E.setLiveStats(mid, j.stats[mid]));
        S.live.ok = true;
        S.live.t = j.t;
        render();
        return;
      }
    } catch (e) {}
    // 2) Respaldo: API directa (solo funciona si Brawlify permite CORS)
    const cached = LS.get("live", null);
    if (cached && Date.now() - cached.t < 12 * 3600e3) { applyLive(cached); S.live.ok = true; render(); }
    try {
      const [bj, mj] = await Promise.all([fetchJ(API + "/brawlers"), fetchJ(API + "/maps")]);
      const data = {
        t: Date.now(),
        brawlers: listOf(bj).map((x) => ({ id: x.id, name: x.name, cls: x.class && x.class.name })),
        maps: listOf(mj).map((m) => ({ id: m.id, name: m.name, img: m.imageUrl || (m.id ? CDN + "/maps/regular/" + m.id + ".png" : null) })),
      };
      if (!data.brawlers.length && !data.maps.length) throw new Error("vacío");
      LS.set("live", data);
      applyLive(data);
      S.live.ok = true;
    } catch (e) {
      if (!cached) S.live.ok = false;
    }
    render();
    if (S.draft) loadMapStats(S.draft.mapId);
  }

  async function loadMapStats(mapId) {
    const m = E.maps[mapId];
    if (!m || S.live.t) return; // con data/live.json las estadísticas ya están cargadas
    const lm = S.live.maps[norm(m.nombre)];
    if (!lm || !lm.id) return;
    const key = "stats_" + mapId;
    const c = LS.get(key, null);
    if (c && Date.now() - c.t < 6 * 3600e3) { E.setLiveStats(mapId, c.s); render(); return; }
    try {
      const j = await fetchJ(API + "/maps/" + lm.id);
      const arr = (j && (j.stats || (j.map && j.map.stats))) || [];
      const s = {};
      arr.forEach((x) => { const id = x.brawler || x.brawlerId || x.id; const wr = x.winRate != null ? x.winRate : x.winrate; if (id && wr != null) s[id] = { wr: +wr, use: +(x.useRate || 0) }; });
      if (Object.keys(s).length) { LS.set(key, { t: Date.now(), s }); E.setLiveStats(mapId, s); render(); }
    } catch (e) {}
  }

  // ---------------- draft (modo rápido) ----------------
  // Un toque por turno: el orden de selección avanza solo. Los bloqueos son opcionales y van todos juntos.
  function newDraft(mapId) {
    return {
      v: 2, mapId, firstPick: null, format: S.format, phase: "prep",
      bans: { us: [], them: [] }, globalBans: { us: [], them: [] },
      picks: { us: [null, null, null], them: [null, null, null] },
      active: null, banMode: false, flash: null, t: Date.now(), result: null,
    };
  }
  function est(d) {
    return { format: d.format, mapId: d.mapId, firstPick: d.firstPick || "us", bans: d.bans, globalBans: d.globalBans, picks: d.picks,
      pool: S.pool, poolOnly: S.poolOnly, style: S.style };
  }
  function advance(d) {
    if (d.phase === "prep") { d.active = null; return; }
    const np = E.nextPick(est(d));
    if (np) { d.phase = "picks"; d.active = { kind: "pick", side: np.side, slot: np.slot, index: np.index }; }
    else { d.phase = "done"; d.active = null; }
  }
  function save() { LS.set("draft", S.draft); }
  function pushUndo() { S.undo.push(JSON.stringify(S.draft)); if (S.undo.length > 40) S.undo.shift(); }
  function startPicks(first) {
    const d = S.draft; pushUndo();
    d.firstPick = first; d.phase = "picks"; d.banMode = false; advance(d); save(); render(); window.scrollTo(0, 0);
  }
  function toggleBan(id) {
    const d = S.draft;
    const isPicked = d.picks.us.indexOf(id) >= 0 || d.picks.them.indexOf(id) >= 0;
    if (isPicked) return;
    pushUndo();
    const i = d.bans.us.indexOf(id);
    if (i >= 0) d.bans.us.splice(i, 1); else d.bans.us.push(id);
    d.flash = { ban: id }; save(); render();
  }
  function assign(id) {
    const d = S.draft;
    if (!d) return;
    if (d.banMode || d.phase === "prep") return toggleBan(id);
    if (!d.active) return;
    if (E.unavailable(est(d)).has(id)) return;
    pushUndo();
    const a = d.active;
    d.picks[a.side][a.slot] = id;
    d.flash = { side: a.side, slot: a.slot };
    advance(d); save(); render();
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    if (d.phase === "done") setTimeout(() => openSheet("summary"), 400);
  }
  function clearSlot(side, slot) {
    const d = S.draft;
    if (!d.picks[side][slot]) return;
    pushUndo(); d.picks[side][slot] = null; d.flash = null; advance(d); save(); render();
  }
  function undo() {
    if (!S.undo.length) return toast("Nada que deshacer");
    S.draft = JSON.parse(S.undo.pop()); S.draft.flash = null; save(); render();
  }
  // Chuleta: todo lo que necesitas saber del mapa antes de que empiece la selección
  function cheatSheet(d) {
    const st = (first, us, them) => Object.assign(est(d), { firstPick: first, picks: { us: us.concat([null, null, null]).slice(0, 3), them: them.concat([null, null, null]).slice(0, 3) } });
    const bans = E.recommendBans(est(d), "us", 3);
    const firsts = E.recommendPicks(st("us", [], []), "us", 3);
    const theirs = E.recommendPicks(st("them", [], []), "them", 6);
    const resp = theirs.map((r) => ({ x: r.b, ans: E.recommendPicks(st("them", [], [r.b.id]), "us", 2).map((a) => a.b) }));
    return { bans, firsts, resp };
  }

  // ---------------- render: home ----------------
  function render(skipSheet) {
    if (!META) return;
    const app = $("#app");
    if (S.draft && S.view === "draft") app.innerHTML = renderDraft();
    else { S.view = "home"; app.innerHTML = renderHome(); }
    if (!skipSheet && S.sheet) renderSheet();
  }

  function metaPill() {
    const m = META.meta;
    const dot = S.live.ok === true ? "on" : S.live.ok === false ? "off" : "";
    const live = S.live.ok === true ? (S.live.t ? "Imágenes y datos " + ago(S.live.t) : "Brawlify en vivo") : S.live.ok === false ? "Sin datos en vivo" : "Conectando…";
    return '<div class="metapill" data-act="changelog"><span class="dot ' + dot + '"></span><b>' + esc(m.temporada) + "</b>" +
      "<span>· meta del " + esc(fmtDate(m.fechaDatos)) + " · comprobado " + esc(ago(m.comprobado)) + "</span><span>· " + live + "</span></div>";
  }

  function renderHome() {
    const pool = S.format === "bsc" ? "bsc" : "ranked";
    let maps = META.mapas.filter((m) => S.allMaps || m.pools.indexOf(pool) >= 0);
    if (S.mode !== "all") maps = maps.filter((m) => m.modo === S.mode);
    let h = '<div class="top"><div class="logo">DRAFT LAB<small>BRAWL STARS · ASISTENTE</small></div><div class="sp"></div>' +
      '<button class="ib" data-act="history" title="Historial">📈</button><button class="ib" data-act="settings" title="Ajustes y pool">⚙️</button></div>';
    h += metaPill();
    (META.meta.avisos || []).slice(0, 1).forEach((a) => (h += '<div class="banner">📣 ' + esc(a) + "</div>"));
    if (S.live.nuevos.length)
      h += '<div class="banner new">🆕 Brawlers nuevos sin datos de meta: <b>' + S.live.nuevos.map((b) => esc(b.nombre)).join(", ") +
        "</b>. Aparecen como neutrales hasta la próxima actualización.</div>";
    if (S.draft && S.draft.phase !== "done") {
      const m = E.maps[S.draft.mapId];
      if (m) h += '<div class="banner" data-act="resume" style="cursor:pointer">⏯️ Tienes una selección a medias en <b>' + esc(mapName(m)) + "</b>. Toca para continuar.</div>";
    }
    h += '<div class="seg"><button data-act="fmt" data-v="ranked" class="' + (S.format === "ranked" ? "on" : "") + '">🏆 Competitivo</button>' +
      '<button data-act="fmt" data-v="bsc" class="' + (S.format === "bsc" ? "on" : "") + '">🎙️ Pro · BSC</button></div>';
    h += '<div class="chips"><button class="chip ' + (S.mode === "all" ? "on" : "") + '" data-act="mode" data-v="all">Todos</button>';
    MODE_ORDER.forEach((k) => {
      const md = META.modos[k];
      h += '<button class="chip ' + (S.mode === k ? "on" : "") + '" style="--mc:' + md.color + '" data-act="mode" data-v="' + k + '">' + modeIcon(k) + esc(md.nombre) + "</button>";
    });
    h += "</div>";
    h += '<div class="sub"><span>' + maps.length + " mapas · " + (S.format === "bsc" ? "pool oficial BSC 2026" : "rotación competitiva actual") + "</span>" +
      '<span class="tog" data-act="allmaps">Todos los mapas <span class="sw ' + (S.allMaps ? "on" : "") + '"></span></span></div>';
    MODE_ORDER.forEach((k) => {
      const ms = maps.filter((m) => m.modo === k);
      if (!ms.length) return;
      const md = META.modos[k];
      h += '<div class="mode-h disp" style="--mc:' + md.color + '">' + modeIcon(k) + esc(md.nombre) + '<span class="bar"></span></div><div class="maps">';
      ms.forEach((m) => {
        h += '<div class="map" style="--mc:' + md.color + '" data-act="map" data-v="' + m.id + '"><div class="art">' + mapArt(m) + '</div><div class="shade"></div><div class="info">' +
          '<div class="nm">' + esc(mapName(m)) + "</div>" + (mapName(m) !== m.nombre ? '<div class="en">' + esc(m.nombre) + "</div>" : "") +
          '<div class="tags">' + (m.nuevo ? '<span class="tg new">Nuevo</span>' : "") + '<span class="tg">' + esc(m.arquetipo) + "</span>" +
          (m.pools.indexOf("bsc") >= 0 ? '<span class="tg bsc">BSC</span>' : "") + '</div><div class="minis">' +
          (m.top.length || (m.sugeridos || []).length ? (m.top.length ? m.top : m.sugeridos).slice(0, 4).map((id) => por(E.byId[id])).join("") : E.recommendBans({ format: S.format, mapId: m.id, firstPick: "us", bans: { us: [], them: [] }, globalBans: { us: [], them: [] }, picks: { us: [], them: [] } }, "us", 4).map((r) => por(r.b)).join("")) +
          "</div></div></div>";
      });
      h += "</div>";
    });
    if (!maps.length) h += '<div class="empty">No hay mapas de este modo en este pool. Activa «Todos los mapas».</div>';
    h += '<div class="foot">Meta: ' + esc(META.meta.parche) + " · v" + META.meta.version + '<br>Retratos: Brawlify CDN · Mapas: Brawl Stars Wiki (Fandom, CC BY-SA) · No afiliado a Supercell<br><a href="#" data-act="changelog">Novedades y fuentes</a></div>';
    return h;
  }

  // ---------------- render: draft (modo rápido) ----------------
  function renderDraft() {
    const d = S.draft;
    const m = E.maps[d.mapId];
    const md = META.modos[m.modo];
    const img = mapImg(m);
    let h = '<div class="dbg">' + (img ? '<img src="' + esc(img) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : "") + "</div>";
    h += '<div class="dh"><button class="ib" data-act="home">←</button><div class="t"><div class="nm">' + esc(mapName(m)) + '</div><div class="md">' + modeIcon(m.modo) +
      esc(md.nombre) + " · " + esc(META.reglas[d.format].nombre) + "</div></div>" +
      '<button class="ib" data-act="undo" title="Deshacer">↶</button><button class="ib" data-act="reset" title="Reiniciar">⟲</button></div>';

    if (d.phase === "prep") {
      const c = cheatSheet(d);
      const row = (label, arr) => '<div class="chr"><span class="chl">' + label + '</span><div class="chp">' + arr.map((b) => por(b)).join("") + "</div></div>";
      h += '<div class="qwrap"><div><div class="chu"><h2>📋 Chuleta del mapa</h2>' +
        row("🚫 Bloquea", c.bans.map((r) => r.b)) +
        row("⭐ Si eliges 1º", c.firsts.map((r) => r.b)) +
        '<div class="chl" style="margin:10px 0 6px">⚔️ Si ellos cogen… → responde con</div><div class="resp">' +
        c.resp.map((r) => '<div class="rr">' + por(r.x) + '<span class="arw">→</span>' + r.ans.map((b) => por(b)).join("") + "</div>").join("") + "</div></div>" +
        '<div class="q" style="margin-top:14px">¿Quién elige primero?</div><div class="row"><button class="btn blue" data-act="start" data-v="us">🔵 Nosotros</button><button class="btn red" data-act="start" data-v="them">🔴 Ellos</button></div>' +
        '<p class="small" style="margin-top:10px">Al empezar la selección solo tienes que tocar cada brawler según se elige: un toque por turno.</p></div>';
      h += '<div>' + banBar(d) + (d.banMode ? gridHTML(d) : "") + "</div></div>";
      return h;
    }

    // tira de orden 1-6
    const ord = E.order(est(d));
    const cnt = { us: 0, them: 0 };
    h += '<div class="strip">' + ord.map((side, i) => {
      const slot = cnt[side]++;
      const id = d.picks[side][slot];
      const b = id && E.byId[id];
      const act = d.active && d.active.index === i;
      const fl = d.flash && d.flash.side === side && d.flash.slot === slot;
      return '<div class="s6 ' + side + (act ? " act" : "") + (fl ? " flash" : "") + '" data-act="clear" data-s="' + side + '" data-i="' + slot + '"><span class="o">' + (i + 1) + "</span>" +
        (b ? por(b) : '<div class="e">' + (act ? "?" : "") + "</div>") + "</div>";
    }).join("") + "</div>";

    if (d.active && !d.banMode) {
      const us = d.active.side === "us";
      const nextSame = ord[d.active.index + 1] === d.active.side;
      h += '<div class="turn" style="--tc:' + (us ? "var(--us)" : "var(--them)") + '"><div><div class="big">' + (us ? "TE TOCA" : "ELIGEN ELLOS") +
        '</div><div class="sm">' + (us ? "Toca tu brawler" : "Toca lo que elijan") + (nextSame ? " · luego otro más" : "") + "</div></div>" +
        '<div class="sp"></div><div class="timer" style="animation-duration:' + (META.reglas[d.format].segundosPorPick || 20) + 's"></div></div>';
    } else if (d.phase === "done") {
      const ev = E.evaluate(est(d));
      h += '<div class="turn" style="--tc:var(--gold)" data-act="summary"><div class="num">🏁</div><div><div class="big">LISTO</div><div class="sm">' + Math.round(ev.win * 100) + "% estimado · toca para ver el plan</div></div></div>";
    }

    const left = (d.active && d.active.side === "us" && !d.banMode) || d.phase === "done";
    h += '<div class="qwrap' + (left ? "" : " solo") + '"><div>';
    if (d.active && d.active.side === "us" && !d.banMode) {
      const recs = E.recommendPicks(est(d), "us", 3);
      h += '<div class="recs q3">' + recs.map((r, i) => recCard(r, i)).join("") + "</div>";
    }
    if (d.phase === "done") h += '<div class="row" style="margin:6px 0 12px"><button class="btn" data-act="summary">Ver plan de partida</button></div><div class="row"><button class="btn ghost" data-act="again">Siguiente partida · mismo mapa</button></div>';
    h += "</div><div>" + banBar(d) + (d.phase !== "done" ? gridHTML(d) : "") + "</div></div>";
    return h;
  }

  function banBar(d) {
    const bl = d.bans.us.map((id) => E.byId[id]).filter(Boolean);
    return '<div class="bbar"><button class="chip ' + (d.banMode ? "on" : "") + '" style="--mc:var(--them)" data-act="banmode">🚫 ' + (d.banMode ? "Marcando bloqueados · toca para terminar" : "Bloqueados" + (bl.length ? " (" + bl.length + ")" : " (opcional)")) + "</button>" +
      '<div class="bmini">' + bl.map((b) => '<span class="bm" data-act="pick" data-v="' + b.id + '">' + por(b) + "</span>").join("") + "</div></div>";
  }

  function gridHTML(d) {
    const st = est(d);
    let scored;
    if (d.banMode || d.phase === "prep") scored = E.recommendBans(st, "us");
    else scored = E.recommendPicks(st, d.active ? d.active.side : "us");
    const sc = {}, rank = {};
    scored.forEach((r, i) => { sc[r.b.id] = r.score; rank[r.b.id] = i; });
    const banned = new Set(d.bans.us);
    const picked = new Set(d.picks.us.concat(d.picks.them).filter(Boolean));
    let list = E.list.filter((b) => S.pf.cls === "all" || b.clase === S.pf.cls);
    if (S.gridSort === "az") list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    else list.sort((a, b) => ((rank[a.id] == null ? 999 : rank[a.id]) - (rank[b.id] == null ? 999 : rank[b.id])) || a.nombre.localeCompare(b.nombre));
    const ours = !d.banMode && d.active && d.active.side === "us";
    let h = '<div class="gtools"><div class="chips">' +
      '<button class="chip ' + (S.pf.cls === "all" ? "on" : "") + '" data-act="pcls" data-v="all">Todos</button>' +
      Object.keys(CLASS).filter((k) => k !== "?").map((k) => '<button class="chip ' + (S.pf.cls === k ? "on" : "") + '" style="--mc:' + CLASS[k].c + '" data-act="pcls" data-v="' + k + '">' + CLASS[k].n + "</button>").join("") +
      '</div><button class="sortb" data-act="sort">' + (S.gridSort === "az" ? "A-Z" : "Probables") + " ⇅</button></div>";
    h += '<div class="qgrid">' + list.map((b) => {
      const isB = banned.has(b.id), isP = picked.has(b.id);
      const off = d.banMode ? isP : isB || isP;
      const r = rank[b.id];
      const top = !off && ours && r != null && r < 3;
      const fl = d.flash && d.flash.ban === b.id;
      return '<div class="qt' + (off ? " off" : "") + (isB ? " ban" : "") + (top ? " tp3" : "") + (fl ? " flash" : "") + '" data-act="pick" data-v="' + b.id + '">' +
        (top ? '<span class="rk">' + (r + 1) + "</span>" : "") + por(b) + (isB ? '<span class="x">✕</span>' : "") + '<div class="gn">' + esc(b.nombre) + "</div></div>";
    }).join("") + "</div>";
    return h;
  }

  function recCard(r, i) {
    const b = r.b;
    const pct = Math.round(Math.max(0, Math.min(1, r.score)) * 100);
    return '<div class="rc ' + (i === 0 ? "first" : "") + '" data-act="pick" data-v="' + b.id + '">' + por(b) +
      '<div class="mid"><div class="n">' + esc(b.nombre) + (i === 0 ? ' <span class="best">★ Mejor</span>' : "") + "</div>" +
      '<div class="rs">' + r.reasons.slice(0, 3).map((x) => '<span class="' + x.k + '">' + esc(x.t) + "</span>").join("") + "</div>" +
      '</div><div class="ring" style="--p:' + pct + '"><span>' + pct + "</span></div></div>";
  }

  // ---------------- sheets ----------------
  function openSheet(name, arg) { S.sheet = name; S.sheetArg = arg; renderSheet(); $("#ov").classList.add("on"); $("#sheet").classList.add("on"); }
  function closeSheet() { S.sheet = null; $("#ov").classList.remove("on"); $("#sheet").classList.remove("on"); }

  function renderSheet() {
    const el = $("#sheet");
    let h = '<div class="grab"></div>';
    if (S.sheet === "summary") h += sheetSummary();
    else if (S.sheet === "settings") h += sheetSettings();
    else if (S.sheet === "history") h += sheetHistory();
    else if (S.sheet === "changelog") h += sheetChangelog();
    el.innerHTML = h;
  }

  function radarSVG(ru, rt) {
    const keys = Object.keys(ru);
    const cx = 170, cy = 150, R = 105;
    const pt = (i, v) => { const ang = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length; return [cx + Math.cos(ang) * R * v, cy + Math.sin(ang) * R * v]; };
    let g = "";
    [0.25, 0.5, 0.75, 1].forEach((f) => (g += '<polygon points="' + keys.map((k, i) => pt(i, f).join(",")).join(" ") + '" fill="none" stroke="rgba(255,255,255,.1)"/>'));
    keys.forEach((k, i) => { const [x, y] = pt(i, 1); const [lx, ly] = pt(i, 1.2); g += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '" stroke="rgba(255,255,255,.08)"/><text x="' + lx + '" y="' + (ly + 4) + '" fill="#9aa3d1" font-size="11" font-weight="700" text-anchor="middle" font-family="Inter">' + k + "</text>"; });
    const poly = (r, c) => '<polygon points="' + keys.map((k, i) => pt(i, Math.max(0.06, r[k] / 100)).join(",")).join(" ") + '" fill="' + c + '" fill-opacity=".28" stroke="' + c + '" stroke-width="2.5" stroke-linejoin="round"/>';
    return '<svg class="radar" viewBox="0 0 340 300">' + g + poly(rt, "#ff3b5c") + poly(ru, "#2f8cff") + "</svg>";
  }

  function sheetSummary() {
    const d = S.draft;
    const m = E.maps[d.mapId];
    const ev = E.evaluate(est(d));
    const w = Math.round(ev.win * 100);
    let h = '<h2>📊 Análisis de la selección<span class="sp"></span><button class="ib" data-act="close">✕</button></h2>';
    h += '<div class="wp"><div class="lab"><span class="u">' + w + '%</span><span class="small" style="align-self:center">probabilidad estimada</span><span class="t">' + (100 - w) + '%</span></div><div class="bar"><div class="a" style="width:' + w + '%"></div><div class="b" style="width:' + (100 - w) + '%"></div></div></div>';
    const team = (k) => d.picks[k].filter(Boolean).map((id) => por(E.byId[id])).join("");
    h += '<div class="grades"><div class="grade us"><div class="small">Nuestro equipo</div><div class="g">' + ev.us.grade + '</div><div class="tm">' + team("us") + '</div></div><div class="grade them"><div class="small">Rival</div><div class="g">' + ev.them.grade + '</div><div class="tm">' + team("them") + "</div></div></div>";
    h += radarSVG(ev.us.radar, ev.them.radar) + '<div class="legend"><span><i style="background:var(--us)"></i>Nosotros</span><span><i style="background:var(--them)"></i>Rivales</span></div>';
    h += '<div class="q">Plan de partida</div><div class="plan">';
    ev.plan.forEach((p) => {
      if (p.tipo === "roles") p.roles.forEach((r) => (h += '<div class="pl">' + por(E.byId[r.id]) + "<div><b>" + esc(r.rol) + "</b>" + esc(r.nombre) + "</div></div>"));
      else h += '<div class="pl ' + p.tipo + '"><span class="ic">' + (p.tipo === "alerta" ? "⚠️" : p.tipo === "objetivo" ? "🎯" : "🗺️") + "</span><div>" + esc(p.t) + "</div></div>";
    });
    h += "</div>";
    if (!d.result) h += '<div class="q">¿Cómo ha ido?</div><div class="row"><button class="btn blue" data-act="result" data-v="W">✅ Ganamos</button><button class="btn red" data-act="result" data-v="L">❌ Perdimos</button></div>';
    else h += '<p class="small">Resultado guardado: <b>' + (d.result === "W" ? "victoria" : "derrota") + "</b>.</p>";
    h += '<div class="row" style="margin-top:14px"><a class="btn ghost" target="_blank" rel="noopener" href="https://claude.ai/new?q=' + encodeURIComponent(claudePrompt(d, ev)) + '">🤖 Analizar con Claude</a></div>';
    h += '<div class="row" style="margin-top:12px"><button class="btn ghost" data-act="again">Otra partida · mismo mapa</button><button class="btn ghost" data-act="home">Cambiar mapa</button></div>';
    h += '<p class="small" style="margin-top:12px">' + esc(mapName(m)) + ": estimación heurística a partir del meta de " + esc(fmtDate(META.meta.fechaDatos)) + ". Úsala como guía, no como verdad absoluta.</p>";
    return h;
  }

  function claudePrompt(d, ev) {
    const m = E.maps[d.mapId], md = META.modos[m.modo];
    const n = (arr) => arr.filter(Boolean).map((id) => E.byId[id].nombre).join(", ") || "—";
    return "Analiza este draft de Brawl Stars (" + META.reglas[d.format].nombre + ", mapa " + mapName(m) + " / " + m.nombre + " · " + md.nombre + "). Meta de referencia: " + META.meta.temporada + ", " + META.meta.parche + ".\n" +
      "Bloqueados: " + n(d.bans.us.concat(d.bans.them)) + "\n" +
      "Primer pick: " + (d.firstPick === "us" ? "nosotros" : "rivales") + "\nNuestro equipo: " + n(d.picks.us) + "\nRival: " + n(d.picks.them) + "\n" +
      "Draft Lab estima " + Math.round(ev.win * 100) + "% de victoria (nota " + ev.us.grade + " vs " + ev.them.grade + ").\n" +
      "Busca en la web el meta actual y dime: 1) quién gana el draft y por qué, 2) plan por carriles y condición de victoria, 3) qué habrías cambiado en bans/picks, 4) qué ajustar para el siguiente set.";
  }

  function sheetSettings() {
    let h = '<h2>⚙️ Ajustes<span class="sp"></span><button class="ib" data-act="close">✕</button></h2>';
    h += '<div class="q">Estilo de recomendación</div><input type="range" min="0" max="1" step="0.05" value="' + S.style + '" data-inp="style"><div class="sub"><span>🛡️ Fuerza en el mapa</span><span>⚔️ Contrarrestar</span></div>';
    h += '<div class="q" style="margin-top:16px">Mis brawlers (nivel 11)</div><p class="small">Marca los que puedes jugar. Las recomendaciones los priorizan.</p>';
    h += '<div class="sub"><span>' + S.pool.length + ' seleccionados</span><span class="tog" data-act="poolonly">Solo mis brawlers <span class="sw ' + (S.poolOnly ? "on" : "") + '"></span></span></div>';
    h += '<div class="grid">' + E.list.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((b) =>
      '<div class="gi ' + (S.pool.indexOf(b.id) >= 0 ? "sel" : "") + '" data-act="pooltoggle" data-v="' + b.id + '">' + por(b) + '<div class="gn">' + esc(b.nombre) + "</div></div>").join("") + "</div>";
    h += '<div class="row" style="margin-top:16px"><button class="btn ghost" data-act="poolclear">Vaciar selección</button><button class="btn ghost" data-act="histclear">Borrar historial</button></div>';
    return h;
  }

  function sheetHistory() {
    const H = S.history;
    let h = '<h2>📈 Historial<span class="sp"></span><button class="ib" data-act="close">✕</button></h2>';
    if (!H.length) return h + '<div class="empty">Aún no hay partidas guardadas. Al terminar una selección, marca si ganaste o perdiste.</div>';
    const W = H.filter((x) => x.result === "W").length;
    const pred = H.filter((x) => (x.win >= 0.5) === (x.result === "W")).length;
    h += '<div class="stats"><div><b>' + H.length + '</b><span>partidas</span></div><div><b>' + Math.round((W / H.length) * 100) + '%</b><span>victorias</span></div><div><b>' + Math.round((pred / H.length) * 100) + "%</b><span>acierto del motor</span></div></div>";
    H.slice().reverse().slice(0, 60).forEach((x) => {
      const m = E.maps[x.mapId];
      h += '<div class="hist"><span class="r ' + x.result + '">' + x.result + "</span>" + x.picks.us.map((id) => por(E.byId[id])).join("") +
        '<div class="m"><b>' + esc(m ? mapName(m) : x.mapId) + "</b>" + new Date(x.t).toLocaleDateString("es-ES") + " · " + Math.round(x.win * 100) + "% · nota " + x.grade + "</div></div>";
    });
    h += '<div class="row" style="margin-top:12px"><button class="btn ghost" data-act="histcopy">📋 Copiar para calibrar con Claude</button></div>';
    return h;
  }

  function sheetChangelog() {
    const m = META.meta;
    let h = '<h2>🗞️ Estado del meta<span class="sp"></span><button class="ib" data-act="close">✕</button></h2>';
    h += '<p class="small"><b>' + esc(m.temporada) + "</b><br>" + esc(m.parche) + "<br>Datos del " + esc(fmtDate(m.fechaDatos)) + " · comprobado " + esc(ago(m.comprobado)) + " · v" + m.version + "<br>" + esc(m.proximoHito || "") + "</p>";
    (m.avisos || []).forEach((a) => (h += '<div class="banner">📣 ' + esc(a) + "</div>"));
    h += '<div class="q" style="margin-top:14px">Cambios</div>';
    (META.changelog || []).slice().reverse().forEach((c) => {
      h += '<div class="cl"><div class="d">' + esc(fmtDate(c.fecha)) + "</div><b>" + esc(c.resumen) + "</b><ul>" + (c.cambios || []).map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
    });
    h += '<div class="q">Fuentes</div><ul class="small">' + (m.fuentes || []).map((f) => '<li><a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.nombre) + "</a></li>").join("") + "</ul>";
    return h;
  }

  // ---------------- eventos ----------------
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-act]");
    if (!t) { if (ev.target.id === "ov") closeSheet(); return; }
    const act = t.dataset.act, v = t.dataset.v;
    if (t.tagName === "A" && act === "changelog") ev.preventDefault();
    switch (act) {
      case "fmt": S.format = v; LS.set("format", v); render(); break;
      case "mode": S.mode = v; LS.set("mode", v); render(); break;
      case "allmaps": S.allMaps = !S.allMaps; LS.set("allMaps", S.allMaps); render(); break;
      case "map": S.draft = newDraft(v); S.undo = []; S.pf.cls = "all"; save(); S.view = "draft"; render(); window.scrollTo(0, 0); loadMapStats(v); break;
      case "start": startPicks(v); break;
      case "resume": S.view = "draft"; render(); loadMapStats(S.draft.mapId); break;
      case "home": S.view = "home"; closeSheet(); render(); window.scrollTo(0, 0); break;
      case "undo": undo(); break;
      case "reset": if (S.draft) { pushUndo(); const n = newDraft(S.draft.mapId); n.format = S.draft.format; S.draft = n; save(); render(); toast("Selección reiniciada"); } break;
      case "again": if (S.draft) { const n = newDraft(S.draft.mapId); n.format = S.draft.format; n.bans = JSON.parse(JSON.stringify(S.draft.bans)); S.draft = n; S.undo = []; save(); S.view = "draft"; closeSheet(); render(); window.scrollTo(0, 0); toast("Nueva partida · mismos bloqueados"); } break;
      case "clear": clearSlot(t.dataset.s, +t.dataset.i); break;
      case "pick": assign(v); break;
      case "banmode": S.draft.banMode = !S.draft.banMode; save(); render(); break;
      case "sort": S.gridSort = S.gridSort === "az" ? "prob" : "az"; LS.set("gridSort", S.gridSort); render(); break;
      case "pcls": S.pf.cls = v; render(); break;
      case "summary": openSheet("summary"); break;
      case "close": closeSheet(); break;
      case "settings": openSheet("settings"); break;
      case "history": openSheet("history"); break;
      case "changelog": openSheet("changelog"); break;
      case "poolonly": S.poolOnly = !S.poolOnly; LS.set("poolOnly", S.poolOnly); renderSheet(); render(); break;
      case "pooltoggle": { const i = S.pool.indexOf(v); if (i >= 0) S.pool.splice(i, 1); else S.pool.push(v); LS.set("pool", S.pool); renderSheet(); break; }
      case "poolclear": S.pool = []; LS.set("pool", S.pool); renderSheet(); break;
      case "histclear": S.history = []; LS.set("history", []); toast("Historial borrado"); break;
      case "result": {
        const d = S.draft; d.result = v; save();
        const ev2 = E.evaluate(est(d));
        S.history.push({ t: Date.now(), mapId: d.mapId, format: d.format, firstPick: d.firstPick, picks: d.picks, bans: d.bans, win: +ev2.win.toFixed(3), grade: ev2.us.grade, result: v, v: META.meta.version });
        LS.set("history", S.history); renderSheet(); toast(v === "W" ? "¡Victoria guardada!" : "Derrota guardada"); break;
      }
      case "histcopy": {
        const txt = "Este es mi historial de partidas de Brawl Stars con Draft Lab (JSON). Analiza en qué mapas y composiciones fallan las recomendaciones y propón ajustes de pesos o de meta.json:\n" + JSON.stringify(S.history);
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Copiado"), () => toast("No se pudo copiar"));
        break;
      }
    }
  });
  document.addEventListener("input", (ev) => {
    const k = ev.target.dataset && ev.target.dataset.inp;
    if (k === "q") {
      S.pf.q = ev.target.value;
      const pos = ev.target.selectionStart;
      renderSheet();
      const i = $(".srch"); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) {} }
    } else if (k === "style") { S.style = +ev.target.value; LS.set("style", S.style); render(true); }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && S.sheet) closeSheet();
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "z" && S.view === "draft") { ev.preventDefault(); undo(); }
  });

  // ---------------- arranque ----------------
  fetch("data/meta.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((j) => {
      META = j;
      E = new DraftEngine(META);
      if (S.draft && (!E.maps[S.draft.mapId] || S.draft.v !== 2)) S.draft = null;
      S.view = "home";
      render();
      loadLive();
    })
    .catch((e) => { $("#app").innerHTML = '<div class="empty">No se pudo cargar data/meta.json (' + esc(e.message) + ")</div>"; });
})();
