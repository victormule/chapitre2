/**
 * travelling.js — Logique du travelling panoramique.
 *
 * Fixes :
 *   - Autoplay audio : `el.play()` retourne une Promise ; toutes les rejections
 *     sont absorbées avec `.catch()` pour éviter les "Uncaught (in promise)" qui
 *     polluaient la console Netlify et pouvaient bloquer l'exécution dans
 *     certains contextes de navigateur/extension.
 *   - Démarrage robuste : fallback `onerror` sur l'image principale + timeout
 *     de sécurité pour garantir que `ignite()` est toujours appelé même si
 *     l'événement `load` est manqué (image déjà en cache, race condition HMR).
 *   - ResizeObserver dédoublonné : le `window.addEventListener('resize')` et
 *     le `window.addEventListener('orientationchange')` sont remplacés par un
 *     unique `ResizeObserver` sur `<html>`, plus fiable et sans doublons.
 *   - Chargement lazy du cartel : inchangé, le module chp2-violence-et-trace.js n'est importé
 *     qu'au premier clic sur le crâne 136.
 */

"use strict";

/* =============================================================================
   OSCILLATEURS
   Paramètres de mouvement organique — source unique de vérité.
============================================================================= */
var O = {
  dx:   { freq: 0.23,  amp: 1,     phase: 0.0  },
  dy:   { freq: 0.17,  amp: 1,     phase: 1.1  },
  b1:   { freq: 0.41,  amp: 0.045, phase: 0.3  },
  b2:   { freq: 0.67,  amp: 0.028, phase: 2.1  },
  f1:   { freq: 2.1,   amp: 0.018, phase: 0.7  },
  f2:   { freq: 3.3,   amp: 0.012, phase: 1.5  },
  f3:   { freq: 5.7,   amp: 0.007, phase: 0.9  },
  f4:   { freq: 7.9,   amp: 0.004, phase: 2.8  },
  w:    { freq: 1.1,   amp: 1,     phase: 0.4  },
  shx1: { freq: 0.18,  amp: 1,     phase: 0.6  },
  shx2: { freq: 0.42,  amp: 1,     phase: 1.9  },
  shx3: { freq: 0.75,  amp: 1,     phase: 0.2  },
  shy1: { freq: 0.16,  amp: 1,     phase: 2.4  },
  shy2: { freq: 0.38,  amp: 1,     phase: 0.8  },
  shy3: { freq: 0.68,  amp: 1,     phase: 3.1  }
};

function osc(o, t) {
  return Math.sin(t * 0.001 * o.freq * Math.PI * 2 + o.phase) * o.amp;
}

/* =============================================================================
   LIGHT SYSTEM — lumière à la bougie sur canvas
============================================================================= */
function LightSystem(mountId) {
  this.mount   = document.getElementById(mountId) || document.body;
  this.canvas  = null;
  this.ctx     = null;
  this.raf     = null;
  this.animRaf = null;
  this.visible = false;
  this.opacity = 0;
  this.radius  = 0;
  this._frac   = 0;
  var self = this;
  this._resizeBound = function() { self.resize(); };
  this._ensureCanvas();
  this.resize();
  window.addEventListener('resize', this._resizeBound, { passive: true });
  this._startLoop();
}

LightSystem.prototype._ensureCanvas = function() {
  if (this.canvas) return;
  var c = document.createElement('canvas');
  c.style.cssText = [
    'position:absolute',
    'top:-15%',
    'left:-15%',
    'width:130%',
    'height:130%',
    'z-index:2',
    'pointer-events:none',
    'opacity:0',
    'display:none',
    'transition:opacity 220ms ease'
  ].join(';');
  this.mount.appendChild(c);
  this.canvas = c;
  this.ctx = c.getContext('2d');
};

LightSystem.prototype._vW = function() { return Math.max(320, window.innerWidth); };
LightSystem.prototype._vH = function() { return Math.max(240, window.innerHeight); };
LightSystem.prototype._min = function() {
  return Math.min(window.innerWidth, window.innerHeight);
};

LightSystem.prototype.resize = function() {
  if (!this.canvas) return;
  var w = this._vW() * 1.3;
  var h = this._vH() * 1.3;
  this.canvas.width  = w;
  this.canvas.style.width  = w + 'px';
  this.canvas.height = h;
  this.canvas.style.height = h + 'px';
  if (this._frac > 0) this.radius = this._min() * this._frac;
};

