if (!window.SNIPPY_DEBUG_MODE) {
  console.log = console.info = console.debug = console.warn = () => {};
}

(function() {
	
	


  // Insert "Apply (Snippy™)" **only** on formula field edit pages.
  function snippyInsertApplyButtonForFormula(meta) {
    try {
      if (!meta || meta.type !== 'formula') return; // DO NOT show on Key Props

      // Try the known Save selector first; fallbacks keep it resilient
      const nativeSave =
        document.querySelector('#saveButton') ||
        document.querySelector('input[type="submit"][value="Save"]') ||
        Array.from(document.querySelectorAll('button,input[type="button"]'))
             .find(b => (b.textContent || b.value || '').trim() === 'Save');

      if (!nativeSave || nativeSave.__snippyApplyInstalled) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Apply (Snippy™)';
      btn.className = nativeSave.className || 'Vibrant Confirm ui-button ui-corner-all ui-widget';
      btn.style.marginLeft = '8px';

      btn.addEventListener('click', () => {
        try {
          // 1) Stash the current edit page URL before we click Save.
          //    This is the page we want to come back to after a successful save.
          const returnUrl = location.href;
          sessionStorage.setItem(SNIPPY_APPLY_STATE_KEY, JSON.stringify({ url: returnUrl, ts: Date.now() }));

          const startHref = location.href;
          let cancelled = false;

          // 2) Watch briefly for the Quickbase "Error" dialog. If it appears (and we did NOT navigate),
          //    clear the flag so we don't bounce on the next page.
          const pollMs = 80;
          const maxWaitMs = 3500;
          let waited = 0;

          const clearFlag = () => {
            try { sessionStorage.removeItem(SNIPPY_APPLY_STATE_KEY); } catch {}
          };

          const tick = () => {
            if (cancelled) return;
            waited += pollMs;

            // Success signal = URL changed (QB navigated away after Save)
            if (location.href !== startHref) return;

            // Failure signal = QB Error dialog with title "Error"
            const title = document.querySelector('.ui-dialog .ui-dialog-title');
            if (title && /error/i.test((title.textContent || '').trim())) {
              clearFlag();           // do NOT bounce back
              cancelled = true;      // stop polling
              return;
            }

            if (waited < maxWaitMs) {
              setTimeout(tick, pollMs);
            } else {
              // Timed out without navigation; be safe and clear the flag
              clearFlag();
              cancelled = true;
            }
          };
          setTimeout(tick, pollMs);

          // 3) Fire the real Save click so all native QB logic runs (and your backup interceptor still works).
          nativeSave.click();
        } catch (e) {
          console.warn('Snippy Apply start failed:', e);
        }
      });

      // Insert our button immediately to the right of Quickbase’s Save
      nativeSave.insertAdjacentElement('afterend', btn);
      nativeSave.__snippyApplyInstalled = true;
    } catch (e) {
      console.warn('Snippy: could not insert Apply button:', e);
    }
  }

	// === Snippy Selector Registry v1 ===
const SNIPPY_SELECTORS = {
  roots: {
    remix: '#remixRoot' // persistent SPA root (Quickbase Remix)
  },
  formula: {
    aceId: '#fexpr_aceEditor',          // field-level formula editor
    saveBtn: '#saveButton',
    applyBtn: null,                      // none
    errorDialogTitle: '.ui-dialog .ui-dialog-title', // text === "Error"
    successSignal: 'navigation'          // save navigates away
  },
  codePage: {
    textarea: 'textarea#pagetext',
    saveBtn: '#btnSaveDone',
    applyBtn: '#btnApply',
    jGrowl: '#jGrowl .jGrowl-notification', // "Page Saved"
    saveSuccess: 'navigation',
    applySuccess: 'toast'
  },
  keyProps: {
    aceId: '#tlvFormula_aceEditor',
    saveBtn: '#saveButton',
    applyBtn: null,
    errorDialogTitle: '.ui-dialog .ui-dialog-title',
    successSignal: 'reload' // stays on page but reloads
  }
};

  let originalElement = null;
  let editorType = null;
  let isInitialized = false;
  let isEditorOpen = false; 
  let launchButton = null;
  let controlPanel = null;
  let parentHeartbeatInterval = null; 
  let snippyPageWorldReady = false;
  let lastOverlayCode = null;
// ---- Quickbase Save/Apply interception config ----
// Tweak these if your environment uses different IDs/classes.
// Formula Fields: usually #saveButton
// Code Pages: usually #btnSaveDone (Save) and #btnApply (Apply)
// KeyProps: usually #saveButton
const QB_SAVE_SELECTORS = {
  formula: ['#saveButton'],
  codePage: ['#btnSaveDone', '#btnApply'],
  keyprops: ['#saveButton'],
};



  const unloadMessage = 'You have an open Snippy editor. Are you sure you want to leave this page? Changes in the editor may not be savable.';
  function handleBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = unloadMessage;
    return unloadMessage;
  }
  
  function snippyExpandFormulaEditorIfPossible() {
  try {
    // Typical selector: <a class="FormulaBuilderResizer Icon FullscreenIcon Tipsified" ...>
    const btn = document.querySelector('a.FormulaBuilderResizer.FullscreenIcon');
    if (btn && btn.offsetParent !== null) {
      btn.click();
      // Give layout a moment to expand before we position the overlay
      return new Promise(res => setTimeout(res, 120));
    }
  } catch {}
  return Promise.resolve();
}
function snippyGrowKeyPropsIfNeeded(targetEl) {
  try {
    if (!targetEl) return;
    const minH = 520; // tweak if you want taller
    const rect = targetEl.getBoundingClientRect();
    if (rect.height < minH) {
      targetEl.style.height = `${minH}px`;
      // ACE sometimes uses an inner scroller; try to push that too
      const scroller = targetEl.querySelector('.ace_scroller');
      if (scroller) scroller.style.height = `${Math.max(minH - 32, 300)}px`;
    }
  } catch {}
}

function snippyWidenKeyPropsIfNeeded(targetEl) {
  try {
    if (!targetEl) return;
    // Compute the available width from the editor's left edge to the content area's right edge
    const r = targetEl.getBoundingClientRect();
    const content = document.querySelector('#remixRoot') || document.documentElement;
    const cr = content.getBoundingClientRect();

    // Leave a small margin on the right so we don't hug the scrollbar
    const rightPadding = 24;
    const desiredWidth = Math.max(980, Math.floor((cr.right - r.left) - rightPadding)); // min ~980px

    // Apply to ACE host and inner scroller
    targetEl.style.width = `${desiredWidth}px`;
    targetEl.style.maxWidth = 'none';

    const scroller = targetEl.querySelector('.ace_scroller');
    if (scroller) {
      scroller.style.width = `${Math.max(desiredWidth - 4, 600)}px`;
    }
  } catch {}
}


// Hide Quickbase's "Choose fields & functions" helper while overlay is open
let snippyFormulaHelperWasHidden = false;
function snippyHideFormulaHelperIfPresent() {
  try {
    const helper = document.querySelector('#formulaHelperContainer');
    if (helper && helper.offsetParent !== null) {
      helper.classList.add('snippy-hidden-helper'); // collapses space
      snippyFormulaHelperWasHidden = true;
      // Return a small undo function
      return () => {
        try {
          helper.classList.remove('snippy-hidden-helper');
        } catch {}
      };
    }
  } catch {}
  // No-op undo if not present
  return () => {};
}

// Wait for page_world_script.js to signal it's ready (ACE bound), or time out
function snippyWaitForPageWorldReady(timeoutMs = 2000) {
  if (snippyPageWorldReady) return Promise.resolve(true); // already saw it once

  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; window.removeEventListener('message', onMsg); resolve(false); }
    }, timeoutMs);

    function onMsg(e) {
      const d = e.data;
      if (e.source !== window) return;
      if (d?.source === 'snippy-page-world' && d.command === 'ready') {
        if (!done) {
          snippyPageWorldReady = true;
          done = true;
          clearTimeout(timer);
          window.removeEventListener('message', onMsg);
          resolve(true);
        }
      }
    }
    window.addEventListener('message', onMsg);
  });
}
  // Insert "Apply (Snippy™)" on formula field edit pages only (NOT Key Props).
  function snippyInsertApplyButtonForFormula(meta) {
    try {
      if (!meta || meta.type !== 'formula') return; // don’t add on Key Props

      // Try common Save selectors; fallbacks to keep it resilient.
      const nativeSave =
        document.querySelector('#saveButton') ||
        document.querySelector('input[type="submit"][value="Save"]') ||
        Array.from(document.querySelectorAll('button,input[type="button"]'))
             .find(b => (b.textContent || b.value || '').trim() === 'Save');

      if (!nativeSave || nativeSave.__snippyApplyInstalled) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Apply (Snippy™)';
      btn.className = nativeSave.className || 'Vibrant Confirm ui-button ui-corner-all ui-widget';
      btn.style.marginLeft = '8px';

   btn.addEventListener('click', () => {
        try {
          // 1) Tell background we’re starting an Apply. It will watch the next navigation in this tab.
          const returnUrl = snippyCanonicalMfUrlFromMeta();
          chrome.runtime.sendMessage({ action: 'snippyApplyBegin', returnUrl });

          // 2) Click the real Save so all native QB logic runs.
          //    The background.js onUpdated listener will handle the success (bounce).
          //    The global snippyWatchForErrorDialogAndCancelApply will handle the failure (cancel).
          nativeSave.click();
        } catch (e) {
          console.warn('Snippy Apply start failed:', e);
          // extra safety: cancel if we threw before navigating
          chrome.runtime.sendMessage({ action: 'snippyApplyCancel' });
        }
      });

      // Place our button immediately to the right of QB’s Save
      nativeSave.insertAdjacentElement('afterend', btn);
      nativeSave.__snippyApplyInstalled = true;
    } catch (e) {
      console.warn('Snippy: could not insert Apply button:', e);
    }
  }

