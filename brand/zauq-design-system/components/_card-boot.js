/**
 * Card bootstrap.
 *
 * A card prefers the compiled design-system bundle (\`_ds_bundle.js\`) when the
 * host has built one, and falls back to loading the component sources
 * directly so the card still renders standalone.
 *
 * ZauqCard.boot(demoSource) — demoSource defines Demo() and mounts it.
 */
window.ZauqCard = {
  files: [
    "../../components/brand/Wordmark.jsx",
    "../../components/brand/ArchMark.jsx",
    "../../components/actions/Button.jsx",
    "../../components/actions/IconButton.jsx",
    "../../components/actions/Chip.jsx",
    "../../components/forms/Field.jsx",
    "../../components/forms/Label.jsx",
    "../../components/forms/Tape.jsx",
    "../../components/navigation/Tabs.jsx",
    "../../components/navigation/Filter.jsx",
    "../../components/navigation/MoreMenu.jsx",
    "../../components/surfaces/Arch.jsx",
    "../../components/surfaces/MirrorFrame.jsx",
    "../../components/surfaces/Card.jsx",
    "../../components/surfaces/Plaque.jsx",
    "../../components/surfaces/PageShell.jsx",
    "../../components/surfaces/Modal.jsx",
    "../../components/data/GarmentTile.jsx",
    "../../components/data/Stat.jsx",
    "../../components/feedback/Alert.jsx",
    "../../components/feedback/Badge.jsx",
    "../../components/feedback/Toast.jsx",
    "../../components/feedback/Spinner.jsx"
  ],

  bundleNamespace() {
    const looksRight = (v) => v && typeof v === 'object' && v.Button && v.Arch && v.GarmentTile
    for (const key of ['ZAUQ', 'Zauq', 'ZAUQDesignSystem', 'ZauqDesignSystem', 'ZAUQLogoDirection']) {
      if (looksRight(window[key])) return window[key]
    }
    for (const key of Object.keys(window)) {
      try { if (looksRight(window[key])) return window[key] } catch (_) { /* cross-origin getter */ }
    }
    return null
  },

  /** Collect the names a module exports, so siblings can see them. */
  exportedNames(src) {
    const names = []
    const patterns = [
      /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm,
      /^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm,
      /^export\s+class\s+([A-Za-z0-9_$]+)/gm,
    ]
    for (const re of patterns) {
      let m
      while ((m = re.exec(src))) names.push(m[1])
    }
    return names
  },

  /**
   * Concatenate a list of .jsx files into one runnable script.
   *
   * Fetches are issued in PARALLEL and assembled by index — sequential awaits
   * cost ~350ms each, which put a 29-file kit at ten seconds and meant every
   * thumbnail captured the boot placeholder instead of the design. Order still
   * matters for scope threading, hence the assemble-by-index pass.
   *
   * Each file becomes its own IIFE, so two modules may declare the same
   * top-level name without colliding. Exports are hoisted into a shared scope
   * object and injected into every later module, which is what makes the
   * relative sibling imports work once they have been stripped.
   */
  async build(files) {
    const sources = await Promise.all(
      files.map(async (f) => {
        const res = await fetch(f)
        if (!res.ok) throw new Error(f + ' → ' + res.status)
        return res.text()
      }),
    )
    let out = 'const __S = {};\n'
    const seen = []
    files.forEach((f, i) => {
      const raw = sources[i]
      const names = this.exportedNames(raw)
      const body = raw.replace(/^[ \t]*import[ \t].*$/gm, '').replace(/^export[ \t]/gm, '')
      const inject = seen.length ? 'const { ' + seen.join(', ') + ' } = __S;\n' : ''
      const give = names.length ? 'Object.assign(__S, { ' + names.join(', ') + ' });\n' : ''
      out += '\n/* ' + f + ' */\n;(function () {\n' + inject + body + '\n' + give + '})();\n'
      for (const n of names) if (!seen.includes(n)) seen.push(n)
    })
    return { source: out, names: seen }
  },

  async boot(demoSource) {
    const root = document.getElementById('root')
    /* Only capitalised exports reach the bundle namespace, so lowercase helpers
     (e.g. the useFlash hook) must NOT be listed here — destructuring one binds
     undefined and the throw blanks the card. Hold that state in useState. */
    const NAMES = 'Wordmark, ArchMark, Button, IconButton, Chip, Field, Label, Tape, Tabs, Filter, MoreMenu, MenuItem, Arch, MirrorFrame, Card, Plaque, PageShell, SectionHead, Modal, GarmentTile, Stat, Alert, Badge, Toast, UndoBar, Spinner, SkeletonBlock, ArchSkeleton, LoadError'
    try {
      const ns = this.bundleNamespace()
      let prelude = ''
      if (ns) {
        window.__ZQ = ns
        prelude = 'const { ' + NAMES + ' } = window.__ZQ;\n'
      } else {
        const { source, names } = await this.build(this.files)
        prelude = source + (names.length ? 'const { ' + names.join(', ') + ' } = __S;\n' : '')
      }
      const code = window.Babel.transform(prelude + demoSource, {
        presets: [['react', { runtime: 'classic' }]],
      }).code
      new Function('React', 'ReactDOM', code)(window.React, window.ReactDOM)
    } catch (err) {
      root.innerHTML =
        '<pre style="margin:0;font:12px/1.7 ui-monospace,monospace;color:#d86c64;white-space:pre-wrap">' +
        String((err && (err.stack || err.message)) || err) +
        '</pre>'
    }
  },
}