LightSystem.prototype.show = function() {
  this.visible = true;
  this.canvas.style.display = 'block';
  this.canvas.style.opacity = '1';
};

LightSystem.prototype.set = function(px, op) {
  this.radius  = Math.max(0, px);
  this.opacity = Math.max(0, Math.min(1, op === undefined ? 1 : op));
  this._frac   = this._min() > 0 ? this.radius / this._min() : 0;
};

LightSystem.prototype.animateToFraction = function(targetFrac, ms, targetOp) {
  var self = this;
  targetOp   = (targetOp === undefined) ? 1 : targetOp;
  targetFrac = Math.max(0, targetFrac);
  if (this.animRaf) cancelAnimationFrame(this.animRaf);
  var startFrac = this._frac;
  var startOp   = this.opacity;
  var t0 = performance.now();
  return new Promise(function(resolve) {
    function step(now) {
      var p = Math.min((now - t0) / Math.max(1, ms), 1);
      var e = 0.5 - 0.5 * Math.cos(p * Math.PI);
      self._frac   = startFrac + (targetFrac - startFrac) * e;
      self.radius  = self._min() * self._frac;
      self.opacity = startOp + (targetOp - startOp) * e;
      if (p < 1) {
        self.animRaf = requestAnimationFrame(step);
      } else {
        self.animRaf = null;
        self._frac   = targetFrac;
        self.radius  = self._min() * targetFrac;
        self.opacity = targetOp;
        resolve();
      }
    }
    self.animRaf = requestAnimationFrame(step);
  });
};

LightSystem.prototype._safeGrad = function(x0, y0, r0, x1, y1, r1) {
  if ([x0, y0, r0, x1, y1, r1].some(function(v) { return !isFinite(v) || isNaN(v); })) return null;
  return this.ctx.createRadialGradient(x0, y0, Math.max(0, r0), x1, y1, Math.max(0.001, r1));
};

