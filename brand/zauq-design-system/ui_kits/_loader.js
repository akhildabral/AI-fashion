/**
 * A tiny standalone loader for the UI kits.
 *
 * The kits are plain .jsx files that import each other with relative paths.
 * Rather than depend on a bundler, this fetches each file, strips the
 * import/export keywords, wraps each one in its own IIFE (so two modules can
 * declare the same top-level name), threads the exports through a shared
 * scope, and hands the result to Babel with the CLASSIC JSX runtime — the
 * automatic runtime injects an \`import\` statement, which cannot run outside
 * a module.
 *
 * ZauqKit.mount(files, rootId, renderExpr)
 */
window.ZauqKit = {

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
        if (!res.ok) throw new Error(f + ' \u2192 ' + res.status)
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

  async mount(files, rootId, renderExpr) {
    const root = document.getElementById(rootId)
    try {
      const { source, names } = await this.build(files)
      const tail = names.length ? 'const { ' + names.join(', ') + ' } = __S;\n' : ''
      const code = window.Babel.transform(source + tail + renderExpr, {
        presets: [['react', { runtime: 'classic' }]],
      }).code
      root.innerHTML = ''
      new Function('React', 'ReactDOM', code)(window.React, window.ReactDOM)
    } catch (err) {
      root.innerHTML =
        '<pre style="margin:0;padding:24px;font:12px/1.7 ui-monospace,monospace;color:#d86c64;white-space:pre-wrap">' +
        String((err && (err.stack || err.message)) || err) +
        '</pre>'
    }
  },
}
