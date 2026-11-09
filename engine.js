/* DRAFT LAB · motor de recomendación (sin red, instantáneo).
   Todo lo que depende del meta sale de data/meta.json; este archivo solo contiene la lógica. */
(function (root) {
  "use strict";

  const TIER_V = { "S+": 1.0, S: 0.85, A: 0.7, B: 0.52, C: 0.36, D: 0.2, "?": 0.45 };

  // Ventaja unilateral de la clase fila sobre la clase columna (se antisimetriza en matchup)
  const CLS = {
    TK: { MK: 0.25, AR: 0.35, SP: 0.15, AS: 0.1, CT: -0.2 },
    AS: { MK: 0.45, AR: 0.55, SP: 0.25, DD: 0.05, TK: -0.3, CT: -0.25 },
    MK: { AR: 0.25, TK: 0.15, DD: 0.1, SP: 0.1, CT: 0.05 },
    AR: { TK: 0.2, DD: 0.15, CT: 0.1, SP: 0.05 },
    CT: { AS: 0.35, TK: 0.25, DD: 0.1 },
    DD: { TK: 0.1, AS: 0.05, SP: 0.05 },
    SP: {},
  };

  const NEED_LABEL = {
    rango: "rango", burst: "burst", control: "control", aguante: "aguante",
    rompeMuros: "rompe-muros", frontal: "frontal", zona: "control de zona",
    dps: "DPS al cofre", defensa: "defensa", seguridad: "seguridad",
  };

  const has = (b, t) => b.tags.indexOf(t) >= 0;

  function fills(b, need) {
    switch (need) {
      case "rango": return b.alcance >= 4;
      case "burst": return has(b, "B") || b.clase === "MK";
      case "control": return has(b, "C") || has(b, "Z") || b.clase === "CT";
      case "aguante": return b.clase === "TK" || has(b, "S") || has(b, "H");
      case "rompeMuros": return has(b, "W") || b.clase === "AR";
      case "frontal": return b.clase === "TK" || (b.clase === "AS" && has(b, "M"));
      case "zona": return has(b, "Z") || b.clase === "CT";
      case "dps": return b.clase === "DD" || b.clase === "AS" || has(b, "B");
      case "defensa": return has(b, "D") || has(b, "C") || b.clase === "CT" || b.clase === "TK";
      case "seguridad": return b.alcance >= 4 || has(b, "H");
    }
    return false;
  }

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const POS_W = [
    { map: 0.5, counter: 0.0, safe: 0.25, syn: 0.1, deny: 0.15 },
    { map: 0.4, counter: 0.2, safe: 0.2, syn: 0.12, deny: 0.08 },
    { map: 0.38, counter: 0.24, safe: 0.16, syn: 0.14, deny: 0.08 },
    { map: 0.34, counter: 0.3, safe: 0.12, syn: 0.18, deny: 0.06 },
    { map: 0.32, counter: 0.34, safe: 0.08, syn: 0.22, deny: 0.04 },
    { map: 0.3, counter: 0.45, safe: 0.0, syn: 0.25, deny: 0.0 },
  ];

  function Engine(meta) {
    this.meta = meta;
    this.byId = {};
    this.list = [];
    meta.brawlers.forEach((b) => this.add(b));
    this.maps = {};
    meta.mapas.forEach((m) => (this.maps[m.id] = m));
    this.ov = {};
    (meta.counters || []).forEach(([a, b, v]) => {
      this.ov[a + ">" + b] = (this.ov[a + ">" + b] || 0) + v;
      this.ov[b + ">" + a] = (this.ov[b + ">" + a] || 0) - v;
    });
    this.live = { stats: {} }; // stats[mapId][gameId] = {wr, use}
    this._cache = {};
  }

  Engine.prototype.add = function (b) {
    if (this.byId[b.id]) return;
    this.byId[b.id] = b;
    this.list.push(b);
  };

  Engine.prototype.setLiveStats = function (mapId, stats) {
    this.live.stats[mapId] = stats;
    this._cache = {};
  };

  Engine.prototype.matchup = function (a, b, map) {
    if (a === b) return 0;
    const key = a.id + ">" + b.id + "@" + (map ? map.id : "");
    if (key in this._cache) return this._cache[key];
    let v = ((CLS[a.clase] || {})[b.clase] || 0) - ((CLS[b.clase] || {})[a.clase] || 0);
    v *= 0.6;
    if (has(a, "T") && b.clase === "TK") v += 0.3;
    if (has(b, "T") && a.clase === "TK") v -= 0.3;
    if (has(a, "D") && (b.clase === "AS" || (b.clase === "TK" && has(b, "M")))) v += 0.25;
    if (has(b, "D") && (a.clase === "AS" || (a.clase === "TK" && has(a, "M")))) v -= 0.25;
    if (map) {
      const k = map.arquetipo === "abierto" ? 0.06 : map.arquetipo === "mixto" ? 0.04 : 0.02;
      v += k * (a.alcance - b.alcance);
      if (map.arquetipo === "cerrado") {
        if (a.clase === "AR" && b.alcance <= 2 && !has(b, "W")) v += 0.1;
        if (b.clase === "AR" && a.alcance <= 2 && !has(a, "W")) v -= 0.1;
      }
      if (map.arbustos) {
        if (a.clase === "AS" && b.clase !== "AS") v += 0.05;
        if (b.clase === "AS" && a.clase !== "AS") v -= 0.05;
      }
    }
    v += this.ov[a.id + ">" + b.id] || 0;
    v = clamp(v, -1, 1);
    this._cache[key] = v;
    return v;
  };

  Engine.prototype.liveFor = function (b, map) {
    const s = map && this.live.stats[map.id];
    if (!s || !b.gameId) return null;
    return s[b.gameId] || null;
  };

  Engine.prototype.mapFit = function (b, map) {
    if (!map) return TIER_V[b.tier] || 0.45;
    const modo = this.meta.modos[map.modo] || {};
    const idx = map.top.indexOf(b.id);
    let v;
    if (idx >= 0) v = 1.0 - 0.05 * idx;
    else {
      v = (TIER_V[b.tier] || 0.45) * 0.6 + 0.12;
      if (map.arquetipo === "abierto") v += (b.alcance - 3) * 0.05;
      if (map.arquetipo === "cerrado") {
        if (b.clase === "AR") v += 0.08;
        if (has(b, "W")) v += 0.04;
        if (b.clase === "MK" && b.alcance >= 5) v -= 0.05;
      }
      if (map.arbustos) {
        if (b.clase === "AS") v += 0.04;
        if (has(b, "D")) v += 0.02;
      }
    }
    v += (modo.sesgoClase || {})[b.clase] || 0;
    if ((modo.mejores || []).indexOf(b.id) >= 0) v += 0.06;
    const lv = this.liveFor(b, map);
    if (lv && lv.wr != null) {
      // Datos en vivo de Brawlify: pesan un 35 %; el ranking Ranked de meta.json sigue mandando
      const ls = clamp((lv.wr - 42) / 18, 0, 1);
      v = v * 0.65 + ls * 0.35;
    }
    return clamp(v, 0, 1);
  };

  // ---------- estado del draft ----------
  // state = { format, mapId, firstPick:'us'|'them', bans:{us:[],them:[]}, globalBans:{us:[],them:[]},
  //           picks:{us:[],them:[]}, pool:[ids], poolOnly:bool, style:0..1 }
  Engine.prototype.unavailable = function (st) {
    const s = new Set();
    ["us", "them"].forEach((k) => {
      (st.bans[k] || []).forEach((x) => x && s.add(x));
      ((st.globalBans || {})[k] || []).forEach((x) => x && s.add(x));
      (st.picks[k] || []).forEach((x) => x && s.add(x));
    });
    (st.restricted || []).forEach((x) => s.add(x));
    return s;
  };

  Engine.prototype.order = function (st) {
    const o = (this.meta.reglas[st.format] || this.meta.reglas.ranked).ordenPicks;
    const A = st.firstPick === "them" ? "them" : "us";
    const Bs = A === "us" ? "them" : "us";
    return o.map((x) => (x === "A" ? A : Bs));
  };

  Engine.prototype.nextPick = function (st) {
    const ord = this.order(st);
    const cnt = { us: 0, them: 0 };
    for (let i = 0; i < ord.length; i++) {
      const side = ord[i];
      const slot = cnt[side]++;
      if (!st.picks[side][slot]) return { index: i, side, slot };
    }
    return null;
  };

  Engine.prototype.remainingAfter = function (st, side, index) {
    const ord = this.order(st);
    const other = side === "us" ? "them" : "us";
    let n = 0;
    for (let i = index + 1; i < ord.length; i++) if (ord[i] === other) n++;
    return n;
  };

  Engine.prototype.threats = function (st, map, exclude, k) {
    const un = this.unavailable(st);
    return this.list
      .filter((b) => !un.has(b.id) && b.id !== exclude)
      .map((b) => ({ b, f: this.mapFit(b, map) }))
      .sort((x, y) => y.f - x.f)
      .slice(0, k || 10);
  };

  Engine.prototype.recommendPicks = function (st, side, n) {
    side = side || "us";
    const map = this.maps[st.mapId];
    const modo = this.meta.modos[map.modo] || {};
    const other = side === "us" ? "them" : "us";
    const O = st.picks[side].filter(Boolean).map((id) => this.byId[id]);
    const E = st.picks[other].filter(Boolean).map((id) => this.byId[id]);
    const np = this.nextPick(st);
    const gIndex = np && np.side === side ? np.index : Math.min(5, O.length + E.length);
    const rE = np && np.side === side ? this.remainingAfter(st, side, np.index) : Math.max(0, 3 - E.length);
    const slotsLeft = 3 - O.length;
    const w = Object.assign({}, POS_W[clamp(gIndex, 0, 5)]);
    const style = st.style == null ? 0.5 : st.style;
    w.counter = Math.max(0, w.counter + (style - 0.5) * 0.2);
    w.map = Math.max(0.1, w.map - (style - 0.5) * 0.2);
    const un = this.unavailable(st);
    const usePool = side === "us" && st.pool && st.pool.length > 0;
    const poolSet = new Set(usePool ? st.pool : []);
    const threats = this.threats(st, map, null, 12);
    const needs = modo.necesita || [];
    const missing = needs.filter((nd) => !O.some((o) => fills(o, nd)));

    const out = [];
    for (const c of this.list) {
      if (un.has(c.id)) continue;
      if (usePool && st.poolOnly && !poolSet.has(c.id)) continue;
      const parts = {};
      const reasons = [];
      parts.map = this.mapFit(c, map);
      const idx = map.top.indexOf(c.id);
      if (idx >= 0) reasons.push({ t: "#" + (idx + 1) + " en " + map.nombre, k: "good" });
      else if (c.tier === "S+" || c.tier === "S") reasons.push({ t: "Tier " + c.tier + " del meta", k: "good" });
      const lv = this.liveFor(c, map);
      if (lv && lv.wr != null) reasons.push({ t: "WR " + lv.wr.toFixed(1) + "% en vivo", k: "live" });

      if (E.length) {
        let sum = 0, best = null, bestV = -2, worst = null, worstV = 2;
        for (const e of E) {
          const m = this.matchup(c, e, map);
          sum += m;
          if (m > bestV) { bestV = m; best = e; }
          if (m < worstV) { worstV = m; worst = e; }
        }
        parts.counter = (sum / E.length + 1) / 2;
        if (bestV > 0.2) reasons.push({ t: "Counter a " + best.nombre, k: "good" });
        if (worstV < -0.3) reasons.push({ t: worst.nombre + " le gana", k: "bad" });
      } else parts.counter = 0.5;

      let exp = 0, expBy = null;
      const fac = Math.min(1, rE / 2);
      if (fac > 0) {
        for (const t of threats) {
          if (t.b.id === c.id) continue;
          const m = Math.max(0, this.matchup(t.b, c, map)) * t.f;
          if (m > exp) { exp = m; expBy = t.b; }
        }
      }
      parts.safe = clamp(1 - exp * fac * 1.6, 0, 1);
      if (expBy && exp * fac > 0.3) reasons.push({ t: "Riesgo: " + expBy.nombre + " libre", k: "bad" });

      let fill = 0;
      const filled = [];
      missing.forEach((nd) => { if (fills(c, nd)) { fill++; filled.push(NEED_LABEL[nd] || nd); } });
      let syn = 0.5 + 0.18 * fill;
      if (missing.length && !fill && slotsLeft === 1) syn -= 0.2;
      const same = O.filter((o) => o.clase === c.clase).length;
      syn -= 0.15 * same;
      if (c.clase === "AS" && same) syn -= 0.1;
      parts.syn = clamp(syn, 0, 1);
      if (filled.length) reasons.push({ t: "Aporta " + filled.join(" + "), k: "info" });
      if (same) reasons.push({ t: "Clase repetida", k: "bad" });

      if (rE > 0) {
        if (O.length) {
          let s = 0;
          O.forEach((o) => (s += this.matchup(c, o, map)));
          parts.deny = ((s / O.length) + 1) / 2;
          if (s / O.length > 0.25) reasons.push({ t: "Les quitas un counter", k: "info" });
        } else parts.deny = parts.map;
      } else parts.deny = 0.5;

      let score = w.map * parts.map + w.counter * parts.counter + w.safe * parts.safe + w.syn * parts.syn + w.deny * parts.deny;
      const wsum = w.map + w.counter + w.safe + w.syn + w.deny;
      score /= wsum;
      if (usePool && !poolSet.has(c.id)) { score -= 0.08; reasons.push({ t: "Fuera de tu pool", k: "bad" }); }
      out.push({ b: c, score, parts, reasons: reasons.slice(0, 4) });
    }
    out.sort((a, b) => b.score - a.score);
    return n ? out.slice(0, n) : out;
  };

  Engine.prototype.recommendBans = function (st, side, n) {
    side = side || "us";
    const map = this.maps[st.mapId];
    const un = this.unavailable(st);
    const top = this.threats(st, map, null, 8).map((t) => t.b);
    const myPool = side === "us" && st.pool && st.pool.length
      ? st.pool.map((id) => this.byId[id]).filter(Boolean).sort((a, b) => this.mapFit(b, map) - this.mapFit(a, map)).slice(0, 6)
      : [];
    const out = [];
    for (const c of this.list) {
      if (un.has(c.id)) continue;
      const f = this.mapFit(c, map);
      let mt = 0;
      top.forEach((t) => { if (t.id !== c.id) mt += this.matchup(c, t, map); });
      mt = (mt / Math.max(1, top.length) + 1) / 2;
      let score = 0.68 * f + 0.32 * mt;
      const reasons = [];
      const idx = map.top.indexOf(c.id);
      if (idx >= 0) reasons.push({ t: "#" + (idx + 1) + " en " + map.nombre, k: "good" });
      else if (c.tier === "S+") reasons.push({ t: "Tier S+ del meta", k: "good" });
      if (mt > 0.56) reasons.push({ t: "Castiga al meta del mapa", k: "info" });
      if (myPool.length) {
        let s = 0;
        myPool.forEach((p) => (s += this.matchup(c, p, map)));
        s /= myPool.length;
        score += 0.15 * s;
        if (s > 0.2) reasons.push({ t: "Counter a tu pool", k: "bad" });
      }
      out.push({ b: c, score, parts: { map: f, counter: mt }, reasons });
    }
    out.sort((a, b) => b.score - a.score);
    return n ? out.slice(0, n) : out;
  };

  function radarOf(team) {
    const n = Math.max(1, team.length);
    const r = { Alcance: 0, Burst: 0, Aguante: 0, Control: 0, Movilidad: 0, "Rompe-muros": 0 };
    team.forEach((b) => {
      r.Alcance += b.alcance / 5;
      r.Burst += has(b, "B") || b.clase === "MK" || b.clase === "AS" ? 1 : b.clase === "DD" ? 0.6 : 0.2;
      r.Aguante += b.clase === "TK" ? 1 : has(b, "S") || has(b, "H") ? 0.7 : b.clase === "SP" ? 0.5 : 0.25;
      r.Control += has(b, "C") || b.clase === "CT" ? 1 : has(b, "Z") ? 0.7 : 0.15;
      r.Movilidad += has(b, "M") ? 1 : b.clase === "AS" ? 0.8 : 0.2;
      r["Rompe-muros"] += has(b, "W") ? 1 : b.clase === "AR" ? 0.6 : 0;
    });
    Object.keys(r).forEach((k) => (r[k] = Math.round(clamp(r[k] / n, 0, 1) * 100)));
    return r;
  }

  const MODE_PLAN = {
    gemGrab: (c, t) => "Controla la mina con " + c + "; " + t + " lleva las gemas y se retira a 7+.",
    brawlBall: (c, t) => "Abre camino con " + t + " y usa a " + c + " para negar la portería rival.",
    hotZone: (c, t) => "Asienta la zona con " + c + "; " + t + " aguanta dentro mientras el resto castiga la entrada.",
    heist: (c, t) => "Reparte presión: " + t + " empuja el cofre y " + c + " defiende el tuyo.",
    knockout: (c, t) => "Juega a distancia con " + c + " y no regales la primera baja; " + t + " cierra rondas 2v1.",
    bounty: (c, t) => "Prioriza estrellas: " + c + " ancla a distancia y " + t + " sólo entra cuando haya ventaja.",
  };

  Engine.prototype.evaluate = function (st) {
    const map = this.maps[st.mapId];
    const modo = this.meta.modos[map.modo] || {};
    const T = {
      us: st.picks.us.filter(Boolean).map((id) => this.byId[id]),
      them: st.picks.them.filter(Boolean).map((id) => this.byId[id]),
    };
    const res = {};
    ["us", "them"].forEach((k) => {
      const team = T[k];
      const fit = team.reduce((s, b) => s + this.mapFit(b, map), 0) / Math.max(1, team.length);
      const needs = modo.necesita || [];
      const cov = needs.length ? needs.filter((nd) => team.some((b) => fills(b, nd))).length / needs.length : 1;
      const classes = new Set(team.map((b) => b.clase)).size / Math.max(1, team.length);
      res[k] = { fit, cov, div: classes, radar: radarOf(team) };
    });
    let edge = 0, pairs = 0;
    T.us.forEach((a) => T.them.forEach((b) => { edge += this.matchup(a, b, map); pairs++; }));
    edge = pairs ? edge / pairs : 0;
    const score = (r) => 0.6 * r.fit + 0.28 * r.cov + 0.12 * r.div;
    const su = score(res.us), sh = score(res.them);
    const diff = su - sh + edge * 0.5;
    const win = clamp(1 / (1 + Math.exp(-diff * 6)), 0.2, 0.8);
    const grade = (s) => (s >= 0.86 ? "S" : s >= 0.78 ? "A" : s >= 0.68 ? "B" : s >= 0.58 ? "C" : "D");
    res.us.grade = grade(su + edge * 0.15);
    res.them.grade = grade(sh - edge * 0.15);

    // plan de partida
    const plan = [];
    const us = T.us.slice().sort((a, b) => b.alcance - a.alcance);
    if (us.length) {
      const anchor = us[0];
      const frontReal = us.find((b) => b !== anchor && (b.clase === "TK" || b.clase === "AS"));
      const front = frontReal || us[us.length - 1];
      const ctrl = us.find((b) => b.clase === "CT" || b.clase === "SP" || has(b, "Z")) || anchor;
      const roles = us.map((b) => {
        let r;
        if (b === anchor) r = "Ancla · línea larga";
        else if (b === frontReal) r = b.clase === "TK" ? "Frontal · abre espacio" : "Flanco · busca la baja";
        else if (b.clase === "CT" || b.clase === "SP" || has(b, "Z")) r = "Centro · control y apoyo";
        else r = "Línea media · daño";
        return { id: b.id, nombre: b.nombre, rol: r };
      });
      plan.push({ tipo: "roles", roles });
      const tank = us.find((b) => b.clase === "TK" || has(b, "S")) || front;
      plan.push({ tipo: "texto", t: (MODE_PLAN[map.modo] || MODE_PLAN.knockout)(ctrl.nombre, tank.nombre) });
      // amenaza
      let thr = null, thrV = -9;
      T.them.forEach((e) => {
        let s = 0;
        T.us.forEach((a) => (s += this.matchup(e, a, map)));
        if (s > thrV) { thrV = s; thr = e; }
      });
      if (thr && thrV > 0) {
        let victim = null, vv = -9;
        T.us.forEach((a) => { const m = this.matchup(thr, a, map); if (m > vv) { vv = m; victim = a; } });
        plan.push({ tipo: "alerta", t: "Cuidado con " + thr.nombre + ": castiga sobre todo a " + victim.nombre + ". Que no se quede aislado." });
      }
      // objetivo prioritario
      let tgt = null, tv = -9;
      T.them.forEach((e) => {
        let s = 0;
        T.us.forEach((a) => (s += this.matchup(a, e, map)));
        if (s > tv) { tv = s; tgt = e; }
      });
      if (tgt) plan.push({ tipo: "objetivo", t: "Objetivo prioritario: " + tgt.nombre + " (vuestro mejor matchup)." });
      if (map.arquetipo === "cerrado" && !T.us.some((b) => has(b, "W") || b.clase === "AR"))
        plan.push({ tipo: "alerta", t: "Mapa cerrado sin rompe-muros ni lanzadores: evita peleas largas tras muros." });
      if (map.arquetipo === "abierto" && us[0] && us[0].alcance < 4)
        plan.push({ tipo: "alerta", t: "Mapa abierto y poco alcance: jugad juntos y forzad peleas cortas." });
    }
    return { us: res.us, them: res.them, edge, win, plan };
  };

  Engine.TIER_V = TIER_V;
  Engine.fills = fills;
  Engine.NEED_LABEL = NEED_LABEL;
  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  else root.DraftEngine = Engine;
})(typeof window !== "undefined" ? window : this);