LightSystem.prototype._render = function(t) {
  if (!this.ctx || !this.canvas) return;
  var ctx = this.ctx;
  var W = this.canvas.width, H = this.canvas.height;
  var active = this.visible && this.opacity > 0.001 && this.radius > 1;
  var cx = W / 2 + (active ? osc(O.dx, t) * 0.38 : 0);
  var cy = H / 2 + (active ? osc(O.dy, t) * 0.30 : 0);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (!active) return;

  var flickerScale = Math.min(1, this._frac / 0.25);
  var intensity = 1
    + (osc(O.b1, t) + osc(O.b2, t)) * flickerScale
    + (osc(O.f1, t) + osc(O.f2, t) + osc(O.f3, t) + osc(O.f4, t)) * flickerScale;
  var r  = Math.max(0, this.radius * Math.max(0.74, intensity));
  var wp = osc(O.w, t);

  ctx.globalAlpha = this.opacity;
  ctx.globalCompositeOperation = 'destination-out';

  var g1 = this._safeGrad(cx, cy, 0, cx, cy, r * 3.9);
  if (g1) {
    g1.addColorStop(0,    'rgba(0,0,0,0.38)');
    g1.addColorStop(0.22, 'rgba(0,0,0,0.24)');
    g1.addColorStop(0.55, 'rgba(0,0,0,0.12)');
    g1.addColorStop(0.82, 'rgba(0,0,0,0.04)');
    g1.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx, cy, r * 3.9, 0, Math.PI * 2);
    ctx.fillStyle = g1; ctx.fill();
  }

  var g2 = this._safeGrad(cx, cy, 0, cx, cy, r * 2.25);
  if (g2) {
    g2.addColorStop(0,    'rgba(0,0,0,0.58)');
    g2.addColorStop(0.35, 'rgba(0,0,0,0.38)');
    g2.addColorStop(0.68, 'rgba(0,0,0,0.16)');
    g2.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.25, 0, Math.PI * 2);
    ctx.fillStyle = g2; ctx.fill();
  }

  var g3 = this._safeGrad(cx, cy, 0, cx, cy, r * 1.03);
  if (g3) {
    g3.addColorStop(0,    'rgba(0,0,0,0.88)');
    g3.addColorStop(0.28, 'rgba(0,0,0,0.76)');
    g3.addColorStop(0.58, 'rgba(0,0,0,0.52)');
    g3.addColorStop(0.82, 'rgba(0,0,0,0.22)');
    g3.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.03, 0, Math.PI * 2);
    ctx.fillStyle = g3; ctx.fill();
  }

  var rC = Math.max(1, r * (0.28 + Math.abs(osc(O.f1, t)) * 0.15));
  var gC = this._safeGrad(cx, cy, 0, cx, cy, rC);
  if (gC) {
    gC.addColorStop(0, 'rgba(0,0,0,0.18)');
    gC.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx, cy, rC, 0, Math.PI * 2);
    ctx.fillStyle = gC; ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';

  var wR = Math.max(1, r * 0.62 * Math.max(0.55, intensity));
  var wA = 0.048 + Math.abs(wp) * 0.028;
  var gW = this._safeGrad(cx, cy, 0, cx, cy, wR);
  if (gW) {
    var gb = Math.floor(Math.max(0, Math.min(255, 185 + wp * 14)));
    gW.addColorStop(0,    'rgba(255,' + gb + ',70,' + (wA * 1.5).toFixed(3) + ')');
    gW.addColorStop(0.45, 'rgba(255,170,55,' + wA.toFixed(3) + ')');
    gW.addColorStop(1,    'rgba(255,130,20,0)');
    ctx.beginPath(); ctx.arc(cx, cy, wR, 0, Math.PI * 2);
    ctx.fillStyle = gW; ctx.fill();
  }

  var vIn  = Math.max(0, r * 1.05);
  var vOut = Math.max(vIn + 1, Math.sqrt(W * W + H * H) * 0.74);
  var gV   = this._safeGrad(cx, cy, vIn, cx, cy, vOut);
  if (gV) {
    gV.addColorStop(0,   'rgba(0,0,0,0)');
    gV.addColorStop(0.2, 'rgba(0,0,0,0.28)');
    gV.addColorStop(0.6, 'rgba(0,0,0,0.72)');
    gV.addColorStop(1,   'rgba(0,0,0,0.97)');
    ctx.fillStyle = gV;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.globalAlpha = 1;
};

LightSystem.prototype._startLoop = function() {
  if (this.raf) return;
  var self = this;
  var loop = function(t) { self.raf = requestAnimationFrame(loop); self._render(t); };
  this.raf = requestAnimationFrame(loop);
};

/* =============================================================================
   RÉFÉRENCES DOM
============================================================================= */
var imgEl  = document.getElementById("img");
var bar    = document.getElementById("bar");
var cursor = document.getElementById("cursor");
var legend = document.getElementById("legend");
var legNum = document.getElementById("leg-num");
var legLab = document.getElementById("leg-label");
var shakeEl = document.getElementById("shake");
var fadeEl  = document.getElementById("fade");

/* =============================================================================
   CRÂNES — zones de clic fractionnaires
============================================================================= */
var SKULLS = [
  {
    id:     "136",
    box:    { x0: 0.085, y0: 0.220, x1: 0.230, y1: 0.700 },
    num:    "136",
    label:  "La violence et ses traces",
    url:    null,
    action: "cartel",
    el:     document.getElementById("ov-136")
  },
  {
    id:     "137",
    box:    { x0: 0.620, y0: 0.180, x1: 0.840, y1: 0.730 },
    num:    "137",
    label:  "Invisibilisation de la violence muséale des collections",
    url:    "https://eyes-cnrs.netlify.app/",
    action: null,
    el:     document.getElementById("ov-137")
  },
  {
    id:     "138",
    box:    { x0: 0.860, y0: 0.170, x1: 0.985, y1: 0.640 },
    num:    "138",
    label:  "Une peine démesurée",
    url:    "https://humanite-cnrs.netlify.app/",
    action: null,
    el:     document.getElementById("ov-138")
  }
];

/* =============================================================================
   ÉTAT TRAVELLING
============================================================================= */
var lightStarted = false;
var hoveredSkull = null;
var lastClientX = 0, lastClientY = 0;
var lastMt = 0, lastMx2 = 0, lastMy2 = 0;
var velocity = 0;
var shakeMul = 1;
var vpH = 0;
var vpW = 0, imgW = 0, maxTx = 0, targetX = 0, currentX = 0, ratio = 0, started = false;