// Global watcher: if Quickbase shows an Error dialog at any time, cancel any pending Apply bounce.
function snippyWatchForErrorDialogAndCancelApply() {
  let armed = true; // only send once per appearance
  const mo = new MutationObserver(() => {
    if (!armed) return;
    const title = document.querySelector('.ui-dialog .ui-dialog-title');
    if (title && /error/i.test((title.textContent || '').trim())) {
      armed = false;
      try { chrome.runtime.sendMessage({ action: 'snippyApplyCancel' }); } catch {}
      // re-arm after a short delay in case the dialog is rebuilt
      setTimeout(() => { armed = true; }, 1500);
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
}

function snippyCanonicalMfUrlFromCurrent() {
  try {
    const url = new URL(location.href);
    const m = url.pathname.match(/\/nav\/app\/([^/]+)\/table\/([^/]+)\/action\/([^/]+)/i);
    if (!m) return location.href; // non-standard; fallback
    const [, appId, tableId] = m;

    // Try to get fid from the URL first
    let fid = url.searchParams.get('fid');

    // If fid missing (possible on DoModFieldForm), try DOM fallback
    if (!fid) {
      const fidInput = document.querySelector('input[name="fid"], #fid, [data-fid]');
      if (fidInput) {
        fid = fidInput.value || fidInput.getAttribute('data-fid') || '';
      }
    }
    if (!fid) return location.href; // last resort

    // Build canonical mf URL
    const mf = new URL(`/nav/app/${appId}/table/${tableId}/action/mf`, url.origin);
    mf.searchParams.set('fid', String(fid));
    return mf.toString();
  } catch {
    return location.href;
  }
}
function snippyCanonicalMfUrlFromMeta() {
  try {
    const meta = window.__snippyMeta || (typeof getPageMetadata === 'function' ? getPageMetadata() : null);
    if (!meta || meta.type !== 'formula') return location.href;

    const { tableId, fieldId } = meta;
    if (!tableId || !fieldId) return location.href;

    const url = new URL(location.href);
    const mf = new URL(`/nav/app/${url.pathname.match(/\/nav\/app\/([^/]+)/)?.[1] || ''}/table/${tableId}/action/mf`, url.origin);
    mf.searchParams.set('fid', String(fieldId));
    return mf.toString();
  } catch {
    return location.href;
  }
}


  function initializeSnippyUI(element, type) {
    if (isInitialized) return;
    isInitialized = true;
    originalElement = element;
    editorType = type;
	// Cache page metadata for later (fid/tableId are stable even if URL flips to DoModFieldForm)
const __snippyMeta = getPageMetadata();
window.__snippyMeta = __snippyMeta; // make it available to helpers

    console.log(`Snippy: Initialized UI for ${type} editor.`);

    if (editorType === 'ace') {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('page_world_script.js');
      (document.head || document.documentElement).appendChild(script);
      script.onload = () => {
        console.log("Snippy: page_world_script.js injected.");
        script.remove();
      };
    }

    controlPanel = createControlPanel();
	
// Add "Apply (Snippy™)" to formula pages only (Key Props already reloads on Save)
try { snippyInsertApplyButtonForFormula(getPageMetadata()); } catch {}


// Ensure any post-reload Error dialog cancels a lingering Apply bounce
try { snippyWatchForErrorDialogAndCancelApply(); } catch {}


	(async () => {
  // Grow/expand the native editor before we read
  if (type === 'ace' && originalElement?.id === 'fexpr_aceEditor') {
    await snippyExpandFormulaEditorIfPossible();
  }
  if (type === 'ace' && originalElement?.id === 'tlvFormula_aceEditor') {
    snippyGrowKeyPropsIfNeeded(originalElement);
    snippyWidenKeyPropsIfNeeded(originalElement);
  }

  if (type === 'ace') {
    // 1) Ensure page_world is ready so getFormula won't get lost
    const ready = await snippyWaitForPageWorldReady(2500);
    if (!ready) {
      console.error('Snippy: page-world not ready; aborting overlay open to avoid clearing formula.');
      alert("Snippy couldn’t read the formula safely.\n\nWe did NOT open the overlay to avoid clearing your field.\nPlease reload the page and try again.");
      return; // do NOT open overlay with blank content
    }

    // 2) Listen once for the formula, then open overlay with that exact text
    const onMsg = (event) => {
      if (event.source !== window) return;
      const d = event.data;
      if (d?.source === 'snippy-page-world' && d.command === 'formulaCode') {
        window.removeEventListener('message', onMsg);
        snippyOpenOverlayWithInitialCode(originalElement, d.payload || '');
      }
    };
    window.addEventListener('message', onMsg);

    // 3) Ask page-world for the current formula
    window.postMessage({ source: 'snippy-content-script', command: 'getFormula' }, '*');
  } else {
    // Code Page (textarea) — read synchronously
    snippyOpenOverlayWithInitialCode(originalElement, originalElement.value || '');
  }
})();




    originalElement.parentNode.insertBefore(controlPanel, originalElement);
  }

  function handleLaunchButtonClick() {
    if (isEditorOpen) {
      
      console.log("Snippy: Focusing existing editor tab.");
      chrome.runtime.sendMessage({ action: 'focusEditor' });
    } else {
      
      openExternalEditor();
    }
  }
  
  function setEditorActiveUI() {
    if (!launchButton || isEditorOpen) return;
    isEditorOpen = true;
    launchButton.innerHTML = '➡️ Go to Open Snippy Tab';

    const warningMessage = document.createElement('div');
    warningMessage.className = 'snippy-warning-message';
    warningMessage.textContent = 'Snippy Tab is open. Do not navigate from this page.';
    controlPanel.insertBefore(warningMessage, launchButton);
    
    
    parentHeartbeatInterval = setInterval(() => {
        chrome.runtime.sendMessage({ action: 'checkEditorStatus' }, (response) => {
            if (chrome.runtime.lastError || !response?.alive) {
                console.log("Snippy parent heartbeat: Editor tab not found. Reverting UI.");
                setEditorIdleUI(); 
                window.removeEventListener('beforeunload', handleBeforeUnload);
            }
        });
    }, 3000); 
  }

  function setEditorIdleUI() {
    
    if (parentHeartbeatInterval) {
        clearInterval(parentHeartbeatInterval);
        parentHeartbeatInterval = null;
    }

    if (!isEditorOpen) return;
    isEditorOpen = false;
    launchButton.innerHTML = '🚀 Open Snippy Tab';

    const warningMessage = controlPanel.querySelector('.snippy-warning-message');
    if (warningMessage) {
      warningMessage.remove();
    }
  }
// === SNIPPY 2.0 OVERLAY (skeleton) ===
let snippyOverlayEl = null;
let snippyOverlayFrame = null;
let snippyOverlayHidPanel = false;


function snippyEnsureOverlayStyles() {
  if (document.getElementById('snippy-overlay-styles')) return;
  const style = document.createElement('style');
  style.id = 'snippy-overlay-styles';
 style.textContent = `
  .snippy-hidden-panel { visibility: hidden !important; }
  .snippy-hidden-helper { display: none !important; }
  .snippy-hidden-target { visibility: hidden !important; pointer-events: none !important; }
  .snippy-overlay {
    position: absolute; /* now anchored to the editor, not fixed to viewport */
    z-index: 1;
    display: flex;
    flex-direction: column;
    border-radius: 0;
    background: #fff;
    border: 1px solid rgba(0,0,0,.12);
    box-shadow: none;
    overflow: hidden;
  }
  .snippy-overlay__header {
    display:flex; align-items:center; justify-content:space-between; gap:8px;
    padding: 4px 8px;
    background: #f5f5f5;
    border-bottom: 1px solid #e5e5e5;
    font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  }
  .snippy-overlay__title { display:flex; align-items:center; gap:8px; font-weight:600; font-size: 13px; }
  .snippy-overlay__title img { width:16px; height:16px; }
  .snippy-overlay__actions button {
    border:1px solid #ccc; background:#fff; padding:2px 6px; border-radius:6px; font-size:12px; cursor:pointer;
  }
  .snippy-overlay__body { position:relative; flex:1; }
  .snippy-overlay iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }

  /* Compact mode (tiny targets): shrink UI so header/buttons fit cleanly */
  .snippy-overlay--compact .snippy-overlay__header { padding: 2px 6px; }
  .snippy-overlay--compact .snippy-overlay__title { font-size: 12px; gap:6px; }
  .snippy-overlay--compact .snippy-overlay__title img { width:14px; height:14px; }
  .snippy-overlay--compact .snippy-overlay__actions button { padding:1px 5px; font-size:11px; }
`;

  document.head.appendChild(style);
}

// Find the nearest positioned ancestor so the overlay shares the editor's stacking context
function snippyFindOverlayHost(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const cs = getComputedStyle(node);
    if (cs.position !== 'static') return node; // first positioned ancestor
    node = node.parentElement;
  }
  // fallback: app shell (under top chrome), then body
  return document.querySelector('#remixRoot') || document.body;
}



// Keep overlay below top chrome (header/side menus) but above page content
function snippyCalibrateZ(overlayEl) {
  try {
    let maxZ = 0;
    // Only inspect potentially "chrome" layers to keep it cheap
    const all = document.querySelectorAll('body *');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky') {
        const zi = parseInt(cs.zIndex, 10);
        if (!Number.isNaN(zi)) maxZ = Math.max(maxZ, zi);
      }
    }
    // Put Snippy just under the highest fixed/sticky layer; never below 1
    // Keep us low; never try to "chase" header/menus.
// If header has z-index 1000, we still stay small (e.g., 2).
const targetZ = Math.max(1, Math.min(((maxZ || 0) - 1), 2));
overlayEl.style.zIndex = String(targetZ);

  } catch {}
}

