// Lightweight preview loader for component cards: compiles sibling .jsx files in-browser.
(function () {
  const load = s => new Promise((r, j) => { const e = document.createElement('script'); e.src = s; e.onload = r; e.onerror = j; document.head.appendChild(e); });
  window.dsPreview = async function (files) {
    if (!window.React) { await load('https://unpkg.com/react@18.3.1/umd/react.development.js'); await load('https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js'); }
    if (!window.Babel) await load('https://unpkg.com/@babel/standalone@7.29.0/babel.min.js');
    const lib = window.IPDS = window.IPDS || {};
    const tx = s => Babel.transform(s, { presets: ['react'] }).code;
    for (const f of files) {
      let src = await (await fetch(f)).text();
      const names = [...src.matchAll(/^export function (\w+)/mg)].map(m => m[1]);
      src = src.replace(/^import .*$/mg, '').replace(/^export function/mg, 'function');
      const deps = Object.keys(lib).filter(k => !names.includes(k));
      new Function('lib', 'React', (deps.length ? 'const {' + deps.join(',') + '} = lib;' : '') + tx(src) + ';' + names.map(n => 'lib.' + n + '=' + n + ';').join(''))(lib, React);
    }
    const card = document.querySelector('script[type="text/x-card"]').textContent;
    new Function('lib', 'React', 'ReactDOM', 'const {' + Object.keys(lib).join(',') + '} = lib;' + tx(card))(lib, React, ReactDOM);
  };
})();