var SHAKE = {
  amplitudeX: 2.2,
  amplitudeY: 1.6,
  rotation:   0.08,
  velocityRef: 1800,
  boost:       1.2,
  maxBoost:    2.2,
  smoothing:   0.035
};

var IGNITE = {
  duration:    5000,
  finalRadius: 0.70,
  delay:       2600
};

/* =============================================================================
   MESURE & TRANSLATION
============================================================================= */
function measure() {
  vpW  = document.documentElement.clientWidth;
  vpH  = document.documentElement.clientHeight;
  imgW = imgEl.getBoundingClientRect().width;
  maxTx = Math.min(0, vpW - imgW);
  targetX = currentX = ratio * maxTx;
  applyTx(currentX);
}

function applyTx(tx) {
  tx = Math.max(maxTx, Math.min(0, tx));
  var r = Math.round(tx);
  var transform = "translateX(" + r + "px)";
  imgEl.style.transform = transform;
  for (var i = 0; i < SKULLS.length; i++) {
    SKULLS[i].el.style.transform = transform;
  }
  var pct = maxTx !== 0 ? r / maxTx : 0;
  pct = Math.max(0, Math.min(1, pct));
  bar.style.width = (pct * 100) + "%";
  updateHover();
}

/* =============================================================================
   HOVER DETECTION
============================================================================= */
function updateHover() {
  if (document.body.classList.contains('cartel-open')) {
    if (hoveredSkull) hoveredSkull.el.classList.remove("visible");
    hoveredSkull = null;
    legend.classList.remove("visible");
    cursor.classList.remove("clickable");
    return;
  }
  if (!lightStarted) {
    if (hoveredSkull) hoveredSkull.el.classList.remove("visible");
    hoveredSkull = null;
    legend.classList.remove("visible");
    cursor.classList.remove("clickable");
    return;
  }
  if (vpH === 0 || imgW === 0) return;

  var imgX = lastClientX - currentX;
  var imgY = lastClientY;
  var fx = imgX / imgW;
  var fy = imgY / vpH;

  var hit = null;
  for (var i = 0; i < SKULLS.length; i++) {
    var b = SKULLS[i].box;
    if (fx >= b.x0 && fx <= b.x1 && fy >= b.y0 && fy <= b.y1) {
      hit = SKULLS[i];
      break;
    }
  }

  if (hit !== hoveredSkull) {
    if (hoveredSkull) hoveredSkull.el.classList.remove("visible");
    hoveredSkull = hit;
    if (hit) {
      hit.el.classList.add("visible");
      legNum.textContent = hit.num;
      legLab.textContent = hit.label;
      legend.classList.add("visible");
    } else {
      legend.classList.remove("visible");
    }
    cursor.classList.toggle("clickable", !!(hit && (hit.url || hit.action)));
  }
}

/* =============================================================================
   MOUVEMENT (souris + touch)
============================================================================= */
function onMove(clientX, clientY) {
  if (!started) {
    started = true;
    cursor.classList.add("visible");
  }
  if (clientY !== null) {
    var now = performance.now();
    if (lastMt > 0) {
      var dt = Math.max(1, now - lastMt);
      var dx = clientX - lastMx2;
      var dy = clientY - lastMy2;
      var v  = Math.sqrt(dx * dx + dy * dy) / dt * 1000;
      velocity = velocity * 0.7 + v * 0.3;
    }
    lastMt = now; lastMx2 = clientX; lastMy2 = clientY;
  }
  lastClientX = clientX;
  lastClientY = clientY !== null ? clientY : lastClientY;
  ratio   = Math.max(0, Math.min(1, clientX / vpW));
  targetX = ratio * maxTx;
  if (clientY !== null) {
    cursor.style.left = clientX + "px";
    cursor.style.top  = clientY + "px";
  }
}

window.addEventListener("mousemove", function(e) { onMove(e.clientX, e.clientY); });
window.addEventListener("touchmove", function(e) {
  if (document.body.classList.contains('cartel-open')) return;
  e.preventDefault();
  onMove(e.touches[0].clientX, null);
}, { passive: false });