// Preload code + metadata so editor.html (inside the iframe) boots with it
function snippyOpenOverlayWithInitialCode(targetEl, code) {
  try {
    const payload = {
      nativeCodeOnLoad: code,
      codeToEdit: code,
      pageMetadata: getPageMetadata()
    };
    chrome.storage.local.set(payload, () => {
      // only mount AFTER storage is set, so editor.html sees codeToEdit on DOMContentLoaded
	  // NEW: Tell background which tab to target for overlay messaging
chrome.runtime.sendMessage({ action: 'registerOverlayReturnTab' });

      snippyMountOverlayAnchored(targetEl);
    });
  } catch (e) {
    console.error('Snippy: failed to set code before opening overlay', e);
    // Worst case: still mount so we can see something
    snippyMountOverlayAnchored(targetEl);
  }
}

// --- Snippy overlay native-save interception ---------------------------------
function normalizeMetaForBackup(meta) {
  if (!meta) return meta;
  // Treat KeyProps like a Formula for storage/routing (so history works identically)
  if (meta.type === 'keyprops') {
    return { ...meta, type: 'formula', fieldId: 'KeyProps' };
  }
  return meta;
}

function snippyAskEditorForLatestCode() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'dumpCurrentCodeRequest' }, (resp) => resolve(resp || {}));
  });
}

