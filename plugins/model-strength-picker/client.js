/**
 * Client half of the model-strength-picker bundle.
 *
 * The panel IS the composer's model seat: this module registers into the
 * `conversation.input.model` single slot with a lower priority than the
 * built-in selector, so clicking 选择模型 opens this panel as a popover.
 * The popover mirrors the model-strength mockup: a 320px card, trigger-
 * centered, holding the pill (level + model + ›) over the strength slider;
 * clicking the pill fades the model dropdown in right below it (150ms), with
 * the mockup's interactions (outside press collapses the dropdown, Escape
 * steps back, Ctrl+Shift+M toggles it, 150ms level-label fade). Colors stay
 * on host theme tokens except the mockup's blue slider; the slider carries
 * the mockup's sizes (20px track, 28px round thumb, a dot on every level).
 * If this entry ever crashes, the slot's abdication semantics hand the cell
 * back to the built-in selector automatically.
 *
 * Data rides the SAME per-session model directory the built-in seat and the
 * /model popup use (`ctx.modelDirectories`); submissions go through
 * `directory.select`, which also persists the new-session default.
 *
 * Level declaration for third-party models lives in Settings → 模型
 * (`settings.models.footer` extension slot; volatile settings write → live).
 */
window.__ModuleLoader__.load({
  id: '@local/model-strength-picker',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { createPortal } = require('react-dom');

    const PKG_ID = '@local/model-strength-picker';
    const PLUGIN_VERSION = '0.10.1';
    const LLM_NS = 'llm-pi-ai';
    const SEAT = 'conversation.input.model';
    const FOOTER = 'settings.models.footer';
    const CANONICAL = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const CARD_W = 290;
    /* Slider geometry, shared by the component, its maths and the stylesheet:
       a 23px track with a 30px knob (1.3x the track, so it oversails it by
       3.5px top and bottom, per the reference design). */
    const TRACK_H = 23;
    const THUMB = 30;

    const labelOf = (id) => id === 'xhigh' ? 'X-High'
      : id ? id.charAt(0).toUpperCase() + id.slice(1) : '';
    /* Group ranking mirrors the built-in picker: the account route first,
       the official route second, everything else after, in catalog order. */
    const groupRank = (id) => (id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2);
    function sortedGroups(groups) {
      return groups
        .map((g, i) => ({ g, i }))
        .sort((a, b) => (groupRank(a.g.id) - groupRank(b.g.id)) || (a.i - b.i))
        .map((row) => row.g);
    }
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const clamp01 = (v) => clamp(v, 0, 1);
    const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const errorText = (error) => error && error.message ? error.message : String(error);

    /* Unwrap a client RemoteResult ({ok, value, error}) into a value or a throw. */
    async function callRemote(make) {
      const result = await make();
      if (!result || typeof result !== 'object' || !('ok' in result)) {
        throw new Error('远程调用返回了意外的结果');
      }
      if (!result.ok) {
        const e = result.error || {};
        throw new Error(`${e.code || 'remote'}: ${e.message || '调用失败'}`);
      }
      return result.value;
    }

    /* Colors are host theme tokens (the blue slider is the mockup's one
       exception); surfaces, radii, sizes and motion follow the mockup card. */
    const STYLE_CSS = `
.msp-root { min-width: 0; }

/* ----- trigger: the built-in 28px chip in the composer tool row ----- */
.msp-trigger {
  box-sizing: border-box;
  display: flex; align-items: center; gap: 4px;
  min-width: 0;
  max-width: 220px;
  max-width: min(360px, 45cqw);
  height: 28px;
  padding: 0 4px 0 8px;
  border: none; outline: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 13px; line-height: 20px; font-weight: 400;
  cursor: pointer;
}
.msp-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.msp-trigger:focus-visible { box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); }
.msp-trigger:disabled { color: var(--dsw-alias-label-dimmed); cursor: default; }
.msp-trigger-icon { display: var(--dsh-composer-model-icon-display, none); flex: 0 0 auto; }
.msp-trigger-label {
  display: var(--dsh-composer-model-text-display, block);
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.msp-trigger-effort {
  display: var(--dsh-composer-model-text-display, block);
  flex-shrink: 1000;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-caption);
}
.msp-trigger-chevron { flex: 0 0 auto; color: var(--dsw-alias-label-caption); transition: transform 120ms ease; }
.msp-trigger.open .msp-trigger-chevron { transform: rotate(180deg); }

/* ----- popover: fixed anchor sized to the docked composer (92px tall,
   290px wide — the mockup card's ~3.14:1 ratio). All inner dimensions are
   FINAL visual values (no CSS zoom: the desktop shell does not apply it,
   which made every card render oversized there). ----- */
.msp-pop {
  position: fixed; z-index: 1100;
  width: 290px; max-width: calc(100vw - 24px);
}
.msp-card {
  position: relative;
  box-sizing: border-box;
  width: 290px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  border-radius: 18px;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  padding: 11px 18px;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
  /* The mockup's slider blue — the one deliberate non-token color. */
  --msp-slider-fill: #2f6fed;
  --msp-slider-fill-deep: #1d4ed8;
}

/* ----- top pill (level + model + ›); the dropdown anchors to the card ----- */
.msp-top { position: static; }
.msp-pill-btn {
  display: block; width: 100%;
  border: 0; background: none; padding: 0;
  font: inherit; cursor: pointer; touch-action: none;
}
.msp-pill {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 5px 22px; border-radius: 14px;
  background: transparent;
  transition: background 150ms;
}
.msp-pill-btn:active .msp-pill, .msp-pill-btn.pressed .msp-pill {
  background: var(--dsw-alias-interactive-bg-hover);
  transition: none;
}
.msp-pill-level {
  font-size: 13.5px; font-weight: 700;
  /* Level names share the slider fill blue; Off keeps the muted grey. */
  color: var(--msp-slider-fill, var(--dsw-alias-brand-primary));
  transition: opacity 150ms;
}
.msp-pill-level.fading { opacity: 0; }
.msp-pill-level.off { color: var(--dsw-alias-label-tertiary); }
.msp-pill-model { font-size: 13.5px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.msp-pill-arrow { color: var(--dsw-alias-label-tertiary); }

/* ----- dropdown: opens as an overlay aligned with the popover's top and
   side edges (same radius), 1.55x the card's height so more rows show ----- */
.msp-dd {
  position: absolute; top: 0; left: 0; right: 0; height: 155%; z-index: 30;
  display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  border-radius: 18px;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  padding: 9px 0 7px;
  opacity: 0; visibility: hidden;
  transition: opacity 150ms, visibility 150ms;
}
.msp-dd.open { opacity: 1; visibility: visible; }
.msp-dd-title { font-size: 11px; color: var(--dsw-alias-label-tertiary); padding: 2px 18px 7px; }
.msp-dd-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.msp-option {
  position: relative;
  display: flex; align-items: center;
  width: 100%; height: 40px; padding: 0 18px;
  border: 0; background: none; outline: none;
  font: inherit; font-size: 13.5px; color: var(--dsw-alias-label-primary);
  text-align: left; cursor: pointer; touch-action: none;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.msp-option:active, .msp-option.pressed { background: var(--dsw-alias-interactive-bg-hover); }
.msp-option .msp-check {
  position: absolute; right: 18px;
  color: var(--dsw-alias-label-primary); font-size: 13px;
}
.msp-failure {
  padding: 6px 18px; font-size: 11px;
  color: var(--dsw-alias-state-error-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ----- strength slider: all geometry lives in SVG (see EffortSlider) -----
   Nothing here shapes a box: no border-radius, clip-path, transform or
   percentage width takes part in the track, the fill, the level dots or the
   knob. The desktop shell painted those CSS constructs as square dots and a
   squircle knob while an isolated page rendered them correctly, so the
   geometry was moved into SVG where every renderer must agree. */
.msp-pop-slider { margin-top: 7px; }
.msp-slider {
  position: relative; height: 30px; cursor: pointer;
  touch-action: none; outline: none;
}
.msp-slider.disabled { cursor: default; opacity: 0.6; }
.msp-svg { display: block; overflow: visible; }
.msp-svg-track { fill: var(--dsw-alias-interactive-bg-hover); }
.msp-svg-fill { fill: var(--msp-slider-fill, var(--dsw-alias-brand-primary)); }
.msp-svg-thumb { fill: var(--dsw-alias-bg-layer-1, #ffffff); }
.msp-svg-thumb-ring {
  fill: none;
  stroke: var(--dsw-alias-border-l2);
  stroke-width: 1;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.22));
}
.msp-slider:focus-visible .msp-svg-thumb-ring {
  stroke: var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  stroke-width: 2;
}
.msp-slider.dragging .msp-svg-thumb-ring {
  filter: drop-shadow(0 2px 7px rgba(0, 0, 0, 0.32));
}
.msp-hint { margin-top: 9px; font-size: 11px; color: var(--dsw-alias-label-tertiary); line-height: 1.5; }
.msp-error {
  margin-top: 8px; padding: 6px 7px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  font-size: 10px; line-height: 15px;
}

/* ----- settings card (Settings → 模型, page footer): theme tokens only ----- */
.msp-settings {
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2));
  border: 1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l4));
  border-radius: 12px;
  padding: 14px 16px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
.msp-settings-title { font-size: 14px; font-weight: 700; color: var(--dsw-alias-label-primary); }
.msp-default { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l4); }
.msp-settings-hint { margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.msp-rows { margin-top: 10px; }
.msp-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--dsw-alias-border-l4); }
.msp-row-head { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.msp-row-name {
  font-weight: 600; font-size: 13px; color: var(--dsw-alias-label-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.msp-row-group { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.msp-levels { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
.msp-level-tag {
  font-size: 11px; padding: 1px 8px; border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.msp-level-tag.none {
  color: var(--dsw-alias-label-tertiary);
  background: transparent; border: 1px dashed var(--dsw-alias-border-l3);
}
.msp-row-editor { padding: 4px 0 8px; border-top: 1px solid var(--dsw-alias-border-l4); }
.msp-row-editor .msp-editor { margin-top: 0; padding-top: 4px; }
.msp-editor { margin-top: 10px; }
.msp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.msp-chip {
  border: 1px solid var(--dsw-alias-border-l3); background: transparent;
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px; padding: 3px 10px; font-size: 12px; cursor: pointer; font-family: inherit;
}
.msp-chip.on {
  background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-layer-1);
}
.msp-editor-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-top: 10px; font-size: 12px; color: var(--dsw-alias-label-secondary);
}
.msp-editor-row select {
  font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l3); border-radius: 8px; background: transparent; padding: 2px 6px;
}
.msp-editor-hint { margin-top: 8px; font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.msp-editor-actions { display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end; }
.msp-mini-btn {
  border: 1px solid var(--dsw-alias-border-l3); background: transparent;
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px; padding: 3px 12px; font-size: 12px; cursor: pointer; font-family: inherit;
}
.msp-mini-btn.primary {
  background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-layer-1);
}
.msp-mini-btn:disabled { opacity: 0.5; cursor: default; }
`;

    /* ------------------------- shared slider ------------------------- */

    function EffortSlider(props) {
      const { levels, index, onCommit, disabled, label } = props;
      const n = levels.length;
      const ref = React.useRef(null);
      const drag = React.useRef(null);
      const [dragFraction, setDragFraction] = React.useState(null);
      // Track width in CSS pixels, measured for the SVG viewBox. The slider is
      // re-laid out whenever the popover is placed, so this stays accurate.
      const [trackW, setTrackW] = React.useState(0);

      const baseFraction = n > 1 ? clamp01(index / (n - 1)) : 0;
      const fraction = dragFraction !== null ? dragFraction : baseFraction;
      const shownIndex = dragFraction !== null
        ? clamp(Math.round(dragFraction * (n - 1)), 0, Math.max(0, n - 1))
        : clamp(index, 0, Math.max(0, n - 1));

      React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const measure = () => {
          const w = el.clientWidth;
          if (w > 0) setTrackW((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
        };
        measure();
        if (typeof ResizeObserver === 'function') {
          const ro = new ResizeObserver(measure);
          ro.observe(el);
          return () => ro.disconnect();
        }
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
      }, []);

      const fractionOf = (e) => {
        const el = ref.current;
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        const r = THUMB / 2;
        const denom = rect.width - 2 * r;
        return denom > 0 ? clamp01((e.clientX - rect.left - r) / denom) : 0;
      };
      const commitIndex = (i) => {
        if (disabled || n === 0) return;
        const ii = clamp(i, 0, n - 1);
        if (levels[ii] && onCommit) onCommit(ii);
      };
      const onPointerDown = (e) => {
        if (disabled || n === 0) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag.current = { id: e.pointerId, startX: e.clientX, moved: false };
        try { ref.current.setPointerCapture(e.pointerId); } catch (error) { /* noop */ }
        commitIndex(Math.round(fractionOf(e) * (n - 1)));
      };
      const onPointerMove = (e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        if (!d.moved && Math.abs(e.clientX - d.startX) < 3) return;
        d.moved = true;
        setDragFraction(fractionOf(e));
      };
      const endDrag = (e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        try { ref.current.releasePointerCapture(e.pointerId); } catch (error) { /* noop */ }
        if (d.moved) commitIndex(Math.round(fractionOf(e) * (n - 1)));
        drag.current = null;
        setDragFraction(null);
      };
      const onKeyDown = (e) => {
        if (disabled || n === 0) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); commitIndex(index - 1); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); commitIndex(index + 1); }
        else if (e.key === 'Home') { e.preventDefault(); commitIndex(0); }
        else if (e.key === 'End') { e.preventDefault(); commitIndex(n - 1); }
      };

      // Every rounded shape is real SVG geometry (rect rx / circle): no
      // border-radius, clip-path, transform or percentage width is involved,
      // so the knobs and the track caps rasterise identically on every
      // renderer. The previous CSS version was painted with square dots and a
      // squircle thumb inside the desktop shell while rendering correctly on
      // an isolated page, so the styling route was abandoned entirely.
      //
      // Geometry (all in SVG user units == CSS px, viewBox matches the box):
      //   track height 23, knob diameter 30 (1.3x the track, per the design),
      //   both vertically centred in a box D tall, so the knob oversails the
      //   track by (D - 23) / 2 on each side. The knob's centre travels from
      //   D/2 to W - D/2.
      //
      //   The fill starts at the knob's CENTRE, not at the track's left end.
      //   The track's left cap is itself a half-disc of radius 11.5 and stays
      //   blue at every setting, so the knob always has blue on both sides;
      //   filling only up to the knob (the first attempt) let the 30px knob
      //   swallow the whole fill at Off, leaving no blue visible at all.
      const W = Math.max(1, Math.round(trackW));
      const D = THUMB;
      const cy = D / 2;
      const trackY = cy - TRACK_H / 2;
      const inner = Math.max(0, W - D);
      const knobX = cy + inner * fraction;
      // Fill a touch past the knob's centre so the two stay visually tangent
      // whatever the renderer does with subpixel edges; the knob paints over
      // the overlap, so the extra pixel is never visible on its own.
      const fillW = knobX + 2;
      // At the minimum the knob sits over the whole fill. Drawing it anyway
      // left a blue crescent on the knob's rim: the fill's cap radius is
      // clamped to half its (small) width, making that edge flatter than the
      // knob's circular rim, so ~0.5px of blue escaped along an arc. Off means
      // no progress, so draw no fill at all -- the track reads as empty grey.
      const showFill = fraction > 0;
      const dotSpan = Math.max(0, inner - (TRACK_H / 2 - D / 2) * 2);
      const dotX0 = cy + (TRACK_H / 2 - D / 2);
      const dots = [];
      for (let i = 0; i < n; i++) {
        const pct = n > 1 ? i / (n - 1) : 0;
        const cx = dotX0 + dotSpan * pct;
        dots.push(h('circle', { key: 'd' + i, cx, cy, r: 3, fill: 'var(--dsw-alias-border-l3)' }));
      }
      const dotsCovered = [];
      for (let i = 0; i < n; i++) {
        const pct = n > 1 ? i / (n - 1) : 0;
        const cx = dotX0 + dotSpan * pct;
        dotsCovered.push(h('circle', { key: 'o' + i, cx, cy, r: 3, fill: 'rgba(255,255,255,0.4)' }));
      }

      return h('div', {
        ref,
        className: 'msp-slider' + (dragFraction !== null ? ' dragging' : '') + (disabled ? ' disabled' : ''),
        role: 'slider', tabIndex: disabled ? -1 : 0,
        'aria-label': label || '思考强度',
        'aria-valuemin': 0, 'aria-valuemax': Math.max(0, n - 1), 'aria-valuenow': shownIndex,
        'aria-valuetext': (levels[shownIndex] && levels[shownIndex].name) || '',
        onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onKeyDown,
      },
        h('svg', {
          className: 'msp-svg',
          width: '100%', height: D, viewBox: '0 0 ' + W + ' ' + D,
          preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false',
        },
          h('defs', null,
            h('clipPath', { id: 'mspFilled' },
              h('rect', { x: 0, y: 0, width: fillW, height: D }),
            ),
          ),
          h('rect', { className: 'msp-svg-track', x: 0, y: trackY, width: W, height: TRACK_H, rx: TRACK_H / 2, ry: TRACK_H / 2 }),
          showFill ? h('rect', { className: 'msp-svg-fill', x: 0, y: trackY, width: fillW, height: TRACK_H, rx: TRACK_H / 2, ry: TRACK_H / 2 }) : null,
          h('g', { className: 'msp-svg-dots' }, dots),
          showFill ? h('g', { className: 'msp-svg-dots-on', clipPath: 'url(#mspFilled)' }, dotsCovered) : null,
          // Disc at the full radius so it covers the fill's cap where they
          // meet; the ring sits half a pixel inside, putting its outer edge
          // exactly on the disc's edge.
          h('circle', { className: 'msp-svg-thumb', cx: knobX, cy, r: D / 2 }),
          h('circle', { className: 'msp-svg-thumb-ring', cx: knobX, cy, r: D / 2 - 0.5 }),
        ),
      );
    }

    const NON_OFF_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

    /** Fingerprint of the default-strength feature: every standard level
        self-spelled plus a valueless off. The level editor cannot produce
        this shape (it offers free selection), so a user's hand config —
        including a deliberate single level — is never mistaken for one. */
    function isFingerprint(re) {
      if (!isPlainObject(re) || re.off !== null) return false;
      return NON_OFF_LEVELS.every((k) => re[k] === k);
    }

    /** Legacy v0.7.x auto shape: one self-spelled level (+ optional valueless
        off). Still recognized so existing installs migrate on next apply. */
    function isLegacyAuto(re) {
      if (!isPlainObject(re)) return false;
      const keys = Object.keys(re).filter((k) => k !== 'off');
      if (keys.length !== 1 || re[keys[0]] !== keys[0]) return false;
      return re.off === null || re.off === undefined;
    }

    /** Derive the current default strength: the one route default shared by
        routes carrying fingerprint declarations (else a single legacy one). */
    function deriveDefaultLevel(providers) {
      if (!isPlainObject(providers)) return null;
      const fingerprintDefaults = new Set();
      const legacyDefaults = new Set();
      for (const route of Object.values(providers)) {
        if (!isPlainObject(route)) continue;
        let hasFingerprint = false;
        const models = Array.isArray(route.models) ? route.models : [];
        for (const m of models) {
          const re = m && m.reasoningEfforts;
          if (isFingerprint(re)) hasFingerprint = true;
          else if (isLegacyAuto(re)) {
            legacyDefaults.add(Object.keys(re).filter((k) => k !== 'off')[0]);
          }
        }
        if (hasFingerprint && typeof route.reasoning === 'string' && route.reasoning) {
          fingerprintDefaults.add(route.reasoning);
        }
      }
      if (fingerprintDefaults.size === 1) return fingerprintDefaults.values().next().value;
      if (fingerprintDefaults.size === 0 && legacyDefaults.size === 1) {
        return legacyDefaults.values().next().value;
      }
      return null;
    }

    /* --------------- store: settings card data (llm-pi-ai + catalog) --------------- */

    function createStore(ctx) {
      let state = {
        ready: false, groups: [], failures: [], llmView: null, defaultLevel: null,
        busy: false, error: '',
      };
      const subs = new Set();
      const set = (patch) => { state = { ...state, ...patch }; subs.forEach((fn) => fn()); };
      const get = () => state;

      async function fetchSettings() {
        const d = await callRemote(() => ctx.remote.settings.describe());
        const list = (d && d.namespaces) || [];
        const llm = list.find((ns) => ns && ns.ns === LLM_NS) || null;
        set({
          llmView: llm,
          defaultLevel: deriveDefaultLevel(llm && isPlainObject(llm.value) ? llm.value.providers : null),
        });
      }

      async function fetchCatalog() {
        const c = await callRemote(() => ctx.remote.session.modelCatalog());
        set({ groups: (c && c.groups) || [], failures: (c && c.failures) || [] });
      }

      async function refreshAll() {
        set({ error: '' });
        try {
          await Promise.all([fetchSettings(), fetchCatalog()]);
          set({ ready: true });
        } catch (error) {
          set({ ready: true, error: errorText(error) });
        }
      }

      /** Declare levels (and optional thinking format) for one model on its pi-ai route. */
      async function writeLlmLevels(provider, model, levels, thinkingFormat, attemptsLeft) {
        let view = state.llmView;
        if (!view) await fetchSettings();
        view = state.llmView;
        const value = (view && view.value) || {};
        const providers = isPlainObject(value.providers) ? value.providers : {};
        const route = isPlainObject(providers[provider]) ? providers[provider] : {};
        const models = Array.isArray(route.models) ? route.models.map((m) => (isPlainObject(m) ? { ...m } : m)) : [];
        const reasoningEfforts = {};
        for (const lv of levels) {
          if (CANONICAL.includes(lv)) reasoningEfforts[lv] = lv === 'off' ? null : lv;
        }
        let entry = models.find((m) => m && m.id === model);
        if (!entry) { entry = { id: model }; models.push(entry); }
        if (Object.keys(reasoningEfforts).length > 0) entry.reasoningEfforts = reasoningEfforts;
        else delete entry.reasoningEfforts;
        if (thinkingFormat === 'deepseek') {
          entry.compat = { ...(isPlainObject(entry.compat) ? entry.compat : {}), thinkingFormat: 'deepseek' };
        } else if (isPlainObject(entry.compat)) {
          const compat = { ...entry.compat };
          delete compat.thinkingFormat;
          if (Object.keys(compat).length > 0) entry.compat = compat;
          else delete entry.compat;
        }
        const patch = { providers: { [provider]: { models } } };
        try {
          await callRemote(() => ctx.remote.settings.update(LLM_NS, patch, view ? view.revision : undefined));
        } catch (error) {
          const message = errorText(error);
          if (attemptsLeft > 0 && /conflict/i.test(message)) {
            await fetchSettings();
            return writeLlmLevels(provider, model, levels, thinkingFormat, attemptsLeft - 1);
          }
          throw error;
        }
      }

      async function saveLevels(provider, model, levels, thinkingFormat) {
        set({ busy: true, error: '' });
        try {
          await writeLlmLevels(provider, model, levels, thinkingFormat, 1);
          await fetchSettings();
          await fetchCatalog();
          set({ busy: false });
        } catch (error) {
          set({ busy: false, error: errorText(error) });
        }
      }

      /**
       * Apply the default strength to every third-party model without its own
       * levels: declare the full standard level set on them, upgrade legacy
       * auto declarations, and make the level each route's default wherever
       * every model on the route supports it. Routes are written one by one —
       * a single refusing route fails alone.
       */
      async function applyDefaultLevel(level) {
        set({ busy: true, error: '' });
        try {
          if (!state.llmView) await fetchSettings();
          const view = state.llmView;
          const providers = view && isPlainObject(view.value) && isPlainObject(view.value.providers)
            ? view.value.providers : {};
          const failed = [];
          for (const route of Object.keys(providers)) {
            try {
              await writeRouteDefault(route, level, 1);
            } catch (error) {
              failed.push(`${route}: ${errorText(error)}`);
            }
          }
          await Promise.all([fetchSettings(), fetchCatalog()]);
          set({
            busy: false,
            error: failed.length > 0 ? `部分路由写入失败 — ${failed.join('；')}` : '',
          });
        } catch (error) {
          set({ busy: false, error: errorText(error) });
        }
      }

      /** Build + write one route's default-level declaration, conflict-retried. */
      async function writeRouteDefault(route, level, attemptsLeft) {
        let view = state.llmView;
        if (!view) await fetchSettings();
        view = state.llmView;
        const value = (view && view.value) || {};
        const providers = isPlainObject(value.providers) ? value.providers : {};
        const routeCfg = isPlainObject(providers[route]) ? providers[route] : {};
        const models = Array.isArray(routeCfg.models)
          ? routeCfg.models.map((m) => (isPlainObject(m) ? { ...m } : m))
          : [];
        const configIds = new Set(models.map((m) => m.id));
        const addedIds = new Set();
        const fingerprint = { off: null };
        for (const k of NON_OFF_LEVELS) fingerprint[k] = k;
        let changed = false;
        for (const m of models) {
          if (m.reasoningEfforts === undefined) {
            m.reasoningEfforts = { ...fingerprint };
            addedIds.add(m.id);
            changed = true;
          } else if (isLegacyAuto(m.reasoningEfforts)) {
            // Upgrade the legacy single-level auto shape to the fingerprint.
            m.reasoningEfforts = { ...fingerprint };
            changed = true;
          }
        }
        const resolved = (state.groups || []).find((g) => g.id === route);
        for (const rm of (resolved && resolved.models) || []) {
          if (configIds.has(rm.id) || addedIds.has(rm.id)) continue;
          const hasLevels = rm.reasoning && Array.isArray(rm.reasoning.efforts) && rm.reasoning.efforts.length > 0;
          if (hasLevels) continue;
          models.push({ id: rm.id, reasoningEfforts: { ...fingerprint } });
          addedIds.add(rm.id);
          changed = true;
        }
        // Route default: only when every resolved model will accept the level.
        let reasoningWrite;
        if (resolved && Array.isArray(resolved.models) && resolved.models.length > 0) {
          const safe = resolved.models.every((rm) => {
            if (addedIds.has(rm.id)) return true;
            const ids = (rm.reasoning && Array.isArray(rm.reasoning.efforts)
              ? rm.reasoning.efforts.map((e) => e.id) : []);
            return ids.length === 0 || ids.includes(level);
          });
          if (safe && routeCfg.reasoning !== level) {
            reasoningWrite = level;
            changed = true;
          }
        }
        if (!changed) return;
        try {
          await callRemote(() => ctx.remote.settings.update(
            LLM_NS,
            { providers: { [route]: { models, ...(reasoningWrite ? { reasoning: reasoningWrite } : {}) } } },
            view ? view.revision : undefined,
          ));
        } catch (error) {
          const message = errorText(error);
          if (attemptsLeft > 0 && /conflict/i.test(message)) {
            await fetchSettings();
            return writeRouteDefault(route, level, attemptsLeft - 1);
          }
          throw error;
        }
      }

      return {
        subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
        get, refreshAll, saveLevels, applyDefaultLevel,
      };
    }

    /* -------------- the composer model seat (trigger + mockup popover) -------------- */

    /** Mockup press highlight: :active is unreliable on touch, so pointer
        events toggle a .pressed class directly on the element. */
    function pressHandlers() {
      return {
        onPointerDown: (e) => { e.currentTarget.classList.add('pressed'); },
        onPointerUp: (e) => { e.currentTarget.classList.remove('pressed'); },
        onPointerLeave: (e) => { e.currentTarget.classList.remove('pressed'); },
        onPointerCancel: (e) => { e.currentTarget.classList.remove('pressed'); },
      };
    }

    function ModelSeat(props, store) {
      const { locked, available, directory, load, select } = props;
      const dirState = React.useSyncExternalStore(
        (fn) => directory.subscribe(fn),
        () => directory.getSnapshot(),
      );
      const storeState = React.useSyncExternalStore(store.subscribe, store.get);

      const [open, setOpen] = React.useState(false);
      const [ddOpen, setDdOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const [selectError, setSelectError] = React.useState('');
      const rootRef = React.useRef(null);
      const triggerRef = React.useRef(null);
      const cardRef = React.useRef(null);
      const pillRef = React.useRef(null);
      const ddRef = React.useRef(null);
      /* Anchor geometry captured when the popover opens. The trigger is a
         content-sized chip whose effort label changes width with the level, so
         centring on its live rect made the card shift on every slider click. */
      const anchorRef = React.useRef(null);

      const groups = sortedGroups(dirState.groups || []);
      const current = dirState.current || null;
      const flat = [];
      for (const g of groups) for (const m of g.models || []) flat.push({ group: g, model: m });
      const currentModel = current
        ? flat.find((row) => row.group.id === current.provider && row.model.id === current.model)
        : undefined;
      const efforts = currentModel && currentModel.model.reasoning && Array.isArray(currentModel.model.reasoning.efforts)
        ? currentModel.model.reasoning.efforts : [];
      const shownEffort = current
        ? (current.reasoningEffort
          || (currentModel && currentModel.model.reasoning && currentModel.model.reasoning.defaultEffort)
          || '')
        : '';
      // Display fallback: an undeclared model with a configured default level
      // previews that level instead of an empty state.
      const displayEffort = shownEffort
        || ((storeState.defaultLevel && efforts.some((e) => e.id === storeState.defaultLevel))
          ? storeState.defaultLevel
          : '');
      const busy = dirState.pending !== undefined && dirState.pending !== null;

      const llmProviders = storeState.llmView && isPlainObject(storeState.llmView.value)
        ? storeState.llmView.value.providers : null;
      const routeEditable = !!(current && llmProviders && isPlainObject(llmProviders[current.provider]));

      React.useEffect(() => { store.refreshAll(); }, [store]);

      const close = (restoreFocus = false) => {
        setOpen(false);
        setDdOpen(false);
        if (restoreFocus) queueMicrotask(() => { if (triggerRef.current) triggerRef.current.focus(); });
      };

      // Outside press collapses the open dropdown first (the mockup's
      // pointerdown grammar); outside the whole card it closes the popover.
      React.useEffect(() => {
        if (!open) return;
        const onPointerDown = (event) => {
          const inCard = cardRef.current && cardRef.current.contains(event.target);
          const inPill = pillRef.current && pillRef.current.contains(event.target);
          // The trigger is not "outside": pressing it must not pre-close the
          // popover, or the click's toggle would reopen instead of closing.
          const inTrigger = rootRef.current && rootRef.current.contains(event.target);
          if (ddOpen) {
            if (!inCard && !inPill && !inTrigger) setDdOpen(false);
            return;
          }
          if (!inCard && !inPill && !inTrigger) close();
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            if (ddOpen) setDdOpen(false);
            else close(true);
          } else if (event.ctrlKey && event.shiftKey && (event.key === 'M' || event.key === 'm')) {
            event.preventDefault();
            setDdOpen((v) => !v);
          }
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [open, ddOpen]);

      // Portaled placement: on the new-session hero (room below the composer
      // card) the popover hangs off the card's bottom-right corner — right
      // edges aligned, top just under the card, like the reference; when the
      // composer is docked at the viewport bottom there is no room below, so
      // it falls back to centered above the trigger. Both modes clamp inside
      // the viewport.
      //
      // The anchor is measured ONCE when the popover opens and reused for every
      // later re-placement. Re-measuring on each render made the card jump on
      // every slider click: the trigger chip carries the effort label, so its
      // width tracks the level, and centring on the widened chip moved the
      // card. Scroll/resize do re-measure, because then the page really moved.
      React.useLayoutEffect(() => {
        if (!open) { setPos(null); anchorRef.current = null; return undefined; }

        const measureAnchor = () => {
          const el = triggerRef.current;
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const composerEl = el.closest ? el.closest('[data-composer-card]') : null;
          const cRect = composerEl ? composerEl.getBoundingClientRect() : null;
          return {
            left: r.left, top: r.top, width: r.width,
            composerRight: cRect ? cRect.right : null,
            composerBottom: cRect ? cRect.bottom : null,
          };
        };

        const place = () => {
          const anchor = anchorRef.current;
          if (!anchor) return;
          const MARGIN = 12;
          const w = cardRef.current ? cardRef.current.offsetWidth : CARD_W;
          const hgt = cardRef.current ? cardRef.current.offsetHeight : 0;
          const clampX = (x) => (w > 0 ? Math.min(Math.max(x, MARGIN), window.innerWidth - w - MARGIN) : x);
          if (anchor.composerRight !== null && anchor.composerBottom !== null
            && hgt > 0 && window.innerHeight - anchor.composerBottom >= hgt + MARGIN) {
            setPos({ left: clampX(anchor.composerRight - w), top: anchor.composerBottom + 6 });
            return;
          }
          let x = anchor.left + anchor.width / 2 - w / 2;
          let y = anchor.top - 8 - hgt;
          x = clampX(x);
          if (hgt > 0) y = Math.min(Math.max(y, MARGIN), window.innerHeight - hgt - MARGIN);
          setPos({ left: x, top: y });
        };

        if (!anchorRef.current) anchorRef.current = measureAnchor();
        place();
        const onViewportChange = () => {
          anchorRef.current = measureAnchor();
          place();
        };
        window.addEventListener('scroll', onViewportChange, true);
        window.addEventListener('resize', onViewportChange);
        return () => {
          // Must match the registrations above: removing `place` here left the
          // real listeners attached on every re-render.
          window.removeEventListener('scroll', onViewportChange, true);
          window.removeEventListener('resize', onViewportChange);
        };
      }, [open, dirState, storeState, ddOpen]);

      // The pill's level label fades out/in (150ms) when the level changes.
      // Hooks stay above every conditional return.
      const [levelShown, setLevelShown] = React.useState(displayEffort);
      const [levelFading, setLevelFading] = React.useState(false);
      React.useEffect(() => {
        if (displayEffort === levelShown) return;
        setLevelFading(true);
        const t = setTimeout(() => { setLevelShown(displayEffort); setLevelFading(false); }, 150);
        return () => clearTimeout(t);
      }, [displayEffort, levelShown]);

      if (!available) return null;

      const modelLabel = dirState.status === 'loading' && !current
        ? '加载中…'
        : currentModel
          ? (currentModel.model.name || currentModel.model.id)
          : current
            ? `${current.provider}/${current.model}`
            : '选择模型';

      const applySelect = (selection, failText) => {
        if (busy) return;
        setSelectError('');
        const result = select(selection);
        if (result && typeof result.then === 'function') {
          result.then((r) => {
            if (r && !r.ok) {
              const e = r.error || {};
              setSelectError(`${e.code || 'remote'}: ${e.message || failText}`);
            }
          }).catch(() => { /* surfaced by the directory */ });
        }
      };

      const chooseModel = (group, model) => {
        const effort = model.reasoning && model.reasoning.defaultEffort;
        applySelect({
          provider: group.id, model: model.id,
          ...(effort ? { reasoningEffort: effort } : {}),
        }, '选择失败');
        setDdOpen(false);
      };

      const commitEffort = (i) => {
        if (!current) return;
        const effort = efforts[i];
        if (effort) applySelect({ provider: current.provider, model: current.model, reasoningEffort: effort.id }, '应用失败');
      };

      const press = pressHandlers();

      return h('div', { ref: rootRef, className: 'msp-root' },
        h('button', {
          ref: triggerRef,
          type: 'button',
          className: 'msp-trigger' + (open ? ' open' : ''),
          'aria-haspopup': 'dialog', 'aria-expanded': open ? 'true' : 'false',
          title: `${modelLabel}${shownEffort ? ' · ' + labelOf(shownEffort) : ''} · v${PLUGIN_VERSION}`,
          disabled: !!locked,
          onClick: () => {
            const next = !open;
            setOpen(next);
            setDdOpen(false);
            if (next) {
              setSelectError('');
              load();
            }
          },
        },
          h('span', { className: 'msp-trigger-icon', 'aria-hidden': true },
            h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none' },
              h('circle', { cx: 8, cy: 8, r: 6.2, stroke: 'currentColor', 'stroke-width': 1.4 }),
              h('circle', { cx: 8, cy: 8, r: 2, fill: 'currentColor' }),
            ),
          ),
          h('span', { className: 'msp-trigger-label' }, modelLabel),
          shownEffort && h('span', { className: 'msp-trigger-effort' }, labelOf(shownEffort)),
          h('svg', {
            className: 'msp-trigger-chevron', width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none',
            'aria-hidden': true,
          }, h('path', { d: 'M4 6l4 4 4-4', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
        ),
        open && createPortal(
          h('div', {
            ref: cardRef,
            className: 'msp-pop',
            style: pos || { visibility: 'hidden', left: 0, top: 0 },
            role: 'dialog', 'aria-label': '选择模型与思考强度',
          },
            h('div', { className: 'msp-card' },
            h('div', { className: 'msp-top' },
              h('button', {
                ref: pillRef,
                type: 'button',
                className: 'msp-pill-btn',
                'aria-haspopup': 'listbox', 'aria-expanded': ddOpen ? 'true' : 'false',
                onClick: () => setDdOpen((v) => !v),
                ...press,
              },
                h('span', { className: 'msp-pill' },
                  h('span', {
                    className: 'msp-pill-level'
                      + (levelFading ? ' fading' : '')
                      + (!levelShown || levelShown === 'off' ? ' off' : ''),
                  }, levelShown
                    ? labelOf(levelShown)
                    : (efforts.length > 0 ? '默认' : '未声明')),
                  h('span', { className: 'msp-pill-model' },
                    modelLabel, h('span', { className: 'msp-pill-arrow' }, ' ›')),
                ),
              ),
              h('div', {
                ref: ddRef,
                className: 'msp-dd' + (ddOpen ? ' open' : ''),
                role: 'listbox', 'aria-label': '选择模型',
              },
                h('div', { className: 'msp-dd-title' }, '选择模型'),
                h('div', { className: 'msp-dd-list' },
                  groups.flatMap((g) => {
                    const rows = (g.models || []).map((m) => {
                      const selected = current && current.provider === g.id && current.model === m.id;
                      return h('button', {
                        key: `${g.id}/${m.id}`,
                        type: 'button',
                        className: 'msp-option',
                        role: 'option', 'aria-selected': selected ? 'true' : 'false',
                        onClick: () => chooseModel(g, m),
                        ...press,
                      },
                        h('span', null, m.name || m.id),
                        selected ? h('span', { className: 'msp-check' }, '✓') : null,
                      );
                    });
                    return rows.length > 0
                      ? [h('div', { key: `g:${g.id}`, className: 'msp-dd-title' }, g.name || g.id), ...rows]
                      : rows;
                  }),
                  (dirState.failures || []).map((f) => h('div', { key: `f:${f.id}`, className: 'msp-failure' }, `${f.name || f.id}: ${f.message || ''}`)),
                  groups.length === 0 && h('div', { className: 'msp-failure' }, dirState.status === 'loading' ? '正在加载模型目录…' : '暂无可用模型'),
                ),
              ),
            ),
            h('div', { className: 'msp-pop-slider' },
              efforts.length > 0
                ? h(EffortSlider, {
                  levels: efforts.map((e) => ({ id: e.id, name: e.name || labelOf(e.id) })),
                  index: Math.max(0, efforts.findIndex((e) => e.id === displayEffort)),
                  disabled: busy || !current,
                  label: '思考强度',
                  onCommit: commitEffort,
                })
                : h('div', { className: 'msp-hint' },
                  routeEditable
                    ? '该模型未声明思考档位，可在 设置 → 模型 设置默认思考强度。'
                    : '该模型未声明思考档位（非 pi-ai 路由）。'),
              selectError && h('div', { className: 'msp-error', role: 'alert' }, selectError),
            ),
            ),
          ),
          document.body,
        ),
      );
    }

    /* ---------------- settings card (Settings → 模型, page footer) ---------------- */

    function declaredLevelsOf(entry) {
      return entry && isPlainObject(entry.reasoningEfforts)
        ? CANONICAL.filter((id) => Object.prototype.hasOwnProperty.call(entry.reasoningEfforts, id))
        : [];
    }
    function declaredFormatOf(entry) {
      return entry && isPlainObject(entry.compat) && entry.compat.thinkingFormat === 'deepseek'
        ? 'deepseek' : 'default';
    }

    function StrengthSettingsCard(props, store) {
      const state = React.useSyncExternalStore(store.subscribe, store.get);
      React.useEffect(() => { store.refreshAll(); }, [store]);

      const [editingKey, setEditingKey] = React.useState(null);
      const [draftLevels, setDraftLevels] = React.useState([]);
      const [draftFormat, setDraftFormat] = React.useState('default');
      const [editorError, setEditorError] = React.useState('');

      const providers = state.llmView && isPlainObject(state.llmView.value)
        ? state.llmView.value.providers : null;

      const rows = [];
      for (const g of sortedGroups(state.groups || [])) {
        // Models on an llm-pi-ai route are configurable here; models served by
        // other adapters (e.g. the DeepSeek account route) show their built-in
        // levels read-only.
        const editable = !!(providers && isPlainObject(providers[g.id]));
        for (const m of g.models || []) rows.push({ group: g, model: m, editable });
      }

      const openEditor = (row) => {
        const routeModels = providers[row.group.id].models || [];
        const entry = routeModels.find((m) => m && m.id === row.model.id);
        const declared = declaredLevelsOf(entry);
        setDraftLevels(declared.length > 0 ? declared : ['off', 'low', 'medium', 'high']);
        setDraftFormat(declaredFormatOf(entry));
        setEditorError('');
        setEditingKey(row.group.id + '/' + row.model.id);
      };
      const toggleDraft = (id) => {
        setDraftLevels((currentList) => currentList.includes(id)
          ? currentList.filter((x) => x !== id)
          : CANONICAL.filter((c) => currentList.includes(c) || c === id));
      };
      const saveDraft = (row) => {
        // A declaration beyond 'off' is required: the host refuses off-only
        // declarations, so failing here keeps the editor out of a dead end.
        if (!draftLevels.some((id) => id !== 'off')) {
          setEditorError('至少保留一个 Off 以外的档位，否则无法保存。');
          return;
        }
        setEditorError('');
        store.saveLevels(row.group.id, row.model.id, draftLevels, draftFormat);
        setEditingKey(null);
      };

      return h('div', { className: 'msp-root' },
        h('div', { className: 'msp-settings' },
          h('div', { className: 'msp-settings-title' }, '思考强度档位'),
          h('div', { className: 'msp-settings-hint' },
            '为 OpenAI 兼容（自定义）提供商的模型声明思考强度档位；保存后立即生效，模型选择器的强度滑块即出现这些档位。DeepSeek 系模型经兼容网关接入、off 关不掉思考时，请把思考开关格式选为「DeepSeek 兼容」。'),
          h('div', { className: 'msp-default' },
            h('div', { className: 'msp-editor-row' },
              h('span', null, '默认思考强度'),
              h('div', { className: 'msp-chips' },
                ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((id) => h('button', {
                  key: id, type: 'button',
                  className: 'msp-chip' + (state.defaultLevel === id ? ' on' : ''),
                  disabled: state.busy,
                  title: '为未声明档位的第三方模型声明全部标准档位，并将该档设为默认',
                  onClick: () => store.applyDefaultLevel(id),
                }, labelOf(id)))),
            ),
            h('div', { className: 'msp-settings-hint' },
              '为未单独配置档位的第三方模型提供默认档位（含 Off 开关）并作为其会话默认值，保存后立即生效；单独配置过档位的模型不受影响。'),
          ),
          rows.length === 0
            ? h('div', { className: 'msp-settings-hint' },
              state.ready ? '尚未发现可配置的第三方模型——先在上方添加自定义提供商与模型。' : '正在加载模型目录…')
            : h('div', { className: 'msp-rows' }, rows.flatMap((row) => {
              const key = row.group.id + '/' + row.model.id;
              const routeModels = row.editable && providers[row.group.id]
                ? (providers[row.group.id].models || [])
                : [];
              const entry = routeModels.find((m) => m && m.id === row.model.id);
              const tags = row.editable
                ? declaredLevelsOf(entry).map((id) => labelOf(id))
                : (row.model.reasoning && Array.isArray(row.model.reasoning.efforts)
                  ? row.model.reasoning.efforts.map((e) => e.name || labelOf(e.id))
                  : []);
              const editing = row.editable && editingKey === key;
              const head = h('div', { className: 'msp-row', key },
                h('div', { className: 'msp-row-head' },
                  h('span', { className: 'msp-row-name' }, row.model.name || row.model.id),
                  h('span', { className: 'msp-row-group' }, row.group.name || row.group.id),
                ),
                h('div', { className: 'msp-levels' },
                  tags.length > 0
                    ? tags.map((name, i) => h('span', { key: i, className: 'msp-level-tag' }, name))
                    : h('span', { className: 'msp-level-tag none' }, '未声明'),
                ),
                row.editable
                  ? h('button', {
                    className: 'msp-mini-btn', type: 'button',
                    onClick: () => (editing ? setEditingKey(null) : openEditor(row)),
                  }, editing ? '收起' : '编辑')
                  : h('span', {
                    className: 'msp-level-tag none',
                    title: '该模型的档位由其适配器内置提供，暂不可在此配置',
                  }, '内置'),
              );
              if (!editing) return [head];
              return [head, h('div', { className: 'msp-row-editor', key: key + ':editor' },
                h('div', { className: 'msp-editor' },
                  h('div', { className: 'msp-chips' }, CANONICAL.map((id) => h('button', {
                    key: id, type: 'button',
                    className: 'msp-chip' + (draftLevels.includes(id) ? ' on' : ''),
                    onClick: () => toggleDraft(id),
                  }, labelOf(id)))),
                  h('label', { className: 'msp-editor-row' },
                    h('span', null, '思考开关格式'),
                    h('select', { value: draftFormat, onChange: (e) => setDraftFormat(e.target.value) },
                      h('option', { value: 'default' }, '标准（off 不发送参数）'),
                      h('option', { value: 'deepseek' }, 'DeepSeek 兼容（thinking 开关）'),
                    ),
                  ),
                  h('div', { className: 'msp-editor-hint' },
                    'off 档默认不发送 reasoning_effort；DeepSeek 系模型经 OpenAI 兼容网关接入时请选「DeepSeek 兼容」，否则 off 可能无法停止思考。'),
                  editorError && h('div', { className: 'msp-error', role: 'alert' }, editorError),
                  h('div', { className: 'msp-editor-actions' },
                    h('button', {
                      className: 'msp-mini-btn primary', type: 'button', disabled: state.busy,
                      onClick: () => saveDraft(row),
                    }, '保存'),
                    h('button', { className: 'msp-mini-btn', type: 'button', onClick: () => setEditingKey(null) }, '取消'),
                  ),
                ),
              )];
            })),
          state.error && h('div', { className: 'msp-error', role: 'alert' }, state.error),
        ),
      );
    }

    /* ------------------------------ module apply ------------------------------ */

    return {
      inject: ['slots', 'remote', 'remote.settings', 'remote.session', 'modelDirectories', 'sessions'],
      apply(ctx) {
        const store = createStore(ctx);

        ctx.effect(() => {
          const style = document.createElement('style');
          style.setAttribute('data-plugin', PKG_ID);
          style.textContent = STYLE_CSS;
          document.head.appendChild(style);
          return () => style.remove();
        });

        ctx.effect(() => {
          const disposers = [];
          const on = (event, listener) => {
            try {
              if (ctx.remote && typeof ctx.remote.$on === 'function') {
                const off = ctx.remote.$on(event, listener);
                if (typeof off === 'function') disposers.push(off);
              }
            } catch (error) { /* event stream unavailable */ }
          };
          on('llm/adapters-updated', () => { store.refreshAll(); });
          on('settings/document-updated', () => { store.refreshAll(); });
          return () => disposers.forEach((off) => { try { off(); } catch (error) { /* noop */ } });
        });

        // The composer model seat: lower priority shadows the built-in occupant
        // (ascending priority, lowest renders); an abdicating crash hands the
        // cell back to the built-in selector automatically.
        ctx.inject(['slots', 'modelDirectories', 'sessions'], (scope) => {
          const models = scope.modelDirectories;
          const sessions = scope.sessions;
          scope.slots.inject(SEAT, () => scope.slots.register({
            name: SEAT,
            id: 'model-strength-picker',
            priority: -10,
            inject: (sessionId) => {
              const directory = models.directoryFor(sessionId);
              const seatAvailable = sessions.subagentAddress(sessionId) === undefined;
              return {
                available: seatAvailable,
                directory: directory.store,
                load: () => {
                  if (seatAvailable) directory.load().catch(() => { /* surfaced on the store */ });
                },
                select: (selection) => (seatAvailable
                  ? directory.select(selection)
                  : Promise.resolve(undefined)),
              };
            },
          }, (props) => ModelSeat(props, store)));
        });

        ctx.slots.inject(FOOTER, () => ctx.slots.register({
          name: FOOTER,
          id: 'model-strength-picker',
          order: 5,
        }, (props) => StrengthSettingsCard(props, store)));
      },
    };
  },
});