/* =============================================================================
   CLIC — 3 cas : cartel, navigation externe, rien
============================================================================= */
var navigating = false;

window.addEventListener("click", function(e) {
  if (document.body.classList.contains('cartel-open')) return;
  if (navigating) return;
  if (!hoveredSkull) return;

  if (hoveredSkull.action === "cartel") {
    openCartelOverlay();
    return;
  }

  if (!hoveredSkull.url) return;
  navigating = true;
  var url = hoveredSkull.url;

  legend.classList.remove("visible");
  cursor.classList.remove("visible");
  if (hoveredSkull.el) hoveredSkull.el.classList.remove("visible");

  light.animateToFraction(0, 1600, 0);

  setTimeout(function() { fadeEl.classList.add("out"); }, 200);
  setTimeout(function() { window.location.href = url; }, 2000);
});

/* =============================================================================
   BOUCLES D'ANIMATION
============================================================================= */
measure();

// Boucle de travelling (interpolation douce)
(function travelLoop() {
  var d = targetX - currentX;
  currentX = Math.abs(d) < 0.05 ? targetX : currentX + d * 0.08;
  applyTx(currentX);
  requestAnimationFrame(travelLoop);
})();

// Boucle de tremblement organique
(function shakeLoop() {
  var t = performance.now();
  velocity *= 0.92;
  var target = 1 + Math.min(SHAKE.boost, velocity / SHAKE.velocityRef * SHAKE.boost);
  target = Math.min(SHAKE.maxBoost, target);
  shakeMul += (target - shakeMul) * SHAKE.smoothing;

  var sx = (Math.sin(t * 0.001 * O.shx1.freq * Math.PI * 2 + O.shx1.phase)
          + Math.sin(t * 0.001 * O.shx2.freq * Math.PI * 2 + O.shx2.phase) * 0.5
          + Math.sin(t * 0.001 * O.shx3.freq * Math.PI * 2 + O.shx3.phase) * 0.25) / 1.75;
  var sy = (Math.sin(t * 0.001 * O.shy1.freq * Math.PI * 2 + O.shy1.phase)
          + Math.sin(t * 0.001 * O.shy2.freq * Math.PI * 2 + O.shy2.phase) * 0.5
          + Math.sin(t * 0.001 * O.shy3.freq * Math.PI * 2 + O.shy3.phase) * 0.25) / 1.75;
  var rot = sx * SHAKE.rotation * shakeMul;

  shakeEl.style.transform =
    "translate(" + (sx * SHAKE.amplitudeX * shakeMul).toFixed(2) + "px,"
                 + (sy * SHAKE.amplitudeY * shakeMul).toFixed(2) + "px) "
    + "rotate(" + rot.toFixed(3) + "deg)";
  requestAnimationFrame(shakeLoop);
})();

/* =============================================================================
   LIGHT SYSTEM — instancié après les boucles
============================================================================= */
var light = new LightSystem("shake");

/* =============================================================================
   AUDIO
   Toutes les Promises retournées par el.play() sont absorbées avec .catch()
   pour éviter les "Uncaught (in promise) Error" sur Netlify / Chrome.
============================================================================= */
var audio = (function() {
  var el = new Audio('./chp2-medias/fredonnement-son.mp3');
  el.loop   = true;
  el.volume = 0;
  var rafId = null;
  var nominalVol = 0.72;

  function _fade(fromVol, toVol, ms, onDone) {
    if (rafId) cancelAnimationFrame(rafId);
    var t0 = performance.now();
    function step(now) {
      var p = Math.min((now - t0) / Math.max(1, ms), 1);
      var e = 0.5 - 0.5 * Math.cos(p * Math.PI);
      el.volume = Math.max(0, Math.min(1, fromVol + (toVol - fromVol) * e));
      if (p < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        el.volume = toVol;
        rafId = null;
        if (onDone) onDone();
      }
    }
    rafId = requestAnimationFrame(step);
  }

  /**
   * Tente el.play() en absorbant systématiquement la rejection autoplay.
   * Retourne la Promise pour les appelants qui veulent chaîner.
   */
  function _safePlay() {
    var p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function() { /* autoplay bloqué — silencieux */ });
    }
    return p;
  }

  return {
    fadeIn: function(targetVol, ms) {
      if (targetVol !== undefined) nominalVol = targetVol;
      if (el.paused) {
        el.currentTime = 0;
        el.volume = 0;
      }
      _safePlay();
      _fade(el.volume, nominalVol, ms || 5000);
    },
    fadeOut: function(ms, onDone) {
      _fade(el.volume, 0, ms || 1600, function() {
        el.pause();
        if (onDone) onDone();
      });
    },
    /** Atténuation douce sans pause (utilisé pendant le cartel). */
    duck: function(ms) {
      _fade(el.volume, 0, ms || 800);
    },
    /** Restauration du volume nominal sans relancer el (le son n'a pas été pausé). */
    unduck: function(ms) {
      _safePlay();
      _fade(el.volume, nominalVol, ms || 1200);
    }
  };
})();