function attachNativeSaveBackupInterceptors() {
  // Only do this when the overlay is mounted
  const overlayPresent = !!document.getElementById('snippy-overlay');
  if (!overlayPresent) return;

  // Figure out which page type we’re on
  const meta = (typeof getPageMetadata === 'function') ? getPageMetadata() : null;
  const pageType =
    meta?.type === 'code' ? 'codePage' :
    meta?.type === 'keyprops' ? 'keyprops' :
    'formula';

  const selectors = (QB_SAVE_SELECTORS[pageType] || []).filter(Boolean);
  if (selectors.length === 0) return;

  const selectorStr = selectors.join(',');

  // Helper: find a node in the composed path that matches any selector
  const findMatchingTarget = (ev) => {
    const path = (typeof ev.composedPath === 'function') ? ev.composedPath() : [];
    const matches = (el) => el && el.nodeType === 1 && el.matches && el.matches(selectorStr);

    // 1) Try composedPath (best for shadow/retargeted events)
    for (const node of path) {
      if (matches(node)) return node;
    }
    // 2) Fallback climb
    let el = ev.target;
    while (el && el !== document) {
      if (matches(el)) return el;
      el = el.parentElement;
    }
    return null;
  };

  const doBackupThen = async (continueWith) => {
    try {
      // Prefer lastOverlayCode; if missing, ask the iframe for current code+meta
      let code = (typeof lastOverlayCode === 'string') ? lastOverlayCode : null;
      let metaNow = normalizeMetaForBackup(meta);

      if (!code) {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'dumpCurrentCodeRequest' }, (r) => resolve(r || {}));
        });
        if (resp?.code) code = resp.code;
        if (resp?.metadata) metaNow = normalizeMetaForBackup(resp.metadata);
      }

      await new Promise((resolve) => {
        chrome.runtime.sendMessage({
  action: 'manualSave',
  code: code || '',
  metadata: metaNow,
  treatAsAuto: true // dedupe identical content
}, () => resolve());

      });
    } catch (e) {
      console.warn('Snippy overlay backup failed (continuing native action):', e);
    } finally {
      continueWith && continueWith();
    }
  };

  // Capture-phase click: intercept Save/Apply clicks anywhere in the doc
  const onClickCapture = (ev) => {
    const match = findMatchingTarget(ev);
    if (!match) return;
    if (match.dataset.snippyBypass === '1') return; // allow our re-click through

    ev.preventDefault();
    ev.stopImmediatePropagation();
    ev.stopPropagation();

    doBackupThen(() => {
      // re-fire the click so Quickbase proceeds
      match.dataset.snippyBypass = '1';
      // Create a real MouseEvent for better compatibility
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      match.dispatchEvent(evt);
      delete match.dataset.snippyBypass;
    });
  };

  // Safety net: some flows submit a form directly (Enter key, etc.)
  const onSubmitCapture = (ev) => {
    const form = ev.target;
    if (!form || form.nodeName !== 'FORM') return;

    // If the form contains a known Save/Apply control, intercept
    const containsSave = selectors.some(sel => form.querySelector(sel));
    if (!containsSave) return;
    if (form.dataset.snippyBypass === '1') return;

    ev.preventDefault();
    ev.stopImmediatePropagation();
    ev.stopPropagation();

    // Find a matching control to re-trigger after backup (prefer Save over Apply)
    const reClick =
      (form.querySelector(selectors[0]) || form.querySelector(selectorStr)) || null;

    doBackupThen(() => {
      if (reClick) {
        reClick.dataset.snippyBypass = '1';
        const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        reClick.dispatchEvent(evt);
        delete reClick.dataset.snippyBypass;
      } else {
        // Fallback: allow native submit (may bypass some JS handlers, but better than blocking)
        form.dataset.snippyBypass = '1';
        form.submit?.();
        delete form.dataset.snippyBypass;
      }
    });
  };

  // Attach once
  if (!document.__snippySaveInterceptInstalled) {
    document.addEventListener('click', onClickCapture, true);   // capture
    document.addEventListener('submit', onSubmitCapture, true); // capture
    document.__snippySaveInterceptInstalled = true;
    console.log('Snippy: overlay save/apply interception armed for', pageType, 'selectors:', selectors);
  }
}

// ----------------------------------------------------------------------------- end

