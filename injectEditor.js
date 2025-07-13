// injectEditor.js - FINAL FIXED VERSION

console.log("Snippy (injectEditor.js): Initializing...");

(function() {
  let originalElement = null;
  let editorType = null;
  let isInitialized = false;
  let isEditorOpen = false; // State variable for the editor
  let launchButton = null;
  let controlPanel = null;
  let parentHeartbeatInterval = null; // Heartbeat to check if editor tab is still open

  const unloadMessage = 'You have an open Snippy editor. Are you sure you want to leave this page? Changes in the editor may not be savable.';
  function handleBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = unloadMessage;
    return unloadMessage;
  }

  function initializeSnippyUI(element, type) {
    if (isInitialized) return;
    isInitialized = true;
    originalElement = element;
    editorType = type;
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
    originalElement.parentNode.insertBefore(controlPanel, originalElement);
  }

  function handleLaunchButtonClick() {
    if (isEditorOpen) {
      // If editor is already open, just focus it.
      console.log("Snippy: Focusing existing editor tab.");
      chrome.runtime.sendMessage({ action: 'focusEditor' });
    } else {
      // Otherwise, open a new one.
      openExternalEditor();
    }
  }
  
  function setEditorActiveUI() {
    if (!launchButton || isEditorOpen) return;
    isEditorOpen = true;
    launchButton.innerHTML = '<span>➡️ Go to Open Editor</span>';

    const warningMessage = document.createElement('div');
    warningMessage.className = 'snippy-warning-message';
    warningMessage.textContent = 'Snippy Editor is open. Do not navigate from this page.';
    controlPanel.insertBefore(warningMessage, launchButton);
    
    // Start parent heartbeat to check if editor tab gets closed manually
    parentHeartbeatInterval = setInterval(() => {
        chrome.runtime.sendMessage({ action: 'checkEditorStatus' }, (response) => {
            if (chrome.runtime.lastError || !response?.alive) {
                console.log("Snippy parent heartbeat: Editor tab not found. Reverting UI.");
                setEditorIdleUI(); // This will also clear the interval
                window.removeEventListener('beforeunload', handleBeforeUnload);
            }
        });
    }, 3000); // Check every 3 seconds
  }

  function setEditorIdleUI() {
    // Always clear the heartbeat when returning to idle state
    if (parentHeartbeatInterval) {
        clearInterval(parentHeartbeatInterval);
        parentHeartbeatInterval = null;
    }

    if (!isEditorOpen) return;
    isEditorOpen = false;
    launchButton.innerHTML = '<span>🚀 Open Snippy Editor</span>';

    const warningMessage = controlPanel.querySelector('.snippy-warning-message');
    if (warningMessage) {
      warningMessage.remove();
    }
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
          console.log("Snippy: Received formulaCode from page.");
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
      case "editorWasClosed":
        window.removeEventListener('beforeunload', handleBeforeUnload);
        clearEditorState();
        setEditorIdleUI();
        break;
      case "requestValidation":
        if (editorType === 'ace') {
          window.postMessage({ source: 'snippy-content-script', command: 'setFormula', payload: req.code }, '*');
        }
        break;
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
      case 'editorAnnotations':
        chrome.runtime.sendMessage({ action: 'forwardValidationResult', data: payload });
        break;
      case 'fieldsList':
        chrome.runtime.sendMessage({ action: 'forwardFieldsList', data: payload });
        break;
      case 'functionsList':
        chrome.runtime.sendMessage({ action: 'forwardFunctionsList', data: payload });
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
      const fieldId = params.get('fid') || 'unknown_field';
      const match = path.match(/\/table\/([a-zA-Z0-9_]+)/) || path.match(/\/db\/([a-zA-Z0-9_]+)/);
      return { type: 'formula', tableId: match?.[1] || 'unknown_table', fieldId };
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

    return panel;
  }

  function createLaunchButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'snippy-button snippy-button-primary';
    btn.innerHTML = '<span>🚀 Open Snippy Editor</span>';
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
    if (isInitialized) return observer.disconnect();
    const textArea = document.querySelector('textarea[name="pagetext"]');
    const ace = document.querySelector('#fexpr_aceEditor');
    if (textArea?.offsetWidth > 0) {
      initializeSnippyUI(textArea, 'textarea');
      observer.disconnect();
    } else if (ace?.offsetWidth > 0) {
      initializeSnippyUI(ace, 'ace');
      observer.disconnect();
    }
  });

  injectStyles();
  observer.observe(document.body, { childList: true, subtree: true });
})();