/* =============================================================================
   IGNITION
   - Robuste : écoute load ET error (fallback si ressource manquante).
   - Timeout de sécurité : si ni load ni error ne se déclenche dans les 10 s
     (cas extrême de cache corrompu / SW stale), on démarre quand même la
     lumière pour ne pas rester sur un écran noir.
============================================================================= */
function ignite() {
  light.set(0, 1);
  light.show();
  setTimeout(function() {
    light.animateToFraction(IGNITE.finalRadius, IGNITE.duration, 1);
    audio.fadeIn(0.72, IGNITE.duration);
    setTimeout(function() {
      lightStarted = true;
    }, 800);
  }, IGNITE.delay);
}

var _ignited = false;
function safeIgnite() {
  if (_ignited) return;
  _ignited = true;
  ignite();
}

if (imgEl.complete && imgEl.naturalWidth > 0) {
  // Image déjà en cache — on démarre immédiatement
  safeIgnite();
} else {
  imgEl.addEventListener("load",  safeIgnite, { once: true });
  // Fallback : image en erreur → on démarre quand même (noir, mais pas bloqué)
  imgEl.addEventListener("error", safeIgnite, { once: true });
  // Timeout de sécurité 10 s (SW stale, réseau lent, cache corrompu)
  var _igniteTimeout = setTimeout(safeIgnite, 10000);
  imgEl.addEventListener("load", function() { clearTimeout(_igniteTimeout); }, { once: true });
}

/* =============================================================================
   RESIZE — un seul observateur (ResizeObserver couvre resize + orientation)
============================================================================= */
new ResizeObserver(function() {
  measure();
  light.resize();
}).observe(document.documentElement);

/* =============================================================================
   PONT TRAVELLING ⇄ CARTEL
   Le module chp2-viloence-et-trace.js est chargé en lazy au premier clic crâne-136.
============================================================================= */
var cartelModulePromise = null;

function loadCartelModule() {
  if (!cartelModulePromise) {
    cartelModulePromise = import('./chp2-violence-et-trace.js');
  }
  return cartelModulePromise;
}

function openCartelOverlay() {
  legend.classList.remove("visible");
  if (hoveredSkull && hoveredSkull.el) hoveredSkull.el.classList.remove("visible");
  audio.duck(800);

  loadCartelModule().then(function(mod) {
    var ok = mod.openCartel();
    if (!ok) {
      // openCartel a refusé (déjà ouvert)
      audio.unduck(400);
    }
  }).catch(function(err) {
    console.error('[Cartel] Échec du chargement de chp2-violence-et-trace.js :', err);
    audio.unduck(400);
  });
}

// Quand le cartel se ferme, fade-in du son du travelling
window.addEventListener('cartel:closed', function() {
  audio.unduck(1200);
});

window.addEventListener('pageshow', function(e) {
  if (!e.persisted) return; // chargement normal → rien à faire

  // Réinitialise l'état de navigation
  navigating = false;
  fadeEl.classList.remove('out');

  // Relance l'audio s'il était en cours
  audio.unduck(800);
});
// Gestion du BFCache : recharger la page quand l'utilisateur revient via "Précédent"
let bfCacheReloaded = false;
window.addEventListener('pageshow', function(e) {
  if (e.persisted && !bfCacheReloaded) {
    bfCacheReloaded = true;
    window.location.reload();
  }
});