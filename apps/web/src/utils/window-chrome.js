/*
 * Resolves the *rendered* chrome colours for the Electron title bar overlay.
 *
 * Reading --panel directly is not enough: in the glass themes it is a
 * translucent value like rgba(255,255,255,.09), and the native window-control
 * overlay needs an opaque #rrggbb. So we probe the real computed colours through
 * a throwaway element (which resolves var() and color-mix()) and composite the
 * panel tint over the opaque page base.
 */

/*
 * A 1x1 canvas resolves *any* CSS colour syntax the engine supports to concrete
 * RGBA — rgb(), color(srgb ...), oklab(), lab(), hwb(), colour keywords — which
 * hand-written regexes cannot keep up with. The app already produces oklab() for
 * some themed backgrounds, and a parser that misses a syntax makes this return
 * null, silently leaving the native title bar on the previous theme's colours.
 *
 * parseCssColor below stays as the fallback for environments without canvas.
 */
let sharedCanvasContext;

function canvasResolveColor(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    if (!sharedCanvasContext) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      sharedCanvasContext = canvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = sharedCanvasContext;
    if (!ctx) return null;
    /*
     * An unparseable value leaves fillStyle at whatever it was, so seed an
     * unlikely sentinel and treat "still the sentinel" as a parse failure —
     * otherwise a typo'd token would silently resolve to opaque black instead of
     * falling through to the regex parser.
     */
    const SENTINEL = '#010203';
    ctx.fillStyle = SENTINEL;
    ctx.fillStyle = raw;
    if (ctx.fillStyle === SENTINEL && !/^#010203$/i.test(raw)) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  } catch {
    return null;
  }
}

function parseCssColor(text) {
  const raw = String(text || '');

  // Chromium serialises a resolved color-mix()/relative colour as
  // "color(srgb 0.42 0.63 0.97)" (channels 0..1, optional "/ alpha") rather than
  // rgb(). Handle it so tokens defined with color-mix still yield a chrome colour.
  const srgb = raw.match(/color\(\s*srgb\s+([^)]+)\)/i);
  if (srgb) {
    const parts = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      const alpha = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
      return {
        r: parts[0] * 255,
        g: parts[1] * 255,
        b: parts[2] * 255,
        a: Math.min(1, Math.max(0, alpha))
      };
    }
  }

  const match = raw.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  const alpha = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
  return { r: parts[0], g: parts[1], b: parts[2], a: Math.min(1, Math.max(0, alpha)) };
}

/** Canvas first (handles every syntax), regex as the fallback. */
function resolveColor(text) {
  return canvasResolveColor(text) || parseCssColor(text);
}

function compositeOver(foreground, background) {
  if (!foreground) return background;
  if (!background || foreground.a >= 1) return { ...foreground, a: 1 };
  const a = foreground.a;
  return {
    r: foreground.r * a + background.r * (1 - a),
    g: foreground.g * a + background.g * (1 - a),
    b: foreground.b * a + background.b * (1 - a),
    a: 1
  };
}

function toHex(color) {
  if (!color) return '';
  const channel = (value) => {
    const clamped = Math.min(255, Math.max(0, Math.round(value)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/**
 * @param {Element} host element carrying the theme tokens (body, or .generator-page)
 * @returns {{color: string, symbolColor: string} | null}
 */
export function readChromeColors(host) {
  const target = host || document.body;
  if (!target || typeof document === 'undefined') return null;

  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:0;height:0;pointer-events:none';
  target.appendChild(probe);

  const read = (property, value) => {
    probe.style.setProperty(property, value);
    const computed = window.getComputedStyle(probe);
    const raw = property === 'color' ? computed.color : computed.backgroundColor;
    probe.style.removeProperty(property);
    return resolveColor(raw);
  };

  try {
    const base = compositeOver(read('background-color', 'var(--bg)'), { r: 16, g: 19, b: 23, a: 1 });
    const panel = compositeOver(read('background-color', 'var(--panel)'), base);
    const text = compositeOver(read('color', 'var(--text)'), panel);
    const color = toHex(panel) || toHex(base);
    const symbolColor = toHex(text);
    if (!color || !symbolColor) return null;
    return { color, symbolColor };
  } catch {
    return null;
  } finally {
    probe.remove();
  }
}

/** The element that currently carries the theme tokens. */
export function findThemeHost() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.generator-page[data-theme]') || document.body;
}