function snippyMountOverlayAnchored(targetEl) {
  snippyEnsureOverlayStyles();
  if (snippyOverlayEl) return; // already mounted

  // 1) create overlay shell
  const el = document.createElement('div');
  el.className = 'snippy-overlay';
  el.id = 'snippy-overlay';
  el.innerHTML = `
    <div class="snippy-overlay__header">
      <div class="snippy-overlay__title">
        <img src="${chrome.runtime.getURL('snippy-logo.svg')}" />
        <span>Snippy</span><span style="opacity:.65;font-weight:400;">overlay</span>
      </div>
      <div class="snippy-overlay__actions">
        <button id="snippy-btn-close" title="Close">✕</button>
      </div>
    </div>
    <div class="snippy-overlay__body"></div>
  `;
  const anchorRoot = snippyFindOverlayHost(targetEl);
anchorRoot.appendChild(el);


  // 2) mount iframe
  const body = el.querySelector('.snippy-overlay__body');
  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('editor.html'); // reuse existing UI
  body.appendChild(frame);
  snippyCalibrateZ(el);
  // --- Host-side hysteresis state ---
let __snippyHostLastH = 0;
let __snippyHostShrinkArmedAt = 0;
const __HOST_MIN_DELTA = 8;        // ignore changes smaller than 8px
const __HOST_SHRINK_GRACE_MS = 400; // wait before shrinking to avoid oscillation

  // Listen for size reports from the editor iframe and grow the overlay accordingly
window.addEventListener('message', (ev) => {
	console.log('[Snippy Host] message received', ev.data);

  // Relaxed: accept messages by payload signature (more robust across isolated worlds)

  const d = ev.data;
  if (!d || d.source !== 'snippy-editor-frame' || d.type !== 'contentHeight') return;

  // Desired overlay height = header height + iframe content height (but never smaller than the target editor)
  const hdr = el.querySelector('.snippy-overlay__header');
  const headerH = hdr ? hdr.getBoundingClientRect().height : 0;
  const targetH = targetEl.getBoundingClientRect().height;
  const desired = Math.max(targetH, headerH + (Number(d.height) || 0));
  

  const now = performance.now();
const prev = __snippyHostLastH;
const next = desired;
const delta = Math.abs(next - prev);

if (delta >= __HOST_MIN_DELTA) {
  const isShrink = next < prev;

  if (isShrink) {
    if (__snippyHostShrinkArmedAt === 0) {
      __snippyHostShrinkArmedAt = now + __HOST_SHRINK_GRACE_MS;
    }
    if (now >= __snippyHostShrinkArmedAt) {
      el.style.height = `${next}px`;
      __snippyHostLastH = next;
      // after shrinking, require another quiet period before the next shrink
      __snippyHostShrinkArmedAt = now + __HOST_SHRINK_GRACE_MS;
    }
    // no autoscroll on shrink
  } else {
    // growth: apply immediately and reset shrink guard
    el.style.height = `${next}px`;
    __snippyHostLastH = next;
    __snippyHostShrinkArmedAt = 0;

    // autoscroll only when we grew and the bottom overflows
    try {
      const rootRect = (anchorRoot.getBoundingClientRect ? anchorRoot.getBoundingClientRect() : { top: 0, bottom: window.innerHeight });
      const ovRect = el.getBoundingClientRect();
      const overflow = ovRect.bottom - rootRect.bottom;
      if (overflow > 8) {
        const isDoc = (anchorRoot === document.body || anchorRoot === document.documentElement);
        const current = isDoc ? window.scrollY : (anchorRoot.scrollTop || 0);
        const to = current + overflow + 16;
        if (isDoc) {
          window.scrollTo({ top: to, behavior: 'smooth' });
        } else if (anchorRoot.scrollTo) {
          anchorRoot.scrollTo({ top: to, behavior: 'smooth' });
        } else {
          anchorRoot.scrollTop = to;
        }
      }
    } catch {}
  }
}

// Re-align top/left/width without ever shrinking height
try { positionToTarget(); } catch {}


  // Ensure the new bottom is visible — auto scroll the anchor root a bit if needed
  try {
    const rootRect = (anchorRoot.getBoundingClientRect ? anchorRoot.getBoundingClientRect() : { top: 0, bottom: window.innerHeight });
    const ovRect = el.getBoundingClientRect();
    const overflow = ovRect.bottom - rootRect.bottom;
    if (overflow > 8) {
      const isDoc = (anchorRoot === document.body || anchorRoot === document.documentElement);
      const current = isDoc ? window.scrollY : (anchorRoot.scrollTop || 0);
      const to = current + overflow + 16; // pad a little so the menu isn’t touching the edge
      if (isDoc) {
        window.scrollTo({ top: to, behavior: 'smooth' });
      } else if (anchorRoot.scrollTo) {
        anchorRoot.scrollTo({ top: to, behavior: 'smooth' });
      } else {
        anchorRoot.scrollTop = to;
      }
    }
  } catch {}
  console.log('[Snippy Host] contentHeight accepted →', d.height);

}, false);

attachNativeSaveBackupInterceptors();


  // 3) hide the native editor but keep its box in layout
  targetEl.classList.add('snippy-hidden-target');
  // If this is a Formula field ACE, hide the native "Choose fields & functions" helper too
let undoHideFormulaHelper = () => {};
if (targetEl && targetEl.id === 'fexpr_aceEditor') {
  undoHideFormulaHelper = snippyHideFormulaHelperIfPresent();
  // After hiding helper, remeasure because the editor likely moved up
  setTimeout(() => positionToTarget(), 0);

}

  // Also hide Snippy's own header/control panel for aesthetics
try {
  if (typeof controlPanel !== 'undefined' && controlPanel && controlPanel.parentNode) {
    controlPanel.classList.add('snippy-hidden-panel');
    snippyOverlayHidPanel = true;
  }
} catch {}



   // 4) position & size overlay to exactly match control panel (top) through editor (bottom)
  const positionToTarget = () => {
    const r = targetEl.getBoundingClientRect();

    // default anchor: just the editor
    let top = r.top, left = r.left, width = r.width, height = r.height;

    // if our control panel exists, extend overlay to start at panel's top
    if (typeof controlPanel !== 'undefined' && controlPanel) {
      const pr = controlPanel.getBoundingClientRect();
      // if the panel is above the editor in the same column, stretch from panel top to editor bottom
      const newTop = Math.min(pr.top, r.top);
      const newLeft = Math.min(pr.left, r.left);
      const newRight = Math.max(pr.right, r.right);
      const newBottom = Math.max(pr.bottom, r.bottom, r.bottom); // bottom should be editor bottom anyway
      top = newTop;
      left = newLeft;
      width = newRight - newLeft;
      height = (r.bottom - newTop); // panel top → editor bottom
    }

      // position relative to the anchor root
  const rootRect = (anchorRoot.getBoundingClientRect ? anchorRoot.getBoundingClientRect() : { top: 0, left: 0 });
  const scrollTop  = (anchorRoot.scrollTop  != null ? anchorRoot.scrollTop  : window.scrollY);
  const scrollLeft = (anchorRoot.scrollLeft != null ? anchorRoot.scrollLeft : window.scrollX);
  const relTop  = (top  - rootRect.top) + scrollTop;
  const relLeft = (left - rootRect.left) + scrollLeft;

  el.style.top  = `${relTop}px`;
  el.style.left = `${relLeft}px`;

    el.style.width = `${width}px`;
// Do NOT shrink the overlay here; only grow to at least the base editor height
const currentH = parseFloat(el.style.height) || 0;
if (currentH < height) {
  el.style.height = `${height}px`;
}


    // compact header if target is tight
    const compact = height < 140 || width < 420;
    el.classList.toggle('snippy-overlay--compact', !!compact);
  };

// Recalibrate z-index and position after the iframe fully loads
frame.addEventListener('load', () => {
  try {
    snippyCalibrateZ(el);
    // Ensure the overlay is perfectly aligned after the iframe paints
    positionToTarget();
    // One more pass on the next frame in case fonts/layout shift
    requestAnimationFrame(positionToTarget);
  } catch {}
});



  // 5) track resizes & scrolls so we stay aligned with the editor
  const ro = new ResizeObserver(positionToTarget);
  ro.observe(targetEl);
  const onScroll = () => positionToTarget();
  const onResize = () => positionToTarget();
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  // If our anchor root scrolls independently, remeasure on its scroll too
if (anchorRoot && anchorRoot !== document.body) {
  anchorRoot.addEventListener('scroll', onScroll, true);
}

    // --- Reposition on broader layout changes (side panel, app shell) ---
  const rootEl = document.querySelector('#remixRoot') || document.body;

  // Observe app shell size changes (e.g., side panel expanding/collapsing changes content width)
  let roRoot = null;
  try {
    roRoot = new ResizeObserver(positionToTarget);
    roRoot.observe(rootEl);
  } catch {}

  // If the side panel animates, remeasure a few times during the animation
const scheduleRemeasure = () => {
  // If KeyProps ACE, keep trying to widen as the content area changes
  if (targetEl && targetEl.id === 'tlvFormula_aceEditor') {
    snippyWidenKeyPropsIfNeeded(targetEl);
  }
  snippyCalibrateZ(el);
  positionToTarget();
  setTimeout(() => { if (targetEl && targetEl.id === 'tlvFormula_aceEditor') snippyWidenKeyPropsIfNeeded(targetEl); snippyCalibrateZ(el); positionToTarget(); }, 120);
  setTimeout(() => { if (targetEl && targetEl.id === 'tlvFormula_aceEditor') snippyWidenKeyPropsIfNeeded(targetEl); snippyCalibrateZ(el); positionToTarget(); }, 280);
  setTimeout(() => { if (targetEl && targetEl.id === 'tlvFormula_aceEditor') snippyWidenKeyPropsIfNeeded(targetEl); snippyCalibrateZ(el); positionToTarget(); }, 500);
};



  // Listen for transitionend on width/transform/left/right changes bubbling from children
  const onTransitionEnd = (e) => {
    const p = e.propertyName;
    if (p === 'width' || p === 'transform' || p === 'left' || p === 'right' || p === 'margin' || p === 'flex-basis') {
      scheduleRemeasure();
    }
  };
  rootEl.addEventListener('transitionend', onTransitionEnd, true);

  // Watch the side-panel toggle button explicitly (attribute change + click)
  const navToggle = document.querySelector('#toggle-button-nav-v2');
  let moNav = null;
  if (navToggle) {
    try {
      moNav = new MutationObserver(scheduleRemeasure);
      moNav.observe(navToggle, { attributes: true, attributeFilter: ['aria-expanded', 'class', 'style'] });
    } catch {}

    navToggle.addEventListener('click', scheduleRemeasure);
  }


  // 6) close handler restores target, removes listeners
  el.querySelector('#snippy-btn-close').addEventListener('click', () => {
  try { sessionStorage.removeItem('snippy_overlay_opened'); } catch {}
  if (snippyOverlayEl) snippyOverlayEl.remove();
  snippyOverlayEl = null;
  snippyOverlayFrame = null;

  // unhide native editor window.addEventListener('resize', onResize);
  targetEl.classList.remove('snippy-hidden-target');
// restore the Quickbase helper if we hid it
try { undoHideFormulaHelper(); } catch {}

  // unhide Snippy header panel if we hid it
  try {
    if (snippyOverlayHidPanel && typeof controlPanel !== 'undefined' && controlPanel) {
      controlPanel.classList.remove('snippy-hidden-panel');
    }
  } catch {}
  snippyOverlayHidPanel = false;

  // disconnect observers/listeners
  ro.disconnect();
  if (roRoot) roRoot.disconnect();
  if (moNav) moNav.disconnect();
  document.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onResize);
  if (anchorRoot && anchorRoot !== document.body) {
  anchorRoot.removeEventListener('scroll', onScroll, true);
}

  if (navToggle) navToggle.removeEventListener('click', scheduleRemeasure);
  if (rootEl) rootEl.removeEventListener('transitionend', onTransitionEnd, true);
});


  snippyOverlayEl = el;
  snippyOverlayFrame = frame;
}


