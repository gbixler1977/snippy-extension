(function() {
  const files = [
    "codemirror/codemirror.js",
    "codemirror/xml.js",
    "codemirror/javascript.js",
    "codemirror/css.js",
    "codemirror/htmlmixed.js",
    "codemirror/matchbrackets.js",
    "codemirror/lint.js",
    "qb-formula-mode.js",
    "formula-beautifier.js",
    "lib/beautifier.bundle.js",
    "editor.js"
  ];

  function loadScripts(index = 0) {
    if (index >= files.length) return;

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(files[index]);
    script.onload = () => loadScripts(index + 1);
    script.onerror = () => console.error("[Snippy] Failed to load:", files[index]);
    document.head.appendChild(script);
  }

  loadScripts();
})();
