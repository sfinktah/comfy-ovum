var V = "top", q = "bottom", z = "right", H = "left", mt = "auto", $e = [V, q, z, H], Ee = "start", Ie = "end", lr = "clippingParents", Ut = "viewport", Re = "popper", dr = "reference", Tt = /* @__PURE__ */ $e.reduce(function(e, t) {
  return e.concat([t + "-" + Ee, t + "-" + Ie]);
}, []), Ft = /* @__PURE__ */ [].concat($e, [mt]).reduce(function(e, t) {
  return e.concat([t, t + "-" + Ee, t + "-" + Ie]);
}, []), vr = "beforeRead", mr = "read", hr = "afterRead", gr = "beforeMain", yr = "main", br = "afterMain", wr = "beforeWrite", Or = "write", xr = "afterWrite", Er = [vr, mr, hr, gr, yr, br, wr, Or, xr];
function te(e) {
  return e ? (e.nodeName || "").toLowerCase() : null;
}
function F(e) {
  if (e == null)
    return window;
  if (e.toString() !== "[object Window]") {
    var t = e.ownerDocument;
    return t && t.defaultView || window;
  }
  return e;
}
function he(e) {
  var t = F(e).Element;
  return e instanceof t || e instanceof Element;
}
function X(e) {
  var t = F(e).HTMLElement;
  return e instanceof t || e instanceof HTMLElement;
}
function ht(e) {
  if (typeof ShadowRoot > "u")
    return !1;
  var t = F(e).ShadowRoot;
  return e instanceof t || e instanceof ShadowRoot;
}
function Tr(e) {
  var t = e.state;
  Object.keys(t.elements).forEach(function(r) {
    var i = t.styles[r] || {}, o = t.attributes[r] || {}, s = t.elements[r];
    !X(s) || !te(s) || (Object.assign(s.style, i), Object.keys(o).forEach(function(f) {
      var c = o[f];
      c === !1 ? s.removeAttribute(f) : s.setAttribute(f, c === !0 ? "" : c);
    }));
  });
}
function Ar(e) {
  var t = e.state, r = {
    popper: {
      position: t.options.strategy,
      left: "0",
      top: "0",
      margin: "0"
    },
    arrow: {
      position: "absolute"
    },
    reference: {}
  };
  return Object.assign(t.elements.popper.style, r.popper), t.styles = r, t.elements.arrow && Object.assign(t.elements.arrow.style, r.arrow), function() {
    Object.keys(t.elements).forEach(function(i) {
      var o = t.elements[i], s = t.attributes[i] || {}, f = Object.keys(t.styles.hasOwnProperty(i) ? t.styles[i] : r[i]), c = f.reduce(function(u, l) {
        return u[l] = "", u;
      }, {});
      !X(o) || !te(o) || (Object.assign(o.style, c), Object.keys(s).forEach(function(u) {
        o.removeAttribute(u);
      }));
    });
  };
}
const Yt = {
  name: "applyStyles",
  enabled: !0,
  phase: "write",
  fn: Tr,
  effect: Ar,
  requires: ["computeStyles"]
};
function ee(e) {
  return e.split("-")[0];
}
var me = Math.max, et = Math.min, Te = Math.round;
function pt() {
  var e = navigator.userAgentData;
  return e != null && e.brands && Array.isArray(e.brands) ? e.brands.map(function(t) {
    return t.brand + "/" + t.version;
  }).join(" ") : navigator.userAgent;
}
function Xt() {
  return !/^((?!chrome|android).)*safari/i.test(pt());
}
function Ae(e, t, r) {
  t === void 0 && (t = !1), r === void 0 && (r = !1);
  var i = e.getBoundingClientRect(), o = 1, s = 1;
  t && X(e) && (o = e.offsetWidth > 0 && Te(i.width) / e.offsetWidth || 1, s = e.offsetHeight > 0 && Te(i.height) / e.offsetHeight || 1);
  var f = he(e) ? F(e) : window, c = f.visualViewport, u = !Xt() && r, l = (i.left + (u && c ? c.offsetLeft : 0)) / o, p = (i.top + (u && c ? c.offsetTop : 0)) / s, b = i.width / o, x = i.height / s;
  return {
    width: b,
    height: x,
    top: p,
    right: l + b,
    bottom: p + x,
    left: l,
    x: l,
    y: p
  };
}
function gt(e) {
  var t = Ae(e), r = e.offsetWidth, i = e.offsetHeight;
  return Math.abs(t.width - r) <= 1 && (r = t.width), Math.abs(t.height - i) <= 1 && (i = t.height), {
    x: e.offsetLeft,
    y: e.offsetTop,
    width: r,
    height: i
  };
}
function qt(e, t) {
  var r = t.getRootNode && t.getRootNode();
  if (e.contains(t))
    return !0;
  if (r && ht(r)) {
    var i = t;
    do {
      if (i && e.isSameNode(i))
        return !0;
      i = i.parentNode || i.host;
    } while (i);
  }
  return !1;
}
function ae(e) {
  return F(e).getComputedStyle(e);
}
function Cr(e) {
  return ["table", "td", "th"].indexOf(te(e)) >= 0;
}
function fe(e) {
  return ((he(e) ? e.ownerDocument : (
    // $FlowFixMe[prop-missing]
    e.document
  )) || window.document).documentElement;
}
function rt(e) {
  return te(e) === "html" ? e : (
    // this is a quicker (but less type safe) way to save quite some bytes from the bundle
    // $FlowFixMe[incompatible-return]
    // $FlowFixMe[prop-missing]
    e.assignedSlot || // step into the shadow DOM of the parent of a slotted node
    e.parentNode || // DOM Element detected
    (ht(e) ? e.host : null) || // ShadowRoot detected
    // $FlowFixMe[incompatible-call]: HTMLElement is a Node
    fe(e)
  );
}
function At(e) {
  return !X(e) || // https://github.com/popperjs/popper-core/issues/837
  ae(e).position === "fixed" ? null : e.offsetParent;
}
function Dr(e) {
  var t = /firefox/i.test(pt()), r = /Trident/i.test(pt());
  if (r && X(e)) {
    var i = ae(e);
    if (i.position === "fixed")
      return null;
  }
  var o = rt(e);
  for (ht(o) && (o = o.host); X(o) && ["html", "body"].indexOf(te(o)) < 0; ) {
    var s = ae(o);
    if (s.transform !== "none" || s.perspective !== "none" || s.contain === "paint" || ["transform", "perspective"].indexOf(s.willChange) !== -1 || t && s.willChange === "filter" || t && s.filter && s.filter !== "none")
      return o;
    o = o.parentNode;
  }
  return null;
}
function Ve(e) {
  for (var t = F(e), r = At(e); r && Cr(r) && ae(r).position === "static"; )
    r = At(r);
  return r && (te(r) === "html" || te(r) === "body" && ae(r).position === "static") ? t : r || Dr(e) || t;
}
function yt(e) {
  return ["top", "bottom"].indexOf(e) >= 0 ? "x" : "y";
}
function je(e, t, r) {
  return me(e, et(t, r));
}
function Pr(e, t, r) {
  var i = je(e, t, r);
  return i > r ? r : i;
}
function zt() {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  };
}
function _t(e) {
  return Object.assign({}, zt(), e);
}
function Gt(e, t) {
  return t.reduce(function(r, i) {
    return r[i] = e, r;
  }, {});
}
var Sr = function(t, r) {
  return t = typeof t == "function" ? t(Object.assign({}, r.rects, {
    placement: r.placement
  })) : t, _t(typeof t != "number" ? t : Gt(t, $e));
};
function Mr(e) {
  var t, r = e.state, i = e.name, o = e.options, s = r.elements.arrow, f = r.modifiersData.popperOffsets, c = ee(r.placement), u = yt(c), l = [H, z].indexOf(c) >= 0, p = l ? "height" : "width";
  if (!(!s || !f)) {
    var b = Sr(o.padding, r), x = gt(s), h = u === "y" ? V : H, w = u === "y" ? q : z, g = r.rects.reference[p] + r.rects.reference[u] - f[u] - r.rects.popper[p], y = f[u] - r.rects.reference[u], T = Ve(s), C = T ? u === "y" ? T.clientHeight || 0 : T.clientWidth || 0 : 0, P = g / 2 - y / 2, n = b[h], E = C - x[p] - b[w], v = C / 2 - x[p] / 2 + P, D = je(n, v, E), j = u;
    r.modifiersData[i] = (t = {}, t[j] = D, t.centerOffset = D - v, t);
  }
}
function Lr(e) {
  var t = e.state, r = e.options, i = r.element, o = i === void 0 ? "[data-popper-arrow]" : i;
  o != null && (typeof o == "string" && (o = t.elements.popper.querySelector(o), !o) || qt(t.elements.popper, o) && (t.elements.arrow = o));
}
const Rr = {
  name: "arrow",
  enabled: !0,
  phase: "main",
  fn: Mr,
  effect: Lr,
  requires: ["popperOffsets"],
  requiresIfExists: ["preventOverflow"]
};
function Ce(e) {
  return e.split("-")[1];
}
var jr = {
  top: "auto",
  right: "auto",
  bottom: "auto",
  left: "auto"
};
function kr(e, t) {
  var r = e.x, i = e.y, o = t.devicePixelRatio || 1;
  return {
    x: Te(r * o) / o || 0,
    y: Te(i * o) / o || 0
  };
}
function Ct(e) {
  var t, r = e.popper, i = e.popperRect, o = e.placement, s = e.variation, f = e.offsets, c = e.position, u = e.gpuAcceleration, l = e.adaptive, p = e.roundOffsets, b = e.isFixed, x = f.x, h = x === void 0 ? 0 : x, w = f.y, g = w === void 0 ? 0 : w, y = typeof p == "function" ? p({
    x: h,
    y: g
  }) : {
    x: h,
    y: g
  };
  h = y.x, g = y.y;
  var T = f.hasOwnProperty("x"), C = f.hasOwnProperty("y"), P = H, n = V, E = window;
  if (l) {
    var v = Ve(r), D = "clientHeight", j = "clientWidth";
    if (v === F(r) && (v = fe(r), ae(v).position !== "static" && c === "absolute" && (D = "scrollHeight", j = "scrollWidth")), v = v, o === V || (o === H || o === z) && s === Ie) {
      n = q;
      var R = b && v === E && E.visualViewport ? E.visualViewport.height : (
        // $FlowFixMe[prop-missing]
        v[D]
      );
      g -= R - i.height, g *= u ? 1 : -1;
    }
    if (o === H || (o === V || o === q) && s === Ie) {
      P = z;
      var M = b && v === E && E.visualViewport ? E.visualViewport.width : (
        // $FlowFixMe[prop-missing]
        v[j]
      );
      h -= M - i.width, h *= u ? 1 : -1;
    }
  }
  var k = Object.assign({
    position: c
  }, l && jr), L = p === !0 ? kr({
    x: h,
    y: g
  }, F(r)) : {
    x: h,
    y: g
  };
  if (h = L.x, g = L.y, u) {
    var S;
    return Object.assign({}, k, (S = {}, S[n] = C ? "0" : "", S[P] = T ? "0" : "", S.transform = (E.devicePixelRatio || 1) <= 1 ? "translate(" + h + "px, " + g + "px)" : "translate3d(" + h + "px, " + g + "px, 0)", S));
  }
  return Object.assign({}, k, (t = {}, t[n] = C ? g + "px" : "", t[P] = T ? h + "px" : "", t.transform = "", t));
}
function Br(e) {
  var t = e.state, r = e.options, i = r.gpuAcceleration, o = i === void 0 ? !0 : i, s = r.adaptive, f = s === void 0 ? !0 : s, c = r.roundOffsets, u = c === void 0 ? !0 : c, l = {
    placement: ee(t.placement),
    variation: Ce(t.placement),
    popper: t.elements.popper,
    popperRect: t.rects.popper,
    gpuAcceleration: o,
    isFixed: t.options.strategy === "fixed"
  };
  t.modifiersData.popperOffsets != null && (t.styles.popper = Object.assign({}, t.styles.popper, Ct(Object.assign({}, l, {
    offsets: t.modifiersData.popperOffsets,
    position: t.options.strategy,
    adaptive: f,
    roundOffsets: u
  })))), t.modifiersData.arrow != null && (t.styles.arrow = Object.assign({}, t.styles.arrow, Ct(Object.assign({}, l, {
    offsets: t.modifiersData.arrow,
    position: "absolute",
    adaptive: !1,
    roundOffsets: u
  })))), t.attributes.popper = Object.assign({}, t.attributes.popper, {
    "data-popper-placement": t.placement
  });
}
const Ir = {
  name: "computeStyles",
  enabled: !0,
  phase: "beforeWrite",
  fn: Br,
  data: {}
};
var Je = {
  passive: !0
};
function Wr(e) {
  var t = e.state, r = e.instance, i = e.options, o = i.scroll, s = o === void 0 ? !0 : o, f = i.resize, c = f === void 0 ? !0 : f, u = F(t.elements.popper), l = [].concat(t.scrollParents.reference, t.scrollParents.popper);
  return s && l.forEach(function(p) {
    p.addEventListener("scroll", r.update, Je);
  }), c && u.addEventListener("resize", r.update, Je), function() {
    s && l.forEach(function(p) {
      p.removeEventListener("scroll", r.update, Je);
    }), c && u.removeEventListener("resize", r.update, Je);
  };
}
const $r = {
  name: "eventListeners",
  enabled: !0,
  phase: "write",
  fn: function() {
  },
  effect: Wr,
  data: {}
};
var Vr = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
function Ze(e) {
  return e.replace(/left|right|bottom|top/g, function(t) {
    return Vr[t];
  });
}
var Hr = {
  start: "end",
  end: "start"
};
function Dt(e) {
  return e.replace(/start|end/g, function(t) {
    return Hr[t];
  });
}
function bt(e) {
  var t = F(e), r = t.pageXOffset, i = t.pageYOffset;
  return {
    scrollLeft: r,
    scrollTop: i
  };
}
function wt(e) {
  return Ae(fe(e)).left + bt(e).scrollLeft;
}
function Nr(e, t) {
  var r = F(e), i = fe(e), o = r.visualViewport, s = i.clientWidth, f = i.clientHeight, c = 0, u = 0;
  if (o) {
    s = o.width, f = o.height;
    var l = Xt();
    (l || !l && t === "fixed") && (c = o.offsetLeft, u = o.offsetTop);
  }
  return {
    width: s,
    height: f,
    x: c + wt(e),
    y: u
  };
}
function Ur(e) {
  var t, r = fe(e), i = bt(e), o = (t = e.ownerDocument) == null ? void 0 : t.body, s = me(r.scrollWidth, r.clientWidth, o ? o.scrollWidth : 0, o ? o.clientWidth : 0), f = me(r.scrollHeight, r.clientHeight, o ? o.scrollHeight : 0, o ? o.clientHeight : 0), c = -i.scrollLeft + wt(e), u = -i.scrollTop;
  return ae(o || r).direction === "rtl" && (c += me(r.clientWidth, o ? o.clientWidth : 0) - s), {
    width: s,
    height: f,
    x: c,
    y: u
  };
}
function Ot(e) {
  var t = ae(e), r = t.overflow, i = t.overflowX, o = t.overflowY;
  return /auto|scroll|overlay|hidden/.test(r + o + i);
}
function Kt(e) {
  return ["html", "body", "#document"].indexOf(te(e)) >= 0 ? e.ownerDocument.body : X(e) && Ot(e) ? e : Kt(rt(e));
}
function ke(e, t) {
  var r;
  t === void 0 && (t = []);
  var i = Kt(e), o = i === ((r = e.ownerDocument) == null ? void 0 : r.body), s = F(i), f = o ? [s].concat(s.visualViewport || [], Ot(i) ? i : []) : i, c = t.concat(f);
  return o ? c : (
    // $FlowFixMe[incompatible-call]: isBody tells us target will be an HTMLElement here
    c.concat(ke(rt(f)))
  );
}
function lt(e) {
  return Object.assign({}, e, {
    left: e.x,
    top: e.y,
    right: e.x + e.width,
    bottom: e.y + e.height
  });
}
function Fr(e, t) {
  var r = Ae(e, !1, t === "fixed");
  return r.top = r.top + e.clientTop, r.left = r.left + e.clientLeft, r.bottom = r.top + e.clientHeight, r.right = r.left + e.clientWidth, r.width = e.clientWidth, r.height = e.clientHeight, r.x = r.left, r.y = r.top, r;
}
function Pt(e, t, r) {
  return t === Ut ? lt(Nr(e, r)) : he(t) ? Fr(t, r) : lt(Ur(fe(e)));
}
function Yr(e) {
  var t = ke(rt(e)), r = ["absolute", "fixed"].indexOf(ae(e).position) >= 0, i = r && X(e) ? Ve(e) : e;
  return he(i) ? t.filter(function(o) {
    return he(o) && qt(o, i) && te(o) !== "body";
  }) : [];
}
function Xr(e, t, r, i) {
  var o = t === "clippingParents" ? Yr(e) : [].concat(t), s = [].concat(o, [r]), f = s[0], c = s.reduce(function(u, l) {
    var p = Pt(e, l, i);
    return u.top = me(p.top, u.top), u.right = et(p.right, u.right), u.bottom = et(p.bottom, u.bottom), u.left = me(p.left, u.left), u;
  }, Pt(e, f, i));
  return c.width = c.right - c.left, c.height = c.bottom - c.top, c.x = c.left, c.y = c.top, c;
}
function Jt(e) {
  var t = e.reference, r = e.element, i = e.placement, o = i ? ee(i) : null, s = i ? Ce(i) : null, f = t.x + t.width / 2 - r.width / 2, c = t.y + t.height / 2 - r.height / 2, u;
  switch (o) {
    case V:
      u = {
        x: f,
        y: t.y - r.height
      };
      break;
    case q:
      u = {
        x: f,
        y: t.y + t.height
      };
      break;
    case z:
      u = {
        x: t.x + t.width,
        y: c
      };
      break;
    case H:
      u = {
        x: t.x - r.width,
        y: c
      };
      break;
    default:
      u = {
        x: t.x,
        y: t.y
      };
  }
  var l = o ? yt(o) : null;
  if (l != null) {
    var p = l === "y" ? "height" : "width";
    switch (s) {
      case Ee:
        u[l] = u[l] - (t[p] / 2 - r[p] / 2);
        break;
      case Ie:
        u[l] = u[l] + (t[p] / 2 - r[p] / 2);
        break;
      default:
    }
  }
  return u;
}
function We(e, t) {
  t === void 0 && (t = {});
  var r = t, i = r.placement, o = i === void 0 ? e.placement : i, s = r.strategy, f = s === void 0 ? e.strategy : s, c = r.boundary, u = c === void 0 ? lr : c, l = r.rootBoundary, p = l === void 0 ? Ut : l, b = r.elementContext, x = b === void 0 ? Re : b, h = r.altBoundary, w = h === void 0 ? !1 : h, g = r.padding, y = g === void 0 ? 0 : g, T = _t(typeof y != "number" ? y : Gt(y, $e)), C = x === Re ? dr : Re, P = e.rects.popper, n = e.elements[w ? C : x], E = Xr(he(n) ? n : n.contextElement || fe(e.elements.popper), u, p, f), v = Ae(e.elements.reference), D = Jt({
    reference: v,
    element: P,
    strategy: "absolute",
    placement: o
  }), j = lt(Object.assign({}, P, D)), R = x === Re ? j : v, M = {
    top: E.top - R.top + T.top,
    bottom: R.bottom - E.bottom + T.bottom,
    left: E.left - R.left + T.left,
    right: R.right - E.right + T.right
  }, k = e.modifiersData.offset;
  if (x === Re && k) {
    var L = k[o];
    Object.keys(M).forEach(function(S) {
      var N = [z, q].indexOf(S) >= 0 ? 1 : -1, U = [V, q].indexOf(S) >= 0 ? "y" : "x";
      M[S] += L[U] * N;
    });
  }
  return M;
}
function qr(e, t) {
  t === void 0 && (t = {});
  var r = t, i = r.placement, o = r.boundary, s = r.rootBoundary, f = r.padding, c = r.flipVariations, u = r.allowedAutoPlacements, l = u === void 0 ? Ft : u, p = Ce(i), b = p ? c ? Tt : Tt.filter(function(w) {
    return Ce(w) === p;
  }) : $e, x = b.filter(function(w) {
    return l.indexOf(w) >= 0;
  });
  x.length === 0 && (x = b);
  var h = x.reduce(function(w, g) {
    return w[g] = We(e, {
      placement: g,
      boundary: o,
      rootBoundary: s,
      padding: f
    })[ee(g)], w;
  }, {});
  return Object.keys(h).sort(function(w, g) {
    return h[w] - h[g];
  });
}
function zr(e) {
  if (ee(e) === mt)
    return [];
  var t = Ze(e);
  return [Dt(e), t, Dt(t)];
}
function _r(e) {
  var t = e.state, r = e.options, i = e.name;
  if (!t.modifiersData[i]._skip) {
    for (var o = r.mainAxis, s = o === void 0 ? !0 : o, f = r.altAxis, c = f === void 0 ? !0 : f, u = r.fallbackPlacements, l = r.padding, p = r.boundary, b = r.rootBoundary, x = r.altBoundary, h = r.flipVariations, w = h === void 0 ? !0 : h, g = r.allowedAutoPlacements, y = t.options.placement, T = ee(y), C = T === y, P = u || (C || !w ? [Ze(y)] : zr(y)), n = [y].concat(P).reduce(function(re, _) {
      return re.concat(ee(_) === mt ? qr(t, {
        placement: _,
        boundary: p,
        rootBoundary: b,
        padding: l,
        flipVariations: w,
        allowedAutoPlacements: g
      }) : _);
    }, []), E = t.rects.reference, v = t.rects.popper, D = /* @__PURE__ */ new Map(), j = !0, R = n[0], M = 0; M < n.length; M++) {
      var k = n[M], L = ee(k), S = Ce(k) === Ee, N = [V, q].indexOf(L) >= 0, U = N ? "width" : "height", I = We(t, {
        placement: k,
        boundary: p,
        rootBoundary: b,
        altBoundary: x,
        padding: l
      }), W = N ? S ? z : H : S ? q : V;
      E[U] > v[U] && (W = Ze(W));
      var B = Ze(W), K = [];
      if (s && K.push(I[L] <= 0), c && K.push(I[W] <= 0, I[B] <= 0), K.every(function(re) {
        return re;
      })) {
        R = k, j = !1;
        break;
      }
      D.set(k, K);
    }
    if (j)
      for (var J = w ? 3 : 1, ce = function(_) {
        var ne = n.find(function(ge) {
          var ie = D.get(ge);
          if (ie)
            return ie.slice(0, _).every(function(ye) {
              return ye;
            });
        });
        if (ne)
          return R = ne, "break";
      }, Q = J; Q > 0; Q--) {
        var pe = ce(Q);
        if (pe === "break") break;
      }
    t.placement !== R && (t.modifiersData[i]._skip = !0, t.placement = R, t.reset = !0);
  }
}
const Gr = {
  name: "flip",
  enabled: !0,
  phase: "main",
  fn: _r,
  requiresIfExists: ["offset"],
  data: {
    _skip: !1
  }
};
function St(e, t, r) {
  return r === void 0 && (r = {
    x: 0,
    y: 0
  }), {
    top: e.top - t.height - r.y,
    right: e.right - t.width + r.x,
    bottom: e.bottom - t.height + r.y,
    left: e.left - t.width - r.x
  };
}
function Mt(e) {
  return [V, z, q, H].some(function(t) {
    return e[t] >= 0;
  });
}
function Kr(e) {
  var t = e.state, r = e.name, i = t.rects.reference, o = t.rects.popper, s = t.modifiersData.preventOverflow, f = We(t, {
    elementContext: "reference"
  }), c = We(t, {
    altBoundary: !0
  }), u = St(f, i), l = St(c, o, s), p = Mt(u), b = Mt(l);
  t.modifiersData[r] = {
    referenceClippingOffsets: u,
    popperEscapeOffsets: l,
    isReferenceHidden: p,
    hasPopperEscaped: b
  }, t.attributes.popper = Object.assign({}, t.attributes.popper, {
    "data-popper-reference-hidden": p,
    "data-popper-escaped": b
  });
}
const Jr = {
  name: "hide",
  enabled: !0,
  phase: "main",
  requiresIfExists: ["preventOverflow"],
  fn: Kr
};
function Qr(e, t, r) {
  var i = ee(e), o = [H, V].indexOf(i) >= 0 ? -1 : 1, s = typeof r == "function" ? r(Object.assign({}, t, {
    placement: e
  })) : r, f = s[0], c = s[1];
  return f = f || 0, c = (c || 0) * o, [H, z].indexOf(i) >= 0 ? {
    x: c,
    y: f
  } : {
    x: f,
    y: c
  };
}
function Zr(e) {
  var t = e.state, r = e.options, i = e.name, o = r.offset, s = o === void 0 ? [0, 0] : o, f = Ft.reduce(function(p, b) {
    return p[b] = Qr(b, t.rects, s), p;
  }, {}), c = f[t.placement], u = c.x, l = c.y;
  t.modifiersData.popperOffsets != null && (t.modifiersData.popperOffsets.x += u, t.modifiersData.popperOffsets.y += l), t.modifiersData[i] = f;
}
const en = {
  name: "offset",
  enabled: !0,
  phase: "main",
  requires: ["popperOffsets"],
  fn: Zr
};
function tn(e) {
  var t = e.state, r = e.name;
  t.modifiersData[r] = Jt({
    reference: t.rects.reference,
    element: t.rects.popper,
    strategy: "absolute",
    placement: t.placement
  });
}
const rn = {
  name: "popperOffsets",
  enabled: !0,
  phase: "read",
  fn: tn,
  data: {}
};
function nn(e) {
  return e === "x" ? "y" : "x";
}
function on(e) {
  var t = e.state, r = e.options, i = e.name, o = r.mainAxis, s = o === void 0 ? !0 : o, f = r.altAxis, c = f === void 0 ? !1 : f, u = r.boundary, l = r.rootBoundary, p = r.altBoundary, b = r.padding, x = r.tether, h = x === void 0 ? !0 : x, w = r.tetherOffset, g = w === void 0 ? 0 : w, y = We(t, {
    boundary: u,
    rootBoundary: l,
    padding: b,
    altBoundary: p
  }), T = ee(t.placement), C = Ce(t.placement), P = !C, n = yt(T), E = nn(n), v = t.modifiersData.popperOffsets, D = t.rects.reference, j = t.rects.popper, R = typeof g == "function" ? g(Object.assign({}, t.rects, {
    placement: t.placement
  })) : g, M = typeof R == "number" ? {
    mainAxis: R,
    altAxis: R
  } : Object.assign({
    mainAxis: 0,
    altAxis: 0
  }, R), k = t.modifiersData.offset ? t.modifiersData.offset[t.placement] : null, L = {
    x: 0,
    y: 0
  };
  if (v) {
    if (s) {
      var S, N = n === "y" ? V : H, U = n === "y" ? q : z, I = n === "y" ? "height" : "width", W = v[n], B = W + y[N], K = W - y[U], J = h ? -j[I] / 2 : 0, ce = C === Ee ? D[I] : j[I], Q = C === Ee ? -j[I] : -D[I], pe = t.elements.arrow, re = h && pe ? gt(pe) : {
        width: 0,
        height: 0
      }, _ = t.modifiersData["arrow#persistent"] ? t.modifiersData["arrow#persistent"].padding : zt(), ne = _[N], ge = _[U], ie = je(0, D[I], re[I]), ye = P ? D[I] / 2 - J - ie - ne - M.mainAxis : ce - ie - ne - M.mainAxis, se = P ? -D[I] / 2 + J + ie + ge + M.mainAxis : Q + ie + ge + M.mainAxis, be = t.elements.arrow && Ve(t.elements.arrow), He = be ? n === "y" ? be.clientTop || 0 : be.clientLeft || 0 : 0, De = (S = k?.[n]) != null ? S : 0, Ne = W + ye - De - He, Ue = W + se - De, Pe = je(h ? et(B, Ne) : B, W, h ? me(K, Ue) : K);
      v[n] = Pe, L[n] = Pe - W;
    }
    if (c) {
      var Se, Fe = n === "x" ? V : H, Ye = n === "x" ? q : z, oe = v[E], ue = E === "y" ? "height" : "width", Me = oe + y[Fe], le = oe - y[Ye], Le = [V, H].indexOf(T) !== -1, Xe = (Se = k?.[E]) != null ? Se : 0, qe = Le ? Me : oe - D[ue] - j[ue] - Xe + M.altAxis, ze = Le ? oe + D[ue] + j[ue] - Xe - M.altAxis : le, _e = h && Le ? Pr(qe, oe, ze) : je(h ? qe : Me, oe, h ? ze : le);
      v[E] = _e, L[E] = _e - oe;
    }
    t.modifiersData[i] = L;
  }
}
const an = {
  name: "preventOverflow",
  enabled: !0,
  phase: "main",
  fn: on,
  requiresIfExists: ["offset"]
};
function sn(e) {
  return {
    scrollLeft: e.scrollLeft,
    scrollTop: e.scrollTop
  };
}
function un(e) {
  return e === F(e) || !X(e) ? bt(e) : sn(e);
}
function fn(e) {
  var t = e.getBoundingClientRect(), r = Te(t.width) / e.offsetWidth || 1, i = Te(t.height) / e.offsetHeight || 1;
  return r !== 1 || i !== 1;
}
function cn(e, t, r) {
  r === void 0 && (r = !1);
  var i = X(t), o = X(t) && fn(t), s = fe(t), f = Ae(e, o, r), c = {
    scrollLeft: 0,
    scrollTop: 0
  }, u = {
    x: 0,
    y: 0
  };
  return (i || !i && !r) && ((te(t) !== "body" || // https://github.com/popperjs/popper-core/issues/1078
  Ot(s)) && (c = un(t)), X(t) ? (u = Ae(t, !0), u.x += t.clientLeft, u.y += t.clientTop) : s && (u.x = wt(s))), {
    x: f.left + c.scrollLeft - u.x,
    y: f.top + c.scrollTop - u.y,
    width: f.width,
    height: f.height
  };
}
function pn(e) {
  var t = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Set(), i = [];
  e.forEach(function(s) {
    t.set(s.name, s);
  });
  function o(s) {
    r.add(s.name);
    var f = [].concat(s.requires || [], s.requiresIfExists || []);
    f.forEach(function(c) {
      if (!r.has(c)) {
        var u = t.get(c);
        u && o(u);
      }
    }), i.push(s);
  }
  return e.forEach(function(s) {
    r.has(s.name) || o(s);
  }), i;
}
function ln(e) {
  var t = pn(e);
  return Er.reduce(function(r, i) {
    return r.concat(t.filter(function(o) {
      return o.phase === i;
    }));
  }, []);
}
function dn(e) {
  var t;
  return function() {
    return t || (t = new Promise(function(r) {
      Promise.resolve().then(function() {
        t = void 0, r(e());
      });
    })), t;
  };
}
function vn(e) {
  var t = e.reduce(function(r, i) {
    var o = r[i.name];
    return r[i.name] = o ? Object.assign({}, o, i, {
      options: Object.assign({}, o.options, i.options),
      data: Object.assign({}, o.data, i.data)
    }) : i, r;
  }, {});
  return Object.keys(t).map(function(r) {
    return t[r];
  });
}
var Lt = {
  placement: "bottom",
  modifiers: [],
  strategy: "absolute"
};
function Rt() {
  for (var e = arguments.length, t = new Array(e), r = 0; r < e; r++)
    t[r] = arguments[r];
  return !t.some(function(i) {
    return !(i && typeof i.getBoundingClientRect == "function");
  });
}
function mn(e) {
  e === void 0 && (e = {});
  var t = e, r = t.defaultModifiers, i = r === void 0 ? [] : r, o = t.defaultOptions, s = o === void 0 ? Lt : o;
  return function(c, u, l) {
    l === void 0 && (l = s);
    var p = {
      placement: "bottom",
      orderedModifiers: [],
      options: Object.assign({}, Lt, s),
      modifiersData: {},
      elements: {
        reference: c,
        popper: u
      },
      attributes: {},
      styles: {}
    }, b = [], x = !1, h = {
      state: p,
      setOptions: function(T) {
        var C = typeof T == "function" ? T(p.options) : T;
        g(), p.options = Object.assign({}, s, p.options, C), p.scrollParents = {
          reference: he(c) ? ke(c) : c.contextElement ? ke(c.contextElement) : [],
          popper: ke(u)
        };
        var P = ln(vn([].concat(i, p.options.modifiers)));
        return p.orderedModifiers = P.filter(function(n) {
          return n.enabled;
        }), w(), h.update();
      },
      // Sync update – it will always be executed, even if not necessary. This
      // is useful for low frequency updates where sync behavior simplifies the
      // logic.
      // For high frequency updates (e.g. `resize` and `scroll` events), always
      // prefer the async Popper#update method
      forceUpdate: function() {
        if (!x) {
          var T = p.elements, C = T.reference, P = T.popper;
          if (Rt(C, P)) {
            p.rects = {
              reference: cn(C, Ve(P), p.options.strategy === "fixed"),
              popper: gt(P)
            }, p.reset = !1, p.placement = p.options.placement, p.orderedModifiers.forEach(function(M) {
              return p.modifiersData[M.name] = Object.assign({}, M.data);
            });
            for (var n = 0; n < p.orderedModifiers.length; n++) {
              if (p.reset === !0) {
                p.reset = !1, n = -1;
                continue;
              }
              var E = p.orderedModifiers[n], v = E.fn, D = E.options, j = D === void 0 ? {} : D, R = E.name;
              typeof v == "function" && (p = v({
                state: p,
                options: j,
                name: R,
                instance: h
              }) || p);
            }
          }
        }
      },
      // Async and optimistically optimized update – it will not be executed if
      // not necessary (debounced to run at most once-per-tick)
      update: dn(function() {
        return new Promise(function(y) {
          h.forceUpdate(), y(p);
        });
      }),
      destroy: function() {
        g(), x = !0;
      }
    };
    if (!Rt(c, u))
      return h;
    h.setOptions(l).then(function(y) {
      !x && l.onFirstUpdate && l.onFirstUpdate(y);
    });
    function w() {
      p.orderedModifiers.forEach(function(y) {
        var T = y.name, C = y.options, P = C === void 0 ? {} : C, n = y.effect;
        if (typeof n == "function") {
          var E = n({
            state: p,
            name: T,
            instance: h,
            options: P
          }), v = function() {
          };
          b.push(E || v);
        }
      });
    }
    function g() {
      b.forEach(function(y) {
        return y();
      }), b = [];
    }
    return h;
  };
}
var hn = [$r, rn, Ir, Yt, en, Gr, an, Rr, Jr], gn = /* @__PURE__ */ mn({
  defaultModifiers: hn
});
var yn = "tippy-box", Qt = "tippy-content", bn = "tippy-backdrop", Zt = "tippy-arrow", er = "tippy-svg-arrow", ve = {
  passive: !0,
  capture: !0
}, tr = function() {
  return document.body;
};
function st(e, t, r) {
  if (Array.isArray(e)) {
    var i = e[t];
    return i ?? (Array.isArray(r) ? r[t] : r);
  }
  return e;
}
function xt(e, t) {
  var r = {}.toString.call(e);
  return r.indexOf("[object") === 0 && r.indexOf(t + "]") > -1;
}
function rr(e, t) {
  return typeof e == "function" ? e.apply(void 0, t) : e;
}
function jt(e, t) {
  if (t === 0)
    return e;
  var r;
  return function(i) {
    clearTimeout(r), r = setTimeout(function() {
      e(i);
    }, t);
  };
}
function wn(e) {
  return e.split(/\s+/).filter(Boolean);
}
function xe(e) {
  return [].concat(e);
}
function kt(e, t) {
  e.indexOf(t) === -1 && e.push(t);
}
function On(e) {
  return e.filter(function(t, r) {
    return e.indexOf(t) === r;
  });
}
function xn(e) {
  return e.split("-")[0];
}
function tt(e) {
  return [].slice.call(e);
}
function Bt(e) {
  return Object.keys(e).reduce(function(t, r) {
    return e[r] !== void 0 && (t[r] = e[r]), t;
  }, {});
}
function Be() {
  return document.createElement("div");
}
function nt(e) {
  return ["Element", "Fragment"].some(function(t) {
    return xt(e, t);
  });
}
function En(e) {
  return xt(e, "NodeList");
}
function Tn(e) {
  return xt(e, "MouseEvent");
}
function An(e) {
  return !!(e && e._tippy && e._tippy.reference === e);
}
function Cn(e) {
  return nt(e) ? [e] : En(e) ? tt(e) : Array.isArray(e) ? e : tt(document.querySelectorAll(e));
}
function ut(e, t) {
  e.forEach(function(r) {
    r && (r.style.transitionDuration = t + "ms");
  });
}
function It(e, t) {
  e.forEach(function(r) {
    r && r.setAttribute("data-state", t);
  });
}
function Dn(e) {
  var t, r = xe(e), i = r[0];
  return i != null && (t = i.ownerDocument) != null && t.body ? i.ownerDocument : document;
}
function Pn(e, t) {
  var r = t.clientX, i = t.clientY;
  return e.every(function(o) {
    var s = o.popperRect, f = o.popperState, c = o.props, u = c.interactiveBorder, l = xn(f.placement), p = f.modifiersData.offset;
    if (!p)
      return !0;
    var b = l === "bottom" ? p.top.y : 0, x = l === "top" ? p.bottom.y : 0, h = l === "right" ? p.left.x : 0, w = l === "left" ? p.right.x : 0, g = s.top - i + b > u, y = i - s.bottom - x > u, T = s.left - r + h > u, C = r - s.right - w > u;
    return g || y || T || C;
  });
}
function ft(e, t, r) {
  var i = t + "EventListener";
  ["transitionend", "webkitTransitionEnd"].forEach(function(o) {
    e[i](o, r);
  });
}
function Wt(e, t) {
  for (var r = t; r; ) {
    var i;
    if (e.contains(r))
      return !0;
    r = r.getRootNode == null || (i = r.getRootNode()) == null ? void 0 : i.host;
  }
  return !1;
}
var Z = {
  isTouch: !1
}, $t = 0;
function Sn() {
  Z.isTouch || (Z.isTouch = !0, window.performance && document.addEventListener("mousemove", nr));
}
function nr() {
  var e = performance.now();
  e - $t < 20 && (Z.isTouch = !1, document.removeEventListener("mousemove", nr)), $t = e;
}
function Mn() {
  var e = document.activeElement;
  if (An(e)) {
    var t = e._tippy;
    e.blur && !t.state.isVisible && e.blur();
  }
}
function Ln() {
  document.addEventListener("touchstart", Sn, ve), window.addEventListener("blur", Mn);
}
var Rn = typeof window < "u" && typeof document < "u", jn = Rn ? (
  // @ts-ignore
  !!window.msCrypto
) : !1;
var kn = {
  animateFill: !1,
  followCursor: !1,
  inlinePositioning: !1,
  sticky: !1
}, Bn = {
  allowHTML: !1,
  animation: "fade",
  arrow: !0,
  content: "",
  inertia: !1,
  maxWidth: 350,
  role: "tooltip",
  theme: "",
  zIndex: 9999
}, G = Object.assign({
  appendTo: tr,
  aria: {
    content: "auto",
    expanded: "auto"
  },
  delay: 0,
  duration: [300, 250],
  getReferenceClientRect: null,
  hideOnClick: !0,
  ignoreAttributes: !1,
  interactive: !1,
  interactiveBorder: 2,
  interactiveDebounce: 0,
  moveTransition: "",
  offset: [0, 10],
  onAfterUpdate: function() {
  },
  onBeforeUpdate: function() {
  },
  onCreate: function() {
  },
  onDestroy: function() {
  },
  onHidden: function() {
  },
  onHide: function() {
  },
  onMount: function() {
  },
  onShow: function() {
  },
  onShown: function() {
  },
  onTrigger: function() {
  },
  onUntrigger: function() {
  },
  onClickOutside: function() {
  },
  placement: "top",
  plugins: [],
  popperOptions: {},
  render: null,
  showOnCreate: !1,
  touch: !0,
  trigger: "mouseenter focus",
  triggerTarget: null
}, kn, Bn), In = Object.keys(G), Wn = function(t) {
  var r = Object.keys(t);
  r.forEach(function(i) {
    G[i] = t[i];
  });
};
function ir(e) {
  var t = e.plugins || [], r = t.reduce(function(i, o) {
    var s = o.name, f = o.defaultValue;
    if (s) {
      var c;
      i[s] = e[s] !== void 0 ? e[s] : (c = G[s]) != null ? c : f;
    }
    return i;
  }, {});
  return Object.assign({}, e, r);
}
function $n(e, t) {
  var r = t ? Object.keys(ir(Object.assign({}, G, {
    plugins: t
  }))) : In, i = r.reduce(function(o, s) {
    var f = (e.getAttribute("data-tippy-" + s) || "").trim();
    if (!f)
      return o;
    if (s === "content")
      o[s] = f;
    else
      try {
        o[s] = JSON.parse(f);
      } catch {
        o[s] = f;
      }
    return o;
  }, {});
  return i;
}
function Vt(e, t) {
  var r = Object.assign({}, t, {
    content: rr(t.content, [e])
  }, t.ignoreAttributes ? {} : $n(e, t.plugins));
  return r.aria = Object.assign({}, G.aria, r.aria), r.aria = {
    expanded: r.aria.expanded === "auto" ? t.interactive : r.aria.expanded,
    content: r.aria.content === "auto" ? t.interactive ? null : "describedby" : r.aria.content
  }, r;
}
var Vn = function() {
  return "innerHTML";
};
function dt(e, t) {
  e[Vn()] = t;
}
function Ht(e) {
  var t = Be();
  return e === !0 ? t.className = Zt : (t.className = er, nt(e) ? t.appendChild(e) : dt(t, e)), t;
}
function Nt(e, t) {
  nt(t.content) ? (dt(e, ""), e.appendChild(t.content)) : typeof t.content != "function" && (t.allowHTML ? dt(e, t.content) : e.textContent = t.content);
}
function vt(e) {
  var t = e.firstElementChild, r = tt(t.children);
  return {
    box: t,
    content: r.find(function(i) {
      return i.classList.contains(Qt);
    }),
    arrow: r.find(function(i) {
      return i.classList.contains(Zt) || i.classList.contains(er);
    }),
    backdrop: r.find(function(i) {
      return i.classList.contains(bn);
    })
  };
}
function or(e) {
  var t = Be(), r = Be();
  r.className = yn, r.setAttribute("data-state", "hidden"), r.setAttribute("tabindex", "-1");
  var i = Be();
  i.className = Qt, i.setAttribute("data-state", "hidden"), Nt(i, e.props), t.appendChild(r), r.appendChild(i), o(e.props, e.props);
  function o(s, f) {
    var c = vt(t), u = c.box, l = c.content, p = c.arrow;
    f.theme ? u.setAttribute("data-theme", f.theme) : u.removeAttribute("data-theme"), typeof f.animation == "string" ? u.setAttribute("data-animation", f.animation) : u.removeAttribute("data-animation"), f.inertia ? u.setAttribute("data-inertia", "") : u.removeAttribute("data-inertia"), u.style.maxWidth = typeof f.maxWidth == "number" ? f.maxWidth + "px" : f.maxWidth, f.role ? u.setAttribute("role", f.role) : u.removeAttribute("role"), (s.content !== f.content || s.allowHTML !== f.allowHTML) && Nt(l, e.props), f.arrow ? p ? s.arrow !== f.arrow && (u.removeChild(p), u.appendChild(Ht(f.arrow))) : u.appendChild(Ht(f.arrow)) : p && u.removeChild(p);
  }
  return {
    popper: t,
    onUpdate: o
  };
}
or.$$tippy = !0;
var Hn = 1, Qe = [], ct = [];
function Nn(e, t) {
  var r = Vt(e, Object.assign({}, G, ir(Bt(t)))), i, o, s, f = !1, c = !1, u = !1, l = !1, p, b, x, h = [], w = jt(Ne, r.interactiveDebounce), g, y = Hn++, T = null, C = On(r.plugins), P = {
    // Is the instance currently enabled?
    isEnabled: !0,
    // Is the tippy currently showing and not transitioning out?
    isVisible: !1,
    // Has the instance been destroyed?
    isDestroyed: !1,
    // Is the tippy currently mounted to the DOM?
    isMounted: !1,
    // Has the tippy finished transitioning in?
    isShown: !1
  }, n = {
    // properties
    id: y,
    reference: e,
    popper: Be(),
    popperInstance: T,
    props: r,
    state: P,
    plugins: C,
    // methods
    clearDelayTimeouts: qe,
    setProps: ze,
    setContent: _e,
    show: ar,
    hide: sr,
    hideWithInteractivity: ur,
    enable: Le,
    disable: Xe,
    unmount: fr,
    destroy: cr
  };
  if (!r.render)
    return n;
  var E = r.render(n), v = E.popper, D = E.onUpdate;
  v.setAttribute("data-tippy-root", ""), v.id = "tippy-" + n.id, n.popper = v, e._tippy = n, v._tippy = n;
  var j = C.map(function(a) {
    return a.fn(n);
  }), R = e.hasAttribute("aria-expanded");
  return be(), J(), W(), B("onCreate", [n]), r.showOnCreate && Me(), v.addEventListener("mouseenter", function() {
    n.props.interactive && n.state.isVisible && n.clearDelayTimeouts();
  }), v.addEventListener("mouseleave", function() {
    n.props.interactive && n.props.trigger.indexOf("mouseenter") >= 0 && N().addEventListener("mousemove", w);
  }), n;
  function M() {
    var a = n.props.touch;
    return Array.isArray(a) ? a : [a, 0];
  }
  function k() {
    return M()[0] === "hold";
  }
  function L() {
    var a;
    return !!((a = n.props.render) != null && a.$$tippy);
  }
  function S() {
    return g || e;
  }
  function N() {
    var a = S().parentNode;
    return a ? Dn(a) : document;
  }
  function U() {
    return vt(v);
  }
  function I(a) {
    return n.state.isMounted && !n.state.isVisible || Z.isTouch || p && p.type === "focus" ? 0 : st(n.props.delay, a ? 0 : 1, G.delay);
  }
  function W(a) {
    a === void 0 && (a = !1), v.style.pointerEvents = n.props.interactive && !a ? "" : "none", v.style.zIndex = "" + n.props.zIndex;
  }
  function B(a, d, m) {
    if (m === void 0 && (m = !0), j.forEach(function(O) {
      O[a] && O[a].apply(O, d);
    }), m) {
      var A;
      (A = n.props)[a].apply(A, d);
    }
  }
  function K() {
    var a = n.props.aria;
    if (a.content) {
      var d = "aria-" + a.content, m = v.id, A = xe(n.props.triggerTarget || e);
      A.forEach(function(O) {
        var $ = O.getAttribute(d);
        if (n.state.isVisible)
          O.setAttribute(d, $ ? $ + " " + m : m);
        else {
          var Y = $ && $.replace(m, "").trim();
          Y ? O.setAttribute(d, Y) : O.removeAttribute(d);
        }
      });
    }
  }
  function J() {
    if (!(R || !n.props.aria.expanded)) {
      var a = xe(n.props.triggerTarget || e);
      a.forEach(function(d) {
        n.props.interactive ? d.setAttribute("aria-expanded", n.state.isVisible && d === S() ? "true" : "false") : d.removeAttribute("aria-expanded");
      });
    }
  }
  function ce() {
    N().removeEventListener("mousemove", w), Qe = Qe.filter(function(a) {
      return a !== w;
    });
  }
  function Q(a) {
    if (!(Z.isTouch && (u || a.type === "mousedown"))) {
      var d = a.composedPath && a.composedPath()[0] || a.target;
      if (!(n.props.interactive && Wt(v, d))) {
        if (xe(n.props.triggerTarget || e).some(function(m) {
          return Wt(m, d);
        })) {
          if (Z.isTouch || n.state.isVisible && n.props.trigger.indexOf("click") >= 0)
            return;
        } else
          B("onClickOutside", [n, a]);
        n.props.hideOnClick === !0 && (n.clearDelayTimeouts(), n.hide(), c = !0, setTimeout(function() {
          c = !1;
        }), n.state.isMounted || ne());
      }
    }
  }
  function pe() {
    u = !0;
  }
  function re() {
    u = !1;
  }
  function _() {
    var a = N();
    a.addEventListener("mousedown", Q, !0), a.addEventListener("touchend", Q, ve), a.addEventListener("touchstart", re, ve), a.addEventListener("touchmove", pe, ve);
  }
  function ne() {
    var a = N();
    a.removeEventListener("mousedown", Q, !0), a.removeEventListener("touchend", Q, ve), a.removeEventListener("touchstart", re, ve), a.removeEventListener("touchmove", pe, ve);
  }
  function ge(a, d) {
    ye(a, function() {
      !n.state.isVisible && v.parentNode && v.parentNode.contains(v) && d();
    });
  }
  function ie(a, d) {
    ye(a, d);
  }
  function ye(a, d) {
    var m = U().box;
    function A(O) {
      O.target === m && (ft(m, "remove", A), d());
    }
    if (a === 0)
      return d();
    ft(m, "remove", b), ft(m, "add", A), b = A;
  }
  function se(a, d, m) {
    m === void 0 && (m = !1);
    var A = xe(n.props.triggerTarget || e);
    A.forEach(function(O) {
      O.addEventListener(a, d, m), h.push({
        node: O,
        eventType: a,
        handler: d,
        options: m
      });
    });
  }
  function be() {
    k() && (se("touchstart", De, {
      passive: !0
    }), se("touchend", Ue, {
      passive: !0
    })), wn(n.props.trigger).forEach(function(a) {
      if (a !== "manual")
        switch (se(a, De), a) {
          case "mouseenter":
            se("mouseleave", Ue);
            break;
          case "focus":
            se(jn ? "focusout" : "blur", Pe);
            break;
          case "focusin":
            se("focusout", Pe);
            break;
        }
    });
  }
  function He() {
    h.forEach(function(a) {
      var d = a.node, m = a.eventType, A = a.handler, O = a.options;
      d.removeEventListener(m, A, O);
    }), h = [];
  }
  function De(a) {
    var d, m = !1;
    if (!(!n.state.isEnabled || Se(a) || c)) {
      var A = ((d = p) == null ? void 0 : d.type) === "focus";
      p = a, g = a.currentTarget, J(), !n.state.isVisible && Tn(a) && Qe.forEach(function(O) {
        return O(a);
      }), a.type === "click" && (n.props.trigger.indexOf("mouseenter") < 0 || f) && n.props.hideOnClick !== !1 && n.state.isVisible ? m = !0 : Me(a), a.type === "click" && (f = !m), m && !A && le(a);
    }
  }
  function Ne(a) {
    var d = a.target, m = S().contains(d) || v.contains(d);
    if (!(a.type === "mousemove" && m)) {
      var A = ue().concat(v).map(function(O) {
        var $, Y = O._tippy, we = ($ = Y.popperInstance) == null ? void 0 : $.state;
        return we ? {
          popperRect: O.getBoundingClientRect(),
          popperState: we,
          props: r
        } : null;
      }).filter(Boolean);
      Pn(A, a) && (ce(), le(a));
    }
  }
  function Ue(a) {
    var d = Se(a) || n.props.trigger.indexOf("click") >= 0 && f;
    if (!d) {
      if (n.props.interactive) {
        n.hideWithInteractivity(a);
        return;
      }
      le(a);
    }
  }
  function Pe(a) {
    n.props.trigger.indexOf("focusin") < 0 && a.target !== S() || n.props.interactive && a.relatedTarget && v.contains(a.relatedTarget) || le(a);
  }
  function Se(a) {
    return Z.isTouch ? k() !== a.type.indexOf("touch") >= 0 : !1;
  }
  function Fe() {
    Ye();
    var a = n.props, d = a.popperOptions, m = a.placement, A = a.offset, O = a.getReferenceClientRect, $ = a.moveTransition, Y = L() ? vt(v).arrow : null, we = O ? {
      getBoundingClientRect: O,
      contextElement: O.contextElement || S()
    } : e, Et = {
      name: "$$tippy",
      enabled: !0,
      phase: "beforeWrite",
      requires: ["computeStyles"],
      fn: function(Ge) {
        var Oe = Ge.state;
        if (L()) {
          var pr = U(), at = pr.box;
          ["placement", "reference-hidden", "escaped"].forEach(function(Ke) {
            Ke === "placement" ? at.setAttribute("data-placement", Oe.placement) : Oe.attributes.popper["data-popper-" + Ke] ? at.setAttribute("data-" + Ke, "") : at.removeAttribute("data-" + Ke);
          }), Oe.attributes.popper = {};
        }
      }
    }, de = [{
      name: "offset",
      options: {
        offset: A
      }
    }, {
      name: "preventOverflow",
      options: {
        padding: {
          top: 2,
          bottom: 2,
          left: 5,
          right: 5
        }
      }
    }, {
      name: "flip",
      options: {
        padding: 5
      }
    }, {
      name: "computeStyles",
      options: {
        adaptive: !$
      }
    }, Et];
    L() && Y && de.push({
      name: "arrow",
      options: {
        element: Y,
        padding: 3
      }
    }), de.push.apply(de, d?.modifiers || []), n.popperInstance = gn(we, v, Object.assign({}, d, {
      placement: m,
      onFirstUpdate: x,
      modifiers: de
    }));
  }
  function Ye() {
    n.popperInstance && (n.popperInstance.destroy(), n.popperInstance = null);
  }
  function oe() {
    var a = n.props.appendTo, d, m = S();
    n.props.interactive && a === tr || a === "parent" ? d = m.parentNode : d = rr(a, [m]), d.contains(v) || d.appendChild(v), n.state.isMounted = !0, Fe();
  }
  function ue() {
    return tt(v.querySelectorAll("[data-tippy-root]"));
  }
  function Me(a) {
    n.clearDelayTimeouts(), a && B("onTrigger", [n, a]), _();
    var d = I(!0), m = M(), A = m[0], O = m[1];
    Z.isTouch && A === "hold" && O && (d = O), d ? i = setTimeout(function() {
      n.show();
    }, d) : n.show();
  }
  function le(a) {
    if (n.clearDelayTimeouts(), B("onUntrigger", [n, a]), !n.state.isVisible) {
      ne();
      return;
    }
    if (!(n.props.trigger.indexOf("mouseenter") >= 0 && n.props.trigger.indexOf("click") >= 0 && ["mouseleave", "mousemove"].indexOf(a.type) >= 0 && f)) {
      var d = I(!1);
      d ? o = setTimeout(function() {
        n.state.isVisible && n.hide();
      }, d) : s = requestAnimationFrame(function() {
        n.hide();
      });
    }
  }
  function Le() {
    n.state.isEnabled = !0;
  }
  function Xe() {
    n.hide(), n.state.isEnabled = !1;
  }
  function qe() {
    clearTimeout(i), clearTimeout(o), cancelAnimationFrame(s);
  }
  function ze(a) {
    if (!n.state.isDestroyed) {
      B("onBeforeUpdate", [n, a]), He();
      var d = n.props, m = Vt(e, Object.assign({}, d, Bt(a), {
        ignoreAttributes: !0
      }));
      n.props = m, be(), d.interactiveDebounce !== m.interactiveDebounce && (ce(), w = jt(Ne, m.interactiveDebounce)), d.triggerTarget && !m.triggerTarget ? xe(d.triggerTarget).forEach(function(A) {
        A.removeAttribute("aria-expanded");
      }) : m.triggerTarget && e.removeAttribute("aria-expanded"), J(), W(), D && D(d, m), n.popperInstance && (Fe(), ue().forEach(function(A) {
        requestAnimationFrame(A._tippy.popperInstance.forceUpdate);
      })), B("onAfterUpdate", [n, a]);
    }
  }
  function _e(a) {
    n.setProps({
      content: a
    });
  }
  function ar() {
    var a = n.state.isVisible, d = n.state.isDestroyed, m = !n.state.isEnabled, A = Z.isTouch && !n.props.touch, O = st(n.props.duration, 0, G.duration);
    if (!(a || d || m || A) && !S().hasAttribute("disabled") && (B("onShow", [n], !1), n.props.onShow(n) !== !1)) {
      if (n.state.isVisible = !0, L() && (v.style.visibility = "visible"), W(), _(), n.state.isMounted || (v.style.transition = "none"), L()) {
        var $ = U(), Y = $.box, we = $.content;
        ut([Y, we], 0);
      }
      x = function() {
        var de;
        if (!(!n.state.isVisible || l)) {
          if (l = !0, v.offsetHeight, v.style.transition = n.props.moveTransition, L() && n.props.animation) {
            var ot = U(), Ge = ot.box, Oe = ot.content;
            ut([Ge, Oe], O), It([Ge, Oe], "visible");
          }
          K(), J(), kt(ct, n), (de = n.popperInstance) == null || de.forceUpdate(), B("onMount", [n]), n.props.animation && L() && ie(O, function() {
            n.state.isShown = !0, B("onShown", [n]);
          });
        }
      }, oe();
    }
  }
  function sr() {
    var a = !n.state.isVisible, d = n.state.isDestroyed, m = !n.state.isEnabled, A = st(n.props.duration, 1, G.duration);
    if (!(a || d || m) && (B("onHide", [n], !1), n.props.onHide(n) !== !1)) {
      if (n.state.isVisible = !1, n.state.isShown = !1, l = !1, f = !1, L() && (v.style.visibility = "hidden"), ce(), ne(), W(!0), L()) {
        var O = U(), $ = O.box, Y = O.content;
        n.props.animation && (ut([$, Y], A), It([$, Y], "hidden"));
      }
      K(), J(), n.props.animation ? L() && ge(A, n.unmount) : n.unmount();
    }
  }
  function ur(a) {
    N().addEventListener("mousemove", w), kt(Qe, w), w(a);
  }
  function fr() {
    n.state.isVisible && n.hide(), n.state.isMounted && (Ye(), ue().forEach(function(a) {
      a._tippy.unmount();
    }), v.parentNode && v.parentNode.removeChild(v), ct = ct.filter(function(a) {
      return a !== n;
    }), n.state.isMounted = !1, B("onHidden", [n]));
  }
  function cr() {
    n.state.isDestroyed || (n.clearDelayTimeouts(), n.unmount(), He(), delete e._tippy, n.state.isDestroyed = !0, B("onDestroy", [n]));
  }
}
function it(e, t) {
  t === void 0 && (t = {});
  var r = G.plugins.concat(t.plugins || []);
  Ln();
  var i = Object.assign({}, t, {
    plugins: r
  }), o = Cn(e);
  if (0)
    var s, f;
  var c = o.reduce(function(u, l) {
    var p = l && Nn(l, i);
    return p && u.push(p), u;
  }, []);
  return nt(e) ? c[0] : c;
}
it.defaultProps = G;
it.setDefaultProps = Wn;
it.currentInput = Z;
var Un = Object.assign({}, Yt, {
  effect: function(t) {
    var r = t.state, i = {
      popper: {
        position: r.options.strategy,
        left: "0",
        top: "0",
        margin: "0"
      },
      arrow: {
        position: "absolute"
      },
      reference: {}
    };
    Object.assign(r.elements.popper.style, i.popper), r.styles = i, r.elements.arrow && Object.assign(r.elements.arrow.style, i.arrow);
  }
});
it.setDefaultProps({
  render: or
});
typeof window < "u" && (window.__ovum_has_tippy = !0);
export {
  it as default
};