function snippyAutoOpenOverlay(targetEl) {
  // Only auto-open once PER PAGE LOAD. This resets on reload automatically.
  if (window.__snippyOverlayOpened) return;
  window.__snippyOverlayOpened = true;
  snippyMountOverlayAnchored(targetEl);
}



  function openExternalEditor() {
    console.log("Snippy: 'Open Editor' clicked.");

    const launchEditor = (code) => {
      chrome.storage.local.set({ nativeCodeOnLoad: code, codeToEdit: code });
      chrome.runtime.sendMessage({
        action: "openEditor",
        code,
        metadata: getPageMetadata()
      });
      window.addEventListener('beforeunload', handleBeforeUnload);
      setEditorActiveUI();
    };

    if (editorType === 'ace') {
      const timeout = setTimeout(() => {
        console.error("Snippy: Timed out waiting for formulaCode.");
        alert("Snippy couldn't load the formula. Try refreshing and clicking again.");
      }, 2000);

      const listener = (event) => {
        if (event.source === window && event.data?.source === 'snippy-page-world' && event.data.command === 'formulaCode') {
          clearTimeout(timeout);
          window.removeEventListener('message', listener);
          console.log("Snippy: Received formulaCode from page.");snippyEnsureOverlayStyles()
          launchEditor(event.data.payload);
        }
      };

      window.addEventListener('message', listener);
      console.log("Snippy: Requesting formulaCode from page...");
      window.postMessage({ source: 'snippy-content-script', command: 'getFormula' }, '*');
    } else {
      launchEditor(originalElement.value);
    }
  }

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    switch (req.action) {
      case "updateCode":
      case "restoreOriginalCode":
        if (editorType === 'ace') {
          window.postMessage({ source: 'snippy-content-script', command: 'setFormula', payload: req.code }, '*');
        } else {
          originalElement.value = req.code;
        }
        if (req.action === "updateCode") clearEditorState();
        break;
		
		    case "updateOriginalTextarea": {
      // Only applies to code pages (non-ACE). Formula/KeyProps use ACE via page_world.
      if (editorType !== 'ace') {
        // If Quickbase re-rendered, our originalElement might be stale: re-find it if needed.
        let target = originalElement;
        if (!target || !document.contains(target)) {
          try {
            target = document.querySelector(SNIPPY_SELECTORS?.codePage?.textarea || 'textarea#pagetext') || target;
          } catch {}
        }

        if (target && typeof req.value === 'string') {
          if (target.value !== req.value) {
            target.value = req.value;

            // Nudge Quickbase listeners (jQuery/React/etc.)
            // Use real input/change events so frameworks pick it up.
            try {
              const inputEvt = new Event('input', { bubbles: true, cancelable: true });
              target.dispatchEvent(inputEvt);
            } catch {}

            try {
              const changeEvt = new Event('change', { bubbles: true, cancelable: true });
              target.dispatchEvent(changeEvt);
            } catch {}

            // Some pages only notice key events; a harmless extra nudge:
            try {
              const keyupEvt = new KeyboardEvent('keyup', { bubbles: true, cancelable: true });
              target.dispatchEvent(keyupEvt);
            } catch {}
          }
        }
      }
      break;
    }

		
      case "editorWasClosed":
        window.removeEventListener('beforeunload', handleBeforeUnload);
        clearEditorState();
        setEditorIdleUI();
        break;
      case "requestValidation":
        if (editorType === 'ace') {
			lastOverlayCode = req.code;
          window.postMessage({ source: 'snippy-content-script', command: 'setFormula', payload: req.code }, '*');
        }
        break;
		
		case "updateOriginalTextarea": {
  // Only applies to code pages (formula/KeyProps use ACE through the page-world bridge)
  if (editorType !== 'ace') {
    // If Quickbase re-rendered, our cached element might be stale—re-find it if needed.
    let target = originalElement;
    if (!target || !document.contains(target)) {
      try {
        target = document.querySelector(SNIPPY_SELECTORS?.codePage?.textarea || 'textarea#pagetext') || target;
        if (target) originalElement = target; // refresh our cache
      } catch {}
    }

    if (target && typeof req.value === 'string' && target.value !== req.value) {
      // 1) Put the text into the real Quickbase textarea
      target.value = req.value;

      // 2) Tell any frameworks/listeners that the value changed
      try { target.dispatchEvent(new Event('input',  { bubbles: true, cancelable: true })); } catch {}
      try { target.dispatchEvent(new Event('change', { bubbles: true, cancelable: true })); } catch {}
      try { target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true })); } catch {}
    }
  }
  break;
}

      case "getFieldsFromPage":
        if (editorType === 'ace') {
          window.postMessage({ source: 'snippy-content-script', command: 'getFields' }, '*');
        }
        break;
      case "getFunctionsFromPage":
        if (editorType === 'ace') {
          window.postMessage({ source: 'snippy-content-script', command: 'getFunctions' }, '*');
        }
        break;		
		case "getFunctionDetailsFromPage":
		        console.log('[Snippy Debug] CONTENT SCRIPT received getFunctionDetailsFromPage. Posting to page with payload:', req.payload);
			if (editorType === 'ace') {
				window.postMessage({ 
					source: 'snippy-content-script', 
					command: 'getFullFunctionInfo', 
					payload: req.payload 
      }, '*');
    }
		break;
      case "ping":
        sendResponse({ status: 'pong' });
        break;
    }
    return req.action === "ping";
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'snippy-page-world') return;
    const { command, payload } = event.data;

    switch (command) {
	        case 'ready':
        snippyPageWorldReady = true;
        break;
	
      case 'editorAnnotations': {
      // If overlay (iframe) is present, deliver straight to it.
      if (snippyOverlayFrame && snippyOverlayFrame.contentWindow) {
        chrome.runtime.sendMessage({ action: 'displayValidationResult', data: payload });
      } else {
        // fallback for “new-tab” flow
        chrome.runtime.sendMessage({ action: 'forwardValidationResult', data: payload });
      }
      break;
    }
    case 'fieldsList': {
      if (snippyOverlayFrame && snippyOverlayFrame.contentWindow) {
        chrome.runtime.sendMessage({ action: 'displayFieldsList', data: payload });
      } else {
        chrome.runtime.sendMessage({ action: 'forwardFieldsList', data: payload });
      }
      break;
    }
    case 'functionsList': {
      if (snippyOverlayFrame && snippyOverlayFrame.contentWindow) {
        chrome.runtime.sendMessage({ action: 'displayFunctionsList', data: payload });
      } else {
        chrome.runtime.sendMessage({ action: 'forwardFunctionsList', data: payload });
      }
      break;
    }
	case 'forwardFunctionDetails':
	   if (snippyOverlayFrame && snippyOverlayFrame.contentWindow) {
        chrome.runtime.sendMessage({ action: 'displayFunctionDetails', data: payload });
       } else {
		chrome.runtime.sendMessage({ action: 'forwardFunctionDetails', data: payload });
	   }
		break;
      case 'nativeChangeDetected':
        chrome.storage.local.set({ nativeContentWasChanged: true });
        break;
    }
  });

  function clearEditorState() {
    chrome.storage.local.remove(['nativeCodeOnLoad', 'nativeContentWasChanged', 'codeToEdit']);
  }

  function getPageMetadata() {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;

  if (editorType === 'ace') {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;

  // Detect KeyProps by URL
  const isKeyProps =
    /\/nav\/app\/[^/]+\/table\/[^/]+\/action\/KeyProps/i.test(location.href) ||
    (/\/db\/[^/?]+/i.test(location.pathname) && /(?:^|[?&])a=KeyProps/i.test(location.search));

  // Common table info (works for both formula fields and KeyProps)
  const match = path.match(/\/table\/([a-zA-Z0-9_]+)/) || path.match(/\/db\/([a-zA-Z0-9_]+)/);
  const tableId = match?.[1] || 'unknown_table';

  const fullHeader = document.querySelector('#pageNavBarHeader .ResponsiveText')?.textContent?.trim();
  const tableName = fullHeader?.endsWith(' Settings')
    ? fullHeader.replace(/ Settings$/, '')
    : 'Unknown Table';

  if (isKeyProps) {
    // KeyProps (table-level validation rules)
    return { type: 'keyprops', tableId, tableName };
  }

  // Field-level formula editor (original behavior)
  const fieldId =
    params.get('fid') ||
    document.querySelector('input[name="fid"]')?.value || 'unknown_field';

  const label =
    document.querySelector('input[name="label"]')?.value?.trim() || `Field ${fieldId}`;

  const fieldType =
    document.querySelector('#fieldTypeText')?.textContent?.trim() || 'unknown';

  return { type: 'formula', tableId, fieldId, label, fieldType, tableName };


  } else {
    const pageId = params.get('pageID') || 'unknown_page';
    const appMatch = path.match(/\/app\/([a-zA-Z0-9_]+)/) || path.match(/\/db\/([a-zA-Z0-9_]+)/);
    const name = document.querySelector('input[name="name"]')?.value || `Page ${pageId}`;
    return { type: 'code', appId: appMatch?.[1] || 'unknown_app', pageId, name };
  }
}



  function createControlPanel() {
    const panel = document.createElement('div');
    panel.className = 'snippy-control-panel';
    panel.appendChild(createBrandElement());
    
    launchButton = createLaunchButton();
    panel.appendChild(launchButton);
	
	  const overlayBtn = createOverlayButton();
		panel.appendChild(overlayBtn);


    return panel;
  }

  

function createOverlayButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'snippy-button snippy-button-primary';
  btn.textContent = '🧩 Open Snippy Overlay';
   btn.onclick = async () => {
    if (!originalElement) return;

    if (editorType === 'ace') {
      // Make the native area bigger first (so overlay fits)
      if (originalElement.id === 'fexpr_aceEditor') {
        await snippyExpandFormulaEditorIfPossible();
      }
      if (originalElement.id === 'tlvFormula_aceEditor') {
        snippyGrowKeyPropsIfNeeded(originalElement);
        snippyWidenKeyPropsIfNeeded(originalElement);
      }

      // Ensure page-world is ready and fetch fresh text
      const ready = await snippyWaitForPageWorldReady(2500);
      if (!ready) {
        alert("Snippy couldn’t read the formula safely.\n\nWe did NOT open the overlay to avoid clearing your field.\nPlease reload and try again.");
        return;
      }

      const onMsg = (event) => {
        if (event.source !== window) return;
        const d = event.data;
        if (d?.source === 'snippy-page-world' && d.command === 'formulaCode') {
          window.removeEventListener('message', onMsg);
          snippyOpenOverlayWithInitialCode(originalElement, d.payload || '');
        }
      };
      window.addEventListener('message', onMsg);
      window.postMessage({ source: 'snippy-content-script', command: 'getFormula' }, '*');
    } else {
      // Code page textarea
      snippyOpenOverlayWithInitialCode(originalElement, originalElement.value || '');
    }
  };

  return btn;
}

function createLaunchButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'snippy-button';
    btn.innerHTML = '🚀 Open Snippy Tab';
    btn.onclick = handleLaunchButtonClick;
    return btn;
  }

  function createBrandElement() {
    const brand = document.createElement('div');
    brand.className = 'snippy-brand';
    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('snippy-logo.svg');
    logo.className = 'snippy-logo';
    const text = document.createElement('div');
    text.className = 'snippy-brand-text';
    text.innerHTML = '<span class="main-name">Snippy</span><span class="sub-name">for Quickbase</span>';
    brand.appendChild(logo);
    brand.appendChild(text);
    return brand;
  }

  function injectStyles() {
    if (document.getElementById('snippy-styles')) return;
    const css = `
      .snippy-control-panel { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 5px; background: #f0f0f0; border-radius: 4px; margin-bottom: 5px; font-family: sans-serif; }
      .snippy-logo { height: 48px; width: 48px; }
      .snippy-brand { display: flex; align-items: center; gap: 6px; margin-right: auto; }
      .snippy-brand-text { display: flex; flex-direction: column; }
      .snippy-button { border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 13px; background: white; border: 1px solid #ccc; }
      .snippy-button-primary { background-color: #3b82f6; color: white; border-color: #1d4ed8; }
      .snippy-button-primary:hover { background-color: #2563eb; }
      .main-name { font-weight: bold; }
      .sub-name { font-size: 11px; opacity: 0.7; }
      .snippy-warning-message { padding: 6px 10px; background-color: #fffbeb; border: 1px solid #fde047; color: #b45309; border-radius: 4px; font-size: 12px; font-weight: 500; }
    `.trim();
    const style = document.createElement('style');
    style.id = 'snippy-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  const observer = new MutationObserver(() => {
  // If we were initialized but Quickbase tore down the editor DOM (e.g., failed save page reload),
  // allow re-initialization by flipping the flag back to false.
  if (isInitialized && (!originalElement || !document.contains(originalElement))) {
    isInitialized = false;
  }

  // detect editors (textarea code page, ACE field formula, ACE keyprops)
  const textArea     = document.querySelector('textarea#pagetext');
  const aceFormula   = document.querySelector('#fexpr_aceEditor');
  const aceKeyProps  = document.querySelector('#tlvFormula_aceEditor');

  if (textArea && textArea.offsetWidth > 0) {
    initializeSnippyUI(textArea, 'textarea'); // code page
    
    return;
  }
  if (aceFormula && aceFormula.offsetWidth > 0) {
    initializeSnippyUI(aceFormula, 'ace');    // field formula
   
    return;
  }
  if (aceKeyProps && aceKeyProps.offsetWidth > 0) {
    initializeSnippyUI(aceKeyProps, 'ace');   // table validation (KeyProps)
    
    return;
  }
});

injectStyles();

// Prefer SPA route root when present (Remix); fallback to body (classic)
function snippyObserveRouteRoot() {
  const start = () => {
    const routeRoot = document.querySelector('#remixRoot') || document.body;
    observer.observe(routeRoot, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
snippyObserveRouteRoot();



})();

// --- Global safety net: always listen for overlay height pings ---
window.addEventListener('message', (ev) => {
  const d = ev && ev.data;
  if (!d || d.source !== 'snippy-editor-frame' || d.type !== 'contentHeight') return;

  console.log('[Snippy Host:FALLBACK] contentHeight →', d.height);

  // Update overlay height by querying the DOM each time (no closure variables needed)
  const el = document.getElementById('snippy-overlay');
  if (!el) return;

  const hdr = el.querySelector('.snippy-overlay__header');
  const headerH = hdr ? hdr.getBoundingClientRect().height : 0;
  const desired = headerH + (Number(d.height) || 0);

  el.style.height = `${desired}px`;

  // Make sure the new bottom is visible
  try {
    const ovRect = el.getBoundingClientRect();
    const rootRect = document.documentElement.getBoundingClientRect();
    const overflow = ovRect.bottom - rootRect.bottom;
    if (overflow > 8) {
      const scroller = document.scrollingElement || document.documentElement;
      scroller.scrollTo({ top: (scroller.scrollTop || 0) + overflow + 16, behavior: 'smooth' });
    }
  } catch {}
}, true);
