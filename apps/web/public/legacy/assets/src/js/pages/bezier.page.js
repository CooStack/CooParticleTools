(function () {
        var canvas = document.getElementById("c");
        var ctx = canvas.getContext("2d", { alpha: false });

        var modeBadge = document.getElementById("modeBadge");
        var targetBadge = document.getElementById("targetBadge");
        var handleBadge = document.getElementById("handleBadge");

        var tabValue = document.getElementById("tabValue");
        var tabSpeed = document.getElementById("tabSpeed");

        var tx = document.getElementById("tx");
        var ty = document.getElementById("ty");
        var countNum = document.getElementById("countNum");

        var clampToggle = document.getElementById("clampToggle");
        var btnToggleHelpers = document.getElementById("btnToggleHelpers");
        var btnReset = document.getElementById("btnReset");

        var viewMinInput = document.getElementById("viewMin");
        var viewMaxInput = document.getElementById("viewMax");
        var viewLabel = document.getElementById("viewLabel");

        var formatSel = document.getElementById("format");
        var btnExport = document.getElementById("btnExport");
        var btnCopy = document.getElementById("btnCopy");
        var out = document.getElementById("out");

        // state
        var mode = "value"; // value | speed
        var showHelpers = true;
        var clampOn = true;
        var count = 256;

        var target = { x: 1.0, y: 1.0, z: 0.0 };
        // canonical bezier control points (one set)
        var P1 = { x: 0.33, y: 0.0 };
        var P2 = { x: 0.66, y: 1.0 };

        var dragging = null; // p1,p2,s1,s2
        var lastClient = null;

        // view
        var pad = 52;
        var viewMin = -0.5;
        var viewMax = 1.5;

        // speed normalization
        var speedMin = -1;
        var speedMax = 1;

        // helpers
        function clamp(v, lo, hi) {
          return Math.min(hi, Math.max(lo, v));
        }
        function isFiniteNum(x) {
          return typeof x === "number" && isFinite(x);
        }

        function resize() {
          var dpr = Math.max(1, window.devicePixelRatio || 1);
          var rect = canvas.getBoundingClientRect();
          canvas.width = Math.floor(rect.width * dpr);
          canvas.height = Math.floor(rect.height * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        window.addEventListener("resize", resize);

        function setViewRangeFromInputs() {
          var a = Number(viewMinInput.value);
          var b = Number(viewMaxInput.value);
          if (!isFiniteNum(a)) a = -0.5;
          if (!isFiniteNum(b)) b = 1.5;
          if (Math.abs(b - a) < 1e-6) b = a + 1.0;
          viewMin = Math.min(a, b);
          viewMax = Math.max(a, b);
          viewLabel.textContent =
            "[" + viewMin.toFixed(2) + ", " + viewMax.toFixed(2) + "]";
        }

        function updateBadges() {
          modeBadge.textContent = mode === "value" ? "VALUE" : "SPEED";
          targetBadge.textContent =
            "target=(" + target.x.toFixed(2) + "," + target.y.toFixed(2) + ")";
          handleBadge.textContent =
            mode === "value" ? "handles=P1/P2" : "handles=S1/S2";
        }

        function setMode(m) {
          mode = m;
          tabValue.classList.toggle("active", mode === "value");
          tabSpeed.classList.toggle("active", mode === "speed");
          applyClampIfNeeded();
          updateBadges();
          refreshExport();
        }

        function screenW() {
          return canvas.getBoundingClientRect().width;
        }
        function screenH() {
          return canvas.getBoundingClientRect().height;
        }

        function toScreen(pt) {
          var w = screenW(),
            h = screenH();
          var nx = (pt.x - viewMin) / (viewMax - viewMin);
          var ny = (pt.y - viewMin) / (viewMax - viewMin);
          return {
            x: pad + nx * (w - pad * 2),
            y: h - pad - ny * (h - pad * 2),
          };
        }

        function screenDeltaToWorld(dx, dy) {
          var w = screenW(),
            h = screenH();
          var ww = w - pad * 2;
          var hh = h - pad * 2;
          var range = viewMax - viewMin;
          return {
            x: (dx / ww) * range,
            y: (-dy / hh) * range,
          };
        }

        function P0() {
          return { x: 0, y: 0 };
        }
        function P3() {
          return { x: target.x, y: target.y };
        }

        function applyClampIfNeeded() {
          if (!clampOn) return;

          // clamp range follows target
          var loX = Math.min(0, target.x),
            hiX = Math.max(0, target.x);
          var loY = Math.min(0, target.y),
            hiY = Math.max(0, target.y);

          if (mode === "value") {
            P1.x = clamp(P1.x, loX, hiX);
            P1.y = clamp(P1.y, loY, hiY);
            P2.x = clamp(P2.x, loX, hiX);
            P2.y = clamp(P2.y, loY, hiY);
          } else {
            // speed mode: clamp influence x only
            P1.x = clamp(P1.x, loX, hiX);
            P2.x = clamp(P2.x, loX, hiX);
          }
        }

        function bezierPoint(t) {
          var p0 = P0();
          var p3 = P3();
          var u = 1 - t;
          var u2 = u * u;
          var t2 = t * t;
          var x =
            u2 * u * p0.x +
            3 * u2 * t * P1.x +
            3 * u * t2 * P2.x +
            t2 * t * p3.x;
          var y =
            u2 * u * p0.y +
            3 * u2 * t * P1.y +
            3 * u * t2 * P2.y +
            t2 * t * p3.y;
          return { x: x, y: y };
        }

        function bezierDeriv(t) {
          var p0 = P0();
          var p3 = P3();
          var u = 1 - t;
          var a = 3 * u * u;
          var b = 6 * u * t;
          var c = 3 * t * t;
          var dx = a * (P1.x - p0.x) + b * (P2.x - P1.x) + c * (p3.x - P2.x);
          var dy = a * (P1.y - p0.y) + b * (P2.y - P1.y) + c * (p3.y - P2.y);
          return { x: dx, y: dy };
        }

        function recomputeSpeedRange(n) {
          var minS = Infinity,
            maxS = -Infinity;
          for (var i = 0; i < n; i++) {
            var t = n === 1 ? 1 : i / (n - 1);
            var d = bezierDeriv(t);
            var s = Math.abs(d.x) < 1e-9 ? 0 : d.y / d.x;
            if (s < minS) minS = s;
            if (s > maxS) maxS = s;
          }
          if (
            !isFiniteNum(minS) ||
            !isFiniteNum(maxS) ||
            Math.abs(maxS - minS) < 1e-9
          ) {
            minS = -1;
            maxS = 1;
          }
          speedMin = minS;
          speedMax = maxS;
        }

        function slopeToDisplayY(s) {
          var range = speedMax - speedMin;
          if (range < 1e-9) return target.y * 0.5;
          var yn = (s - speedMin) / range;
          return yn * target.y;
        }

        function displayYToSlope(y) {
          var range = speedMax - speedMin;
          if (range < 1e-9) return 0;
          var yn = target.y === 0 ? 0.5 : y / target.y;
          return speedMin + yn * range;
        }

        // speed handles (derived from canonical P1/P2)
        function getS1() {
          var x = P1.x;
          var s = Math.abs(P1.x) < 1e-9 ? 0 : P1.y / P1.x;
          return { x: x, slope: s, y: slopeToDisplayY(s) };
        }
        function getS2() {
          var p3 = P3();
          var dx = p3.x - P2.x;
          var s = Math.abs(dx) < 1e-9 ? 0 : (p3.y - P2.y) / dx;
          return { x: P2.x, slope: s, y: slopeToDisplayY(s) };
        }

        function drawBackground() {
          var w = screenW(),
            h = screenH();
          // base
          ctx.fillStyle = "#080c12";
          ctx.fillRect(0, 0, w, h);

          // subtle vignette
          var g = ctx.createRadialGradient(
            w * 0.35,
            h * 0.25,
            50,
            w * 0.35,
            h * 0.25,
            Math.max(w, h),
          );
          g.addColorStop(0, "rgba(71,162,237,0.08)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }

        function drawGrid() {
          var w = screenW(),
            h = screenH();

          // box
          ctx.strokeStyle = "rgba(34,49,73,1)";
          ctx.lineWidth = 1;
          ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

          // grid lines
          ctx.strokeStyle = "rgba(34,49,73,0.55)";
          for (var i = 1; i < 10; i++) {
            var gx = pad + (w - pad * 2) * (i / 10);
            var gy = pad + (h - pad * 2) * (i / 10);
            ctx.beginPath();
            ctx.moveTo(gx, pad);
            ctx.lineTo(gx, h - pad);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(pad, gy);
            ctx.lineTo(w - pad, gy);
            ctx.stroke();
          }

          // axes labels
          ctx.fillStyle = "rgba(159,178,207,0.9)";
          ctx.font =
            "12px " +
            getComputedStyle(document.documentElement).getPropertyValue(
              "--mono",
            );
          ctx.fillText(viewMin.toFixed(2), pad - 18, h - pad + 18);
          ctx.fillText(viewMax.toFixed(2), w - pad - 54, h - pad + 18);
          ctx.fillText(viewMax.toFixed(2), pad - 54, pad + 6);
        }

        function drawPoint(pt, label, accent) {
          var s = toScreen(pt);
          ctx.beginPath();
          ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = accent
            ? "rgba(71,162,237,0.95)"
            : "rgba(207,224,255,0.95)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(s.x, s.y, 12, 0, Math.PI * 2);
          ctx.strokeStyle = accent
            ? "rgba(71,162,237,0.30)"
            : "rgba(207,224,255,0.28)";
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = "rgba(207,224,255,0.92)";
          ctx.font =
            "12px " +
            getComputedStyle(document.documentElement).getPropertyValue(
              "--mono",
            );
          ctx.fillText(label, s.x + 10, s.y - 10);
        }

        function drawCurve() {
          var n = Math.max(2, count | 0);

          if (mode === "value") {
            // glow underlay
            ctx.lineWidth = 6;
            ctx.strokeStyle = "rgba(71,162,237,0.18)";
            ctx.beginPath();
            for (var i = 0; i < n; i++) {
              var t = n === 1 ? 1 : i / (n - 1);
              var p = bezierPoint(t);
              var s = toScreen(p);
              if (i === 0) ctx.moveTo(s.x, s.y);
              else ctx.lineTo(s.x, s.y);
            }
            ctx.stroke();

            // main line
            ctx.lineWidth = 3;
            ctx.strokeStyle = "rgba(71,162,237,0.95)";
            ctx.beginPath();
            for (var j = 0; j < n; j++) {
              var tt = n === 1 ? 1 : j / (n - 1);
              var pp = bezierPoint(tt);
              var ss = toScreen(pp);
              if (j === 0) ctx.moveTo(ss.x, ss.y);
              else ctx.lineTo(ss.x, ss.y);
            }
            ctx.stroke();

            return;
          }

          // speed
          recomputeSpeedRange(n);

          // baseline at mid
          ctx.strokeStyle = "rgba(255,255,255,0.10)";
          ctx.lineWidth = 2;
          var z0 = toScreen({ x: 0, y: target.y * 0.5 });
          var z1 = toScreen({ x: target.x, y: target.y * 0.5 });
          ctx.beginPath();
          ctx.moveTo(z0.x, z0.y);
          ctx.lineTo(z1.x, z1.y);
          ctx.stroke();

          // glow underlay
          ctx.lineWidth = 6;
          ctx.strokeStyle = "rgba(71,162,237,0.18)";
          ctx.beginPath();
          for (var i2 = 0; i2 < n; i2++) {
            var t2 = n === 1 ? 1 : i2 / (n - 1);
            var bp = bezierPoint(t2);
            var d = bezierDeriv(t2);
            var s = Math.abs(d.x) < 1e-9 ? 0 : d.y / d.x;
            var yDisp = slopeToDisplayY(s);
            var sc = toScreen({ x: bp.x, y: yDisp });
            if (i2 === 0) ctx.moveTo(sc.x, sc.y);
            else ctx.lineTo(sc.x, sc.y);
          }
          ctx.stroke();

          // main line
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(71,162,237,0.95)";
          ctx.beginPath();
          for (var j2 = 0; j2 < n; j2++) {
            var t3 = n === 1 ? 1 : j2 / (n - 1);
            var bp2 = bezierPoint(t3);
            var d2 = bezierDeriv(t3);
            var s2 = Math.abs(d2.x) < 1e-9 ? 0 : d2.y / d2.x;
            var yDisp2 = slopeToDisplayY(s2);
            var sc2 = toScreen({ x: bp2.x, y: yDisp2 });
            if (j2 === 0) ctx.moveTo(sc2.x, sc2.y);
            else ctx.lineTo(sc2.x, sc2.y);
          }
          ctx.stroke();
        }

        function drawHelpers() {
          if (!showHelpers) return;

          if (mode === "value") {
            // control polygon
            var p0s = toScreen({ x: 0, y: 0 });
            var p1s = toScreen(P1);
            var p2s = toScreen(P2);
            var p3s = toScreen(P3());

            ctx.strokeStyle = "rgba(159,178,207,0.28)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p0s.x, p0s.y);
            ctx.lineTo(p1s.x, p1s.y);
            ctx.lineTo(p2s.x, p2s.y);
            ctx.lineTo(p3s.x, p3s.y);
            ctx.stroke();

            // endpoints
            ctx.fillStyle = "rgba(159,178,207,0.85)";
            ctx.beginPath();
            ctx.arc(p0s.x, p0s.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p3s.x, p3s.y, 4, 0, Math.PI * 2);
            ctx.fill();

            drawPoint(P1, "P1", true);
            drawPoint(P2, "P2", false);
            return;
          }

          // speed handles
          recomputeSpeedRange(Math.max(64, count | 0));
          var s1 = getS1();
          var s2 = getS2();
          drawPoint({ x: s1.x, y: s1.y }, "S1", true);
          drawPoint({ x: s2.x, y: s2.y }, "S2", false);
        }

        function hitTest(mx, my) {
          var r = 14;
          if (mode === "value") {
            var a = toScreen(P1);
            var b = toScreen(P2);
            var d1 = Math.hypot(mx - a.x, my - a.y);
            var d2 = Math.hypot(mx - b.x, my - b.y);
            if (d1 <= r && d1 <= d2) return "p1";
            if (d2 <= r) return "p2";
            return null;
          }

          recomputeSpeedRange(Math.max(64, count | 0));
          var s1 = getS1();
          var s2 = getS2();
          var A = toScreen({ x: s1.x, y: s1.y });
          var B = toScreen({ x: s2.x, y: s2.y });
          var ds1 = Math.hypot(mx - A.x, my - A.y);
          var ds2 = Math.hypot(mx - B.x, my - B.y);
          if (ds1 <= r && ds1 <= ds2) return "s1";
          if (ds2 <= r) return "s2";
          return null;
        }

        canvas.addEventListener("pointerdown", function (e) {
          var rect = canvas.getBoundingClientRect();
          var mx = e.clientX - rect.left;
          var my = e.clientY - rect.top;
          var which = hitTest(mx, my);
          if (!which) return;
          dragging = which;
          lastClient = { x: e.clientX, y: e.clientY };
          canvas.setPointerCapture(e.pointerId);
        });

        canvas.addEventListener("pointermove", function (e) {
          if (!dragging || !lastClient) return;

          var dx = e.clientX - lastClient.x;
          var dy = e.clientY - lastClient.y;
          lastClient = { x: e.clientX, y: e.clientY };

          var dw = screenDeltaToWorld(dx, dy);

          if (mode === "value") {
            if (dragging === "p1") {
              P1.x += dw.x;
              P1.y += dw.y;
            }
            if (dragging === "p2") {
              P2.x += dw.x;
              P2.y += dw.y;
            }
            applyClampIfNeeded();
            refreshExport();
            return;
          }

          // speed mode: drag S1/S2 and invert to P1/P2
          recomputeSpeedRange(Math.max(64, count | 0));

          if (dragging === "s1") {
            var cur = getS1();
            var nx = cur.x + dw.x;
            var ny = cur.y + dw.y;

            if (clampOn) {
              var loX = Math.min(0, target.x),
                hiX = Math.max(0, target.x);
              nx = clamp(nx, loX, hiX);
            }
            var slope = displayYToSlope(ny);
            P1.x = nx;
            P1.y = slope * nx;
            applyClampIfNeeded();
            refreshExport();
            return;
          }

          if (dragging === "s2") {
            var cur2 = getS2();
            var nx2 = cur2.x + dw.x;
            var ny2 = cur2.y + dw.y;

            if (clampOn) {
              var loX2 = Math.min(0, target.x),
                hiX2 = Math.max(0, target.x);
              nx2 = clamp(nx2, loX2, hiX2);
            }
            var slope2 = displayYToSlope(ny2);

            P2.x = nx2;
            var dxEnd = target.x - nx2;
            if (Math.abs(dxEnd) >= 1e-9) {
              P2.y = target.y - slope2 * dxEnd;
            }
            applyClampIfNeeded();
            refreshExport();
            return;
          }
        });

        canvas.addEventListener("pointerup", function () {
          dragging = null;
          lastClient = null;
        });
        canvas.addEventListener("pointercancel", function () {
          dragging = null;
          lastClient = null;
        });

        // export
        function fmtK(n) {
          var s = Number(n).toFixed(6);
          s = s.replace(/0+$/, "").replace(/\.$/, ".0");
          if (s.indexOf(".") < 0) s = s + ".0";
          return s;
        }
        function targetRL() {
          return (
            "RelativeLocation(" +
            fmtK(target.x) +
            "," +
            fmtK(target.y) +
            ",0.0)"
          );
        }
        function startRL() {
          return "RelativeLocation(" + fmtK(P1.x) + "," + fmtK(P1.y) + ",0.0)";
        }
        function endRL() {
          var ex = P2.x - target.x;
          var ey = P2.y - target.y;
          return "RelativeLocation(" + fmtK(ex) + "," + fmtK(ey) + ",0.0)";
        }

        function codeByFormat() {
          var start = startRL();
          var end = endRL();
          var t = targetRL();
          var c = count | 0;

          var simpleCall =
            "Math3DUtil.generateBezierCurve(" +
            t +
            "," +
            start +
            "," +
            end +
            "," +
            c +
            ")";

          var fmt = formatSel.value;
          if (fmt === "simple") return simpleCall;
          if (fmt === "pointsBuilder")
            return (
              "PointsBuilder().addBezierCurve(" +
              t +
              "," +
              start +
              "," +
              end +
              "," +
              c +
              ")"
            );
          if (fmt === "pointsBuilderChain")
            return (
              ".addBezierCurve(" + t + "," + start + "," + end + "," + c + ")"
            );
          if (fmt === "styleScale")
            return (
              "HelperUtil.bezierValueScaleStyle(" +
              c +
              ",0.01,1.0," +
              start +
              "," +
              end +
              ")"
            );
          if (fmt === "groupScale")
            return (
              "HelperUtil.bezierValueScaleGroup(" +
              c +
              ",0.01,1.0," +
              start +
              "," +
              end +
              ")"
            );
          if (fmt === "compositionScale")
            return (
              "HelperUtil.bezierValueScaleComposition(" +
              c +
              ",0.01,1.0," +
              start +
              "," +
              end +
              ")"
            );
          return simpleCall;
        }
        function refreshExport() {
          out.value = codeByFormat();
        }

        // UI wiring
        tabValue.addEventListener("click", function () {
          setMode("value");
        });
        tabSpeed.addEventListener("click", function () {
          setMode("speed");
        });

        function setTargetFromInputs() {
          var x = Number(tx.value);
          var y = Number(ty.value);
          if (!isFiniteNum(x)) x = 1.0;
          if (!isFiniteNum(y)) y = 1.0;
          target.x = x;
          target.y = y;
          applyClampIfNeeded();
          updateBadges();
          refreshExport();
        }
        tx.addEventListener("input", setTargetFromInputs);
        ty.addEventListener("input", setTargetFromInputs);

        function setCountFromInput() {
          var n = Number(countNum.value);
          if (!isFiniteNum(n)) n = 256;
          n = Math.max(2, Math.min(4096, Math.floor(n)));
          count = n;
          countNum.value = String(n);
          refreshExport();
        }
        countNum.addEventListener("input", setCountFromInput);

        clampToggle.addEventListener("change", function () {
          clampOn = !!clampToggle.checked;
          applyClampIfNeeded();
          refreshExport();
        });

        btnToggleHelpers.addEventListener("click", function () {
          showHelpers = !showHelpers;
        });

        btnReset.addEventListener("click", function () {
          P1.x = 0.33;
          P1.y = 0.0;
          P2.x = 0.66;
          P2.y = 1.0;
          applyClampIfNeeded();
          refreshExport();
        });

        viewMinInput.addEventListener("input", function () {
          setViewRangeFromInputs();
        });
        viewMaxInput.addEventListener("input", function () {
          setViewRangeFromInputs();
        });

        formatSel.addEventListener("change", refreshExport);
        btnExport.addEventListener("click", refreshExport);

        btnCopy.addEventListener("click", function () {
          refreshExport();
          navigator.clipboard
            .writeText(out.value)
            .then(function () {
              btnCopy.textContent = "Copied";
              setTimeout(function () {
                btnCopy.textContent = "Copy";
              }, 900);
            })
            .catch(function () {
              btnCopy.textContent = "Copy failed";
              setTimeout(function () {
                btnCopy.textContent = "Copy";
              }, 1200);
            });
        });

        // render loop
        function loop() {
          drawBackground();
          drawGrid();
          drawCurve();
          drawHelpers();
          requestAnimationFrame(loop);
        }

        // init
        resize();
        setViewRangeFromInputs();

        target.x = 1.0;
        target.y = 1.0;
        tx.value = "1.0";
        ty.value = "1.0";

        clampOn = true;
        clampToggle.checked = true;

        setCountFromInput();
        setMode("value");
        updateBadges();
        applyClampIfNeeded();
        refreshExport();

        loop();
      })();
