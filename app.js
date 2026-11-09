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
    live: { ok: null, maps: {}, nuevos: [] }, sheet: null, pf: { q: "", cls: "all" },
  };

  // ---------------- utilidades visuales ----------------
  function bImg(b) { return b && b.gameId ? CDN + "/brawlers/borderless/" + b.gameId + ".png" : null; }
  function ini(n) { const p = n.replace(/[^A-Za-z0-9 &]/g, "").split(/[ &]+/).filter(Boolean); return (p.length > 1 ? p[0][0] + p[1][0] : n.slice(0, 2)).toUpperCase(); }
  function por(b, cls) {
    if (!b) return "";
    const c = (CLASS[b.clase] || CLASS["?"]).c;
    const src = bImg(b);
    return '<div class="por ' + (cls || "") + '" style="--cc:' + c + '"><span class="ini">' + esc(ini(b.nombre)) + "</span>" +
      (src ? '<img src="' + src + '" alt="' + esc(b.nombre) + '" loading="lazy" decoding="async" onerror="this.remove()">' : "") + "</div>";
  }
  function modeIcon(modo) {
    const m = META.modos[modo];
    return '<span class="memo">' + (MODE_EMOJI[modo] || "🎮") + "</span>";
  }
  function mapImg(m) {
    const lm = S.live.maps[norm(m.nombre)];
    return lm && lm.img ? lm.img : null;
  }
  function mapArt(m, big) {
    const src = mapImg(m);
    return (src ? '<img src="' + src + '" alt="" loading="lazy" onerror="this.remove()">' : "") +
      (src ? "" : '<div class="fb">' + (MODE_EMOJI[m.modo] || "🎮") + "</div>");
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
  }

  async function loadLive() {
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
    if (!m) return;
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

  // ---------------- draft ----------------
  function newDraft(mapId, firstPick) {
    return {
      mapId, firstPick, format: S.format, phase: S.format === "bsc" ? "gbans" : "bans",
      bans: { us: [null, null, null], them: [null, null, null] },
      globalBans: { us: [null, null], them: [null, null] },
      picks: { us: [null, null, null], them: [null, null, null] },
      active: null, flash: null, t: Date.now(), result: null,
    };
  }
  function est(d) {
    return { format: d.format, mapId: d.mapId, firstPick: d.firstPick, bans: d.bans, globalBans: d.globalBans, picks: d.picks,
      pool: S.pool, poolOnly: S.poolOnly, style: S.style };
  }
  function autoActive(d) {
    if (d.phase === "gbans") {
      const A = d.firstPick, B = other(A), ord = [B, A, A, B], cnt = { us: 0, them: 0 };
      for (const side of ord) { const i = cnt[side]++; if (!d.globalBans[side][i]) return { kind: "gban", side, slot: i }; }
      return null;
    }
    if (d.phase === "bans") {
      for (const side of ["us", "them"]) for (let i = 0; i < 3; i++) if (!d.bans[side][i]) return { kind: "ban", side, slot: i };
      return null;
    }
    if (d.phase === "picks") {
      const np = E.nextPick(est(d));
      return np ? { kind: "pick", side: np.side, slot: np.slot, index: np.index } : null;
    }
    return null;
  }
  function advance(d) {
    let a = autoActive(d);
    while (!a && d.phase !== "done") {
      d.phase = d.phase === "gbans" ? "bans" : d.phase === "bans" ? "picks" : "done";
      a = autoActive(d);
    }
    d.active = a;
  }
  function save() { LS.set("draft", S.draft); }
  function pushUndo() { S.undo.push(JSON.stringify(S.draft)); if (S.undo.length > 40) S.undo.shift(); }
  function arrFor(d, a) { return a.kind === "pick" ? d.picks[a.side] : a.kind === "ban" ? d.bans[a.side] : d.globalBans[a.side]; }

  function assign(id) {
    const d = S.draft;
    if (!d || !d.active) return;
    pushUndo();
    const a = d.active;
    arrFor(d, a)[a.slot] = id;
    d.flash = { kind: a.kind, side: a.side, slot: a.slot };
    advance(d);
    save();
    closeSheet();
    render();
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    if (d.phase === "done") setTimeout(() => openSheet("summary"), 450);
  }
  function selectSlot(kind, side, slot) {
    const d = S.draft;
    const a = { kind, side, slot };
    const arr = arrFor(d, a);
    if (arr[slot]) {
      pushUndo();
      arr[slot] = null;
      if (d.phase === "done") d.phase = kind === "pick" ? "picks" : kind === "ban" ? "bans" : "gbans";
      if (kind === "pick" && d.phase !== "picks") d.phase = "picks";
      d.active = a; d.flash = null; save(); render();
      return;
    }
    if (kind === "pick" && d.phase !== "picks") d.phase = "picks";
    if (kind === "ban" && d.phase === "gbans") d.phase = "bans";
    d.active = a; d.flash = null; save(); render();
    openSheet("picker");
  }
  function undo() {
    if (!S.undo.length) return toast("Nada que deshacer");
    S.draft = JSON.parse(S.undo.pop()); S.draft.flash = null; save(); render();
  }
  function skipPhase() {
    const d = S.draft; pushUndo();
    d.phase = d.phase === "gbans" ? "bans" : "picks";
    advance(d); save(); render();
  }

  function available(d, a) {
    const st = est(d);
    if (a.kind === "pick") return (id) => !E.unavailable(st).has(id);
    const taken = new Set();
    ["us", "them"].forEach((k) => { d.picks[k].forEach((x) => x && taken.add(x)); d.globalBans[k].forEach((x) => x && taken.add(x)); });
    (a.kind === "ban" ? d.bans[a.side] : d.globalBans[a.side]).forEach((x) => x && taken.add(x));
    if (a.kind === "gban") d.globalBans[other(a.side)].forEach((x) => x && taken.add(x));
    return (id) => !taken.has(id);
  }
  function recsFor(d, n) {
    const a = d.active;
    if (!a) return [];
    const st = est(d);
    if (a.kind === "pick") return E.recommendPicks(st, a.side, n);
    const ok = available(d, a);
    return E.recommendBans(st, a.side).filter((r) => ok(r.b.id)).slice(0, n || 999);
  }

  // ---------------- render: home ----------------
  function render(skipSheet) {
    if (!META) return;
    const app = $("#app");
    if (S.draft && S.view === "draft") app.innerHTML = renderDraft();
    else { S.view = "home"; app.innerHTML = renderHome(); }
    if (!skipSheet && S.sheet && S.sheet !== "picker") renderSheet();
  }

  function metaPill() {
    const m = META.meta;
    const dot = S.live.ok === true ? "on" : S.live.ok === false ? "off" : "";
    const live = S.live.ok === true ? "Brawlify en vivo" : S.live.ok === false ? "Sin datos en vivo" : "Conectando…";
    return '<div class="metapill" data-act="changelog"><span class="dot ' + dot + '"></span><b>' + esc(m.temporada) + "</b>" +
      "<span>· meta del " + esc(fmtDate(m.fechaDatos)) + " · comprobado " + esc(ago(m.comprobado)) + "</span><span>· " + live + "</span></div>";
  }

  function renderHome() {
    const pool = S.format === "bsc" ? "bsc" : "ranked";
    let maps = META.mapas.filter((m) => S.allMaps || m.pools.indexOf(pool) >= 0);
    if (S.mode !== "all") maps = maps.filter((m) => m.modo === S.mode);
    let h = '<div class="top"><div class="logo">DRAFT LAB<small>BRAWL STARS · PICK &amp; BAN</small></div><div class="sp"></div>' +
      '<button class="ib" data-act="history" title="Historial">📈</button><button class="ib" data-act="settings" title="Ajustes y pool">⚙️</button></div>';
    h += metaPill();
    (META.meta.avisos || []).slice(0, 1).forEach((a) => (h += '<div class="banner">📣 ' + esc(a) + "</div>"));
    if (S.live.nuevos.length)
      h += '<div class="banner new">🆕 Brawlers nuevos sin datos de meta: <b>' + S.live.nuevos.map((b) => esc(b.nombre)).join(", ") +
        "</b>. Aparecen como neutrales hasta la próxima actualización.</div>";
    if (S.draft && S.draft.phase !== "done") {
      const m = E.maps[S.draft.mapId];
      if (m) h += '<div class="banner" data-act="resume" style="cursor:pointer">⏯️ Tienes un draft a medias en <b>' + esc(m.nombre) + "</b>. Toca para continuar.</div>";
    }
    h += '<div class="seg"><button data-act="fmt" data-v="ranked" class="' + (S.format === "ranked" ? "on" : "") + '">🏆 Ranked</button>' +
      '<button data-act="fmt" data-v="bsc" class="' + (S.format === "bsc" ? "on" : "") + '">🎙️ Pro · BSC</button></div>';
    h += '<div class="chips"><button class="chip ' + (S.mode === "all" ? "on" : "") + '" data-act="mode" data-v="all">Todos</button>';
    MODE_ORDER.forEach((k) => {
      const md = META.modos[k];
      h += '<button class="chip ' + (S.mode === k ? "on" : "") + '" style="--mc:' + md.color + '" data-act="mode" data-v="' + k + '">' + modeIcon(k) + esc(md.nombre) + "</button>";
    });
    h += "</div>";
    h += '<div class="sub"><span>' + maps.length + " mapas · " + (S.format === "bsc" ? "pool oficial BSC 2026" : "rotación Ranked actual") + "</span>" +
      '<span class="tog" data-act="allmaps">Todos los mapas <span class="sw ' + (S.allMaps ? "on" : "") + '"></span></span></div>';
    MODE_ORDER.forEach((k) => {
      const ms = maps.filter((m) => m.modo === k);
      if (!ms.length) return;
      const md = META.modos[k];
      h += '<div class="mode-h disp" style="--mc:' + md.color + '">' + modeIcon(k) + esc(md.nombre) + '<span class="bar"></span></div><div class="maps">';
      ms.forEach((m) => {
        h += '<div class="map" style="--mc:' + md.color + '" data-act="map" data-v="' + m.id + '"><div class="art">' + mapArt(m) + '</div><div class="shade"></div><div class="info">' +
          '<div class="nm">' + esc(m.nombre) + '</div><div class="tags"><span class="tg m">' + esc(md.nombre) + '</span><span class="tg">' + esc(m.arquetipo) + "</span>" +
          (m.pools.indexOf("bsc") >= 0 ? '<span class="tg bsc">BSC</span>' : "") + '</div><div class="minis">' +
          (m.top.length ? m.top.slice(0, 4).map((id) => por(E.byId[id])).join("") : E.recommendBans({ format: S.format, mapId: m.id, firstPick: "us", bans: { us: [], them: [] }, globalBans: { us: [], them: [] }, picks: { us: [], them: [] } }, "us", 4).map((r) => por(r.b)).join("")) +
          "</div></div></div>";
      });
      h += "</div>";
    });
    if (!maps.length) h += '<div class="empty">No hay mapas de este modo en este pool. Activa «Todos los mapas».</div>';
    h += '<div class="foot">Meta: ' + esc(META.meta.parche) + " · v" + META.meta.version + '<br>Imágenes: Brawlify CDN · No afiliado a Supercell<br><a href="#" data-act="changelog">Novedades y fuentes</a></div>';
    return h;
  }

  // ---------------- render: draft ----------------
  function renderDraft() {
    const d = S.draft;
    const m = E.maps[d.mapId];
    const md = META.modos[m.modo];
    const rules = META.reglas[d.format];
    const img = mapImg(m);
    let h = '<div class="dbg">' + (img ? '<img src="' + img + '" alt="">' : "") + "</div>";
    h += '<div class="dh"><button class="ib" data-act="home">←</button><div class="t"><div class="nm">' + esc(m.nombre) + '</div><div class="md">' + modeIcon(m.modo) +
      esc(md.nombre) + " · " + esc(rules.nombre) + "</div></div>" +
      '<button class="ib" data-act="undo" title="Deshacer">↶</button><button class="ib" data-act="reset" title="Reiniciar">⟲</button></div>';
    const phases = d.format === "bsc" ? [["gbans", "Bans globales"], ["bans", "Bans"], ["picks", "Picks"], ["done", "Resumen"]] : [["bans", "Bans"], ["picks", "Picks"], ["done", "Resumen"]];
    const pi = phases.findIndex((p) => p[0] === d.phase);
    h += '<div class="steps">' + phases.map((p, i) => '<div class="' + (i === pi ? "on" : i < pi ? "ok" : "") + '">' + (i < pi ? "✓ " : "") + p[1] + "</div>").join("") + "</div>";

    const a = d.active;
    if (a) {
      const us = a.side === "us";
      const big = a.kind === "pick" ? (us ? "TU PICK" : "PICK RIVAL") : a.kind === "gban" ? (us ? "TU BAN GLOBAL" : "BAN GLOBAL RIVAL") : us ? "TU BAN" : "BAN RIVAL";
      const sm = a.kind === "pick" ? (us ? "Elige y bloquea en el juego" : "Marca lo que han elegido") : a.kind === "ban" ? (us ? "Los baneos son simultáneos" : "Marca sus baneos cuando se revelen") : "Para toda la serie";
      h += '<div class="turn" style="--tc:' + (us ? "var(--us)" : "var(--them)") + '"><div class="num">' + (a.kind === "pick" ? a.index + 1 : "🚫") + '</div><div><div class="big">' + big + '</div><div class="sm">' + sm + "</div></div>" +
        '<div class="sp"></div>' + (d.phase !== "picks" ? '<button class="skip" data-act="skip">Saltar →</button>' : "") +
        (a.kind === "pick" ? '<div class="timer" style="animation-duration:' + (rules.segundosPorPick || 20) + 's"></div>' : "") + "</div>";
    } else if (d.phase === "done") {
      const ev = E.evaluate(est(d));
      h += '<div class="turn" style="--tc:var(--gold)" data-act="summary"><div class="num">🏁</div><div><div class="big">DRAFT CERRADO</div><div class="sm">Probabilidad estimada ' + Math.round(ev.win * 100) + "% · toca para ver el plan</div></div></div>";
    }

    h += '<div class="dwrap"><div class="board">' + teamCol(d, "us") + teamCol(d, "them") + "</div><div>";
    if (a) {
      const recs = recsFor(d, 5);
      const ttl = a.kind === "pick" ? (a.side === "us" ? "Mejores picks para ti" : "Lo que probablemente elijan") : a.side === "us" ? "Bans recomendados" : "Bans probables del rival";
      h += '<div class="recs"><h2>' + (a.side === "us" ? "🧠" : "🔮") + " " + ttl + '<span class="sp"></span></h2>';
      recs.forEach((r, i) => (h += recCard(r, i, a)));
      h += '<button class="more" data-act="picker">Ver todos los brawlers</button></div>';
    } else if (d.phase === "done") {
      h += '<div class="recs"><h2>🏁 Draft completo</h2><div class="row"><button class="btn" data-act="summary">Ver análisis y plan</button></div>' +
        '<div class="row" style="margin-top:12px"><button class="btn ghost" data-act="again">Otro set · mismo mapa</button><button class="btn ghost" data-act="home">Cambiar mapa</button></div></div>';
    }
    h += "</div></div>";
    return h;
  }

  function teamCol(d, side) {
    const us = side === "us";
    const ord = E.order(est(d));
    const nums = []; ord.forEach((s, i) => { if (s === side) nums.push(i + 1); });
    const a = d.active || {};
    let h = '<div class="team ' + side + '"><h3>' + (us ? "🔵 Nosotros" : "🔴 Rivales") + (d.firstPick === side ? ' <span class="tg">1er pick</span>' : "") + "</h3>";
    if (d.format === "bsc") {
      h += '<div class="lbl">Bans globales</div><div class="bans">';
      d.globalBans[side].forEach((id, i) => (h += banSlot(d, "gban", side, i, id, a)));
      h += "</div>";
    }
    h += '<div class="lbl">Bans</div><div class="bans">';
    d.bans[side].forEach((id, i) => (h += banSlot(d, "ban", side, i, id, a)));
    h += '</div><div class="lbl">Picks</div>';
    d.picks[side].forEach((id, i) => {
      const b = id && E.byId[id];
      const act = a.kind === "pick" && a.side === side && a.slot === i;
      const fl = d.flash && d.flash.kind === "pick" && d.flash.side === side && d.flash.slot === i;
      h += '<div class="pslot ' + (b ? "f " : "") + (act ? "act " : "") + (fl ? "flash" : "") + '" data-act="slot" data-k="pick" data-s="' + side + '" data-i="' + i + '"><span class="o">' + nums[i] + "</span>" +
        (b ? por(b) + '<div><div class="n">' + esc(b.nombre) + '</div><div class="c">' + esc((CLASS[b.clase] || CLASS["?"]).n) + "</div></div>" : '<div class="e">＋</div><div class="c">' + (act ? "Eligiendo…" : "Vacío") + "</div>") + "</div>";
    });
    return h + "</div>";
  }
  function banSlot(d, kind, side, i, id, a) {
    const b = id && E.byId[id];
    const act = a.kind === kind && a.side === side && a.slot === i;
    const fl = d.flash && d.flash.kind === kind && d.flash.side === side && d.flash.slot === i;
    return '<div class="bslot ' + (b ? "f " : "") + (act ? "act " : "") + (fl ? "stamp" : "") + '" data-act="slot" data-k="' + kind + '" data-s="' + side + '" data-i="' + i + '">' +
      (b ? por(b) + '<span class="x">✕</span>' : "+") + "</div>";
  }
  function recCard(r, i, a) {
    const b = r.b, p = r.parts;
    const pct = Math.round(Math.max(0, Math.min(1, r.score)) * 100);
    const bar = (lab, v) => "<div>" + lab + "<i><b style=\"width:" + Math.round((v || 0) * 100) + '%"></b></i></div>';
    const col = a.side === "us" ? "var(--gold)" : "var(--them)";
    return '<div class="rc ' + (i === 0 && a.side === "us" ? "first" : "") + '" data-act="pick" data-v="' + b.id + '">' + por(b) +
      '<div class="mid"><div class="n">' + esc(b.nombre) + ' <span class="cls" style="--cc:' + (CLASS[b.clase] || CLASS["?"]).c + '">' + esc((CLASS[b.clase] || CLASS["?"]).n) + "</span></div>" +
      '<div class="rs">' + r.reasons.map((x) => '<span class="' + x.k + '">' + esc(x.t) + "</span>").join("") + "</div>" +
      (a.kind === "pick" ? '<div class="bars">' + bar("Mapa", p.map) + bar("Counter", p.counter) + bar("Seguro", p.safe) + bar("Sinergia", p.syn) + "</div>" : "") +
      '</div><div class="ring" style="--p:' + pct + ";--rcol:" + col + '"><span>' + pct + "</span></div></div>";
  }

  // ---------------- sheets ----------------
  function openSheet(name, arg) { S.sheet = name; S.sheetArg = arg; if (name === "picker") S.pf = { q: "", cls: "all" }; renderSheet(); $("#ov").classList.add("on"); $("#sheet").classList.add("on"); }
  function closeSheet() { S.sheet = null; $("#ov").classList.remove("on"); $("#sheet").classList.remove("on"); }

  function renderSheet() {
    const el = $("#sheet");
    let h = '<div class="grab"></div>';
    if (S.sheet === "setup") h += sheetSetup();
    else if (S.sheet === "picker") h += sheetPicker();
    else if (S.sheet === "summary") h += sheetSummary();
    else if (S.sheet === "settings") h += sheetSettings();
    else if (S.sheet === "history") h += sheetHistory();
    else if (S.sheet === "changelog") h += sheetChangelog();
    el.innerHTML = h;
    if (S.sheet === "picker") { const i = $(".srch", el); if (i && !matchMedia("(pointer:coarse)").matches) i.focus(); }
  }

  function sheetSetup() {
    const m = E.maps[S.sheetArg];
    const md = META.modos[m.modo];
    let h = '<div class="hero" style="--mc:' + md.color + '">' + mapArt(m) + '<div class="cap"><div class="nm">' + esc(m.nombre) + '</div><div class="small">' + modeIcon(m.modo) + " " + esc(md.nombre) + " · mapa " + esc(m.arquetipo) + (m.arbustos ? " con arbustos" : "") + "</div></div></div>";
    if (m.top.length) h += '<div class="q">Los más fuertes ahora</div><div class="minis" style="display:flex;gap:6px;margin-bottom:14px">' + m.top.map((id) => por(E.byId[id])).join("") + "</div>";
    h += '<div class="q">¿Quién tiene el primer pick?</div><div class="row"><button class="btn blue" data-act="start" data-v="us">🔵 Nosotros</button><button class="btn red" data-act="start" data-v="them">🔴 Rivales</button></div>';
    if (S.format === "bsc") h += '<p class="small">En formato pro, el equipo con primer pick es el equipo A (bans globales B→A→A→B).</p>';
    return h;
  }

  function sheetPicker() {
    const d = S.draft; const a = d.active;
    if (!a) return '<div class="empty">Elige un hueco del tablero.</div>';
    const ok = available(d, a);
    const scored = a.kind === "pick" ? E.recommendPicks(est(d), a.side) : E.recommendBans(est(d), a.side);
    const sc = {}; scored.forEach((r) => (sc[r.b.id] = r.score));
    const q = norm(S.pf.q);
    let list = E.list.slice().filter((b) => (S.pf.cls === "all" || b.clase === S.pf.cls) && (!q || norm(b.nombre).indexOf(q) >= 0));
    list.sort((x, y) => (ok(y.id) - ok(x.id)) || ((sc[y.id] || 0) - (sc[x.id] || 0)));
    const ttl = (a.kind === "pick" ? "Pick " : a.kind === "gban" ? "Ban global " : "Ban ") + (a.side === "us" ? "nuestro" : "rival");
    let h = '<h2>' + (a.side === "us" ? "🔵 " : "🔴 ") + ttl + '<span class="sp"></span><button class="ib" data-act="close">✕</button></h2>';
    h += '<input class="srch" placeholder="Buscar brawler…" value="' + esc(S.pf.q) + '" data-inp="q" autocomplete="off">';
    h += '<div class="chips" style="margin-top:10px"><button class="chip ' + (S.pf.cls === "all" ? "on" : "") + '" data-act="pcls" data-v="all">Todas</button>';
    Object.keys(CLASS).filter((k) => k !== "?").forEach((k) => (h += '<button class="chip ' + (S.pf.cls === k ? "on" : "") + '" style="--mc:' + CLASS[k].c + '" data-act="pcls" data-v="' + k + '">' + CLASS[k].n + "</button>"));
    h += '</div><div class="grid" id="pgrid">' + list.map((b) => {
      const can = ok(b.id);
      const s = sc[b.id];
      return '<div class="gi ' + (can ? "" : "off ") + (b.nuevo ? "new" : "") + '" data-act="pick" data-v="' + b.id + '">' + (can && s != null ? '<span class="sc">' + Math.round(s * 100) + "</span>" : "") + por(b) + '<div class="gn">' + esc(b.nombre) + "</div></div>";
    }).join("") + "</div>";
    return h;
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
    let h = '<h2>📊 Análisis del draft<span class="sp"></span><button class="ib" data-act="close">✕</button></h2>';
    h += '<div class="wp"><div class="lab"><span class="u">' + w + '%</span><span class="small" style="align-self:center">probabilidad estimada</span><span class="t">' + (100 - w) + '%</span></div><div class="bar"><div class="a" style="width:' + w + '%"></div><div class="b" style="width:' + (100 - w) + '%"></div></div></div>';
    const team = (k) => d.picks[k].filter(Boolean).map((id) => por(E.byId[id])).join("");
    h += '<div class="grades"><div class="grade us"><div class="small">Nuestro draft</div><div class="g">' + ev.us.grade + '</div><div class="tm">' + team("us") + '</div></div><div class="grade them"><div class="small">Rival</div><div class="g">' + ev.them.grade + '</div><div class="tm">' + team("them") + "</div></div></div>";
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
    h += '<div class="row" style="margin-top:12px"><button class="btn ghost" data-act="again">Otro set · mismo mapa</button><button class="btn ghost" data-act="home">Cambiar mapa</button></div>';
    h += '<p class="small" style="margin-top:12px">' + esc(m.nombre) + ": estimación heurística a partir del meta de " + esc(fmtDate(META.meta.fechaDatos)) + ". Úsala como guía, no como verdad absoluta.</p>";
    return h;
  }

  function claudePrompt(d, ev) {
    const m = E.maps[d.mapId], md = META.modos[m.modo];
    const n = (arr) => arr.filter(Boolean).map((id) => E.byId[id].nombre).join(", ") || "—";
    return "Analiza este draft de Brawl Stars (" + META.reglas[d.format].nombre + ", mapa " + m.nombre + " · " + md.en + "). Meta de referencia: " + META.meta.temporada + ", " + META.meta.parche + ".\n" +
      (d.format === "bsc" ? "Bans globales nuestros: " + n(d.globalBans.us) + " · rivales: " + n(d.globalBans.them) + "\n" : "") +
      "Bans nuestros: " + n(d.bans.us) + " · bans rivales: " + n(d.bans.them) + "\n" +
      "Primer pick: " + (d.firstPick === "us" ? "nosotros" : "rivales") + "\nNuestro equipo: " + n(d.picks.us) + "\nRival: " + n(d.picks.them) + "\n" +
      "Draft Lab estima " + Math.round(ev.win * 100) + "% de victoria (nota " + ev.us.grade + " vs " + ev.them.grade + ").\n" +
      "Busca en la web el meta actual y dime: 1) quién gana el draft y por qué, 2) plan por carriles y condición de victoria, 3) qué habrías cambiado en bans/picks, 4) qué ajustar para el siguiente set.";
  }

  function sheetSettings() {
    let h = '<h2>⚙️ Ajustes<span class="sp"></span><button class="ib" data-act="close">✕</button></h2>';
    h += '<div class="q">Estilo de recomendación</div><input type="range" min="0" max="1" step="0.05" value="' + S.style + '" data-inp="style"><div class="sub"><span>🛡️ Fuerza en el mapa</span><span>⚔️ Counter puro</span></div>';
    h += '<div class="q" style="margin-top:16px">Mi pool de brawlers (Power 11)</div><p class="small">Marca los que puedes jugar. Las recomendaciones los priorizan.</p>';
    h += '<div class="sub"><span>' + S.pool.length + ' seleccionados</span><span class="tog" data-act="poolonly">Solo mi pool <span class="sw ' + (S.poolOnly ? "on" : "") + '"></span></span></div>';
    h += '<div class="grid">' + E.list.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((b) =>
      '<div class="gi ' + (S.pool.indexOf(b.id) >= 0 ? "sel" : "") + '" data-act="pooltoggle" data-v="' + b.id + '">' + por(b) + '<div class="gn">' + esc(b.nombre) + "</div></div>").join("") + "</div>";
    h += '<div class="row" style="margin-top:16px"><button class="btn ghost" data-act="poolclear">Vaciar pool</button><button class="btn ghost" data-act="histclear">Borrar historial</button></div>';
    return h;
  }

  function sheetHistory() {
    const H = S.history;
    let h = '<h2>📈 Historial<span class="sp"></span><button class="ib" data-act="close">✕</button></h2>';
    if (!H.length) return h + '<div class="empty">Aún no hay drafts guardados. Al terminar un draft, marca si ganaste o perdiste.</div>';
    const W = H.filter((x) => x.result === "W").length;
    const pred = H.filter((x) => (x.win >= 0.5) === (x.result === "W")).length;
    h += '<div class="stats"><div><b>' + H.length + '</b><span>drafts</span></div><div><b>' + Math.round((W / H.length) * 100) + '%</b><span>victorias</span></div><div><b>' + Math.round((pred / H.length) * 100) + "%</b><span>acierto del motor</span></div></div>";
    H.slice().reverse().slice(0, 60).forEach((x) => {
      const m = E.maps[x.mapId];
      h += '<div class="hist"><span class="r ' + x.result + '">' + x.result + "</span>" + x.picks.us.map((id) => por(E.byId[id])).join("") +
        '<div class="m"><b>' + esc(m ? m.nombre : x.mapId) + "</b>" + new Date(x.t).toLocaleDateString("es-ES") + " · " + Math.round(x.win * 100) + "% · nota " + x.grade + "</div></div>";
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
      case "map": openSheet("setup", v); break;
      case "start": {
        S.draft = newDraft(S.sheetArg, v); S.undo = []; advance(S.draft); save(); S.view = "draft"; closeSheet(); render(); window.scrollTo(0, 0);
        loadMapStats(S.draft.mapId); break;
      }
      case "resume": S.view = "draft"; render(); loadMapStats(S.draft.mapId); break;
      case "home": S.view = "home"; closeSheet(); render(); window.scrollTo(0, 0); break;
      case "undo": undo(); break;
      case "reset": if (S.draft) { pushUndo(); const n = newDraft(S.draft.mapId, S.draft.firstPick); n.format = S.draft.format; n.phase = n.format === "bsc" ? "gbans" : "bans"; S.draft = n; advance(n); save(); render(); toast("Draft reiniciado"); } break;
      case "again": if (S.draft) { const n = newDraft(S.draft.mapId, other(S.draft.firstPick)); n.format = S.draft.format; n.phase = "bans"; if (n.format === "bsc") n.globalBans = JSON.parse(JSON.stringify(S.draft.globalBans)); S.draft = n; S.undo = []; advance(n); save(); S.view = "draft"; closeSheet(); render(); toast("Nuevo set · primer pick cambiado"); } break;
      case "skip": skipPhase(); break;
      case "slot": selectSlot(t.dataset.k, t.dataset.s, +t.dataset.i); break;
      case "picker": openSheet("picker"); break;
      case "pick": assign(v); break;
      case "pcls": S.pf.cls = v; renderSheet(); break;
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
        const txt = "Este es mi historial de drafts de Brawl Stars con Draft Lab (JSON). Analiza en qué mapas y composiciones fallan las recomendaciones y propón ajustes de pesos o de meta.json:\n" + JSON.stringify(S.history);
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
    if (ev.key === "Enter" && S.sheet === "picker") { const f = $("#pgrid .gi:not(.off)"); if (f) assign(f.dataset.v); }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "z" && S.view === "draft") { ev.preventDefault(); undo(); }
  });

  // ---------------- arranque ----------------
  fetch("data/meta.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((j) => {
      META = j;
      E = new DraftEngine(META);
      if (S.draft && (!E.maps[S.draft.mapId] || !S.draft.picks)) S.draft = null;
      S.view = "home";
      render();
      loadLive();
    })
    .catch((e) => { $("#app").innerHTML = '<div class="empty">No se pudo cargar data/meta.json (' + esc(e.message) + ")</div>"; });
})();
