
console.log("--- Snippy Background Script (GDrive & Cleanup Enabled) has started ---");

import { addLocalRevision } from './RevisionStore.js';
let oneDriveAccessToken = null;
let oneDriveTokenTimestamp = null;


const oneDriveClientId = "db5201b2-8fb7-466b-92ec-1b4397a65754";
const oneDriveRedirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
const oneDriveScopes = 'Files.ReadWrite offline_access'; 

async function getOneDriveAuthorizationCode() {
  const codeVerifier = generateCodeVerifier();
  
  await chrome.storage.local.set({ oneDriveCodeVerifier: codeVerifier });

  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const authUrl =
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize' +
    `?client_id=${oneDriveClientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(oneDriveRedirectUri)}` +
    `&scope=${encodeURIComponent(oneDriveScopes)}` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256`; 

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        return reject(chrome.runtime.lastError || new Error("Authorization flow failed."));
      }
      const code = new URL(redirectUrl).searchParams.get('code');
      if (!code) return reject(new Error("No authorization code in redirect URI"));
      resolve(code);
    });
  });
}


function generateCodeVerifier() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return btoa(String.fromCharCode.apply(null, randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function exchangeCodeForTokens(code) {
  
  const { oneDriveCodeVerifier } = await chrome.storage.local.get('oneDriveCodeVerifier');
  if (!oneDriveCodeVerifier) throw new Error("Code verifier not found.");

  const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const body = new URLSearchParams();
  body.append('client_id', oneDriveClientId);
  body.append('scope', oneDriveScopes);
  body.append('code', code);
  body.append('redirect_uri', oneDriveRedirectUri);
  body.append('grant_type', 'authorization_code');
  body.append('code_verifier', oneDriveCodeVerifier); 

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  
  await chrome.storage.local.remove('oneDriveCodeVerifier');

  const tokens = await response.json();
  if (!response.ok) throw new Error(tokens.error_description || "Failed to exchange code for tokens.");
  return tokens;
}

async function refreshOneDriveToken(refreshToken) {
  const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const body = new URLSearchParams();
  body.append('client_id', oneDriveClientId);
  body.append('scope', oneDriveScopes);
  body.append('refresh_token', refreshToken);
  body.append('grant_type', 'refresh_token');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const tokens = await response.json();
  if (!response.ok) throw new Error(tokens.error_description || "Failed to refresh token.");
  return tokens;
}

const MAX_REVISIONS = 20;

function snippyFormatTimestamp(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hh24 = d.getHours();
  const ampm = hh24 >= 12 ? 'PM' : 'AM';
  let hh12 = hh24 % 12; if (hh12 === 0) hh12 = 12;
  const hh = String(hh12).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${yyyy} ${hh}:${min} ${ampm}`;
}

function getLocalKey(metadata) {
  const base = metadata.type === 'formula'
    ? `formulas/${metadata.tableId}/field-${metadata.fieldId}`
    : `code-pages/${metadata.appId}/page-${metadata.pageId}`;
  return `snippy-local-revisions::${base}`;
}

async function getLocalRevisions(metadata) {
  const key = getLocalKey(metadata);
  const result = await chrome.storage.local.get(key);
  return (result[key] || []);
}




async function _fetchGDriveRevisions(metadata) {
    const token = await getAuthToken(false);
    const mainFolderId = await findOrCreateFolder(token, "Snippy for Quickbase", "root");
    if (metadata.type === 'formula') {
        const { tableId, fieldId } = metadata;
        const formulasFolderId = await findOrCreateFolder(token, "Formulas", mainFolderId);
        const tableFolderId = await findOrCreateFolder(token, tableId, formulasFolderId);
        return await listRevisions(token, tableFolderId, `Field ID ${fieldId}`);
    } else {
        const { appId, pageId } = metadata;
        const codePagesFolderId = await findOrCreateFolder(token, "Code Pages", mainFolderId);
        const appFolderId = await findOrCreateFolder(token, appId, codePagesFolderId);
        return await listRevisions(token, appFolderId, `Page ID ${pageId}`);
    }
}

async function _fetchOneDriveRevisions(metadata) {
    const token = await getOneDriveAuthToken(false);
    const rootFolder = await ensureOneDriveFolder(token, null, "Snippy for Quickbase");
    if (metadata.type === 'formula') {
        const formulaFolder = await ensureOneDriveFolder(token, rootFolder.id, "Formulas");
        const tableFolder = await ensureOneDriveFolder(token, formulaFolder.id, metadata.tableId);
        return await listOneDriveRevisions(token, tableFolder.id, `Field ID ${metadata.fieldId}`);
    } else {
        const codeFolder = await ensureOneDriveFolder(token, rootFolder.id, "Code Pages");
        const appFolder = await ensureOneDriveFolder(token, codeFolder.id, metadata.appId);
        return await listOneDriveRevisions(token, appFolder.id, `Page ID ${metadata.pageId}`);
    }
}

async function _fetchGDriveRevisionContent(fileId) {
    const token = await getAuthToken(false);
    return await fetchRevisionContent(token, fileId);
}

async function _fetchOneDriveRevisionContent(fileId) {
    const token = await getOneDriveAuthToken(false);
    const url = `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Graph API error: ${await response.text()}`);
    return await response.text();
}

async function _saveToGDrive(code, metadata) {
    return await saveToGDrive(code, metadata, ""); 
}

async function _saveToOneDrive(code, metadata) {
    return await saveToOneDrive(code, metadata, ""); 
}

// --- Snippy Apply (Formula) — background bounce controller ---
const snippyApplyPending = new Map(); // tabId -> { returnUrl, startedAt }
function scheduleApplyAutoExpire(tabId, ms = 20000) {
  setTimeout(() => {
    // If still pending after 20s, clear it to avoid accidental future bounces
    snippyApplyPending.delete(tabId);
  }, ms);
}


// --- Apply comparator helpers (treat mf and DoModFieldForm as equivalent "edit") ---
// --- Apply comparator helpers (treat mf, DoModFieldForm, and classic a=fe|er as "edit") ---
function isEditLike(u) {
  try {
    const url = new URL(u);

    // Remix: /nav/app/<appId>/table/<tableId>/action/<action>
    const nav = url.pathname.match(/\/nav\/app\/([^/]+)\/table\/([^/]+)\/action\/([^/]+)/i);
    if (nav) {
      const action = nav[3].toLowerCase();
      if (action === 'mf' || action === 'domodfieldform') return true;
    }

    // Classic: /db/<tableId>?a=fe|er&fid=...
    const db = url.pathname.match(/\/db\/([^/]+)/i);
    if (db) {
      const a = (url.searchParams.get('a') || '').toLowerCase();
      if (a === 'fe' || a === 'er') return true;
    }

    return false;
  } catch {
    return false;
  }
}



// 1) Accept "begin" and "cancel" from the content script
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req?.action === 'snippyApplyBegin' && sender?.tab?.id) {
    snippyApplyPending.set(sender.tab.id, { returnUrl: req.returnUrl, startedAt: Date.now() });
	scheduleApplyAutoExpire(sender.tab.id);

    sendResponse && sendResponse({ ok: true });
    return true;
  }
  if (req?.action === 'snippyApplyCancel' && sender?.tab?.id) {
    snippyApplyPending.delete(sender.tab.id);
    sendResponse && sendResponse({ ok: true });
    return true;
  }

  
});


// 2) On the very next URL CHANGE in the same tab, decide success/failure and redirect if needed.

// Bounce back ONLY when Quickbase leaves the edit context (mf / DoModFieldForm / classic fe|er).
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Only care about real URL changes
  if (!changeInfo.url) return;

  (async () => {
    const pending = snippyApplyPending.get(tabId);
    // ... inside chrome.tabs.onUpdated.addListener
    if (!pending) return;

    const navigatedUrl = changeInfo.url;

    // --- FIX: Check for successful navigation TO the return URL ---
    // If QB's save navigates us *exactly* to our target URL,
    // our job is done. Just clear the pending state and stop.
    if (navigatedUrl.split('#')[0] === pending.returnUrl.split('#')[0]) {
      // (Ignoring hash just in case)
      snippyApplyPending.delete(tabId);
      return;
    }
    // -----------------------------------------------------------

    // Still in a *different* edit-like context? (e.g., a reload) → keep waiting.
    if (isEditLike(navigatedUrl)) return;

    // Left edit context → successful save → bounce back to canonical mf URL we stored.
    snippyApplyPending.delete(tabId);
    chrome.tabs.update(tabId, { url: pending.returnUrl });
  })();
});







chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    switch(request.action) {
        case "openEditor":
            handleOpenEditor(request, sender);
            break;
        case "initialAutosave":
  handleInitialAutosave(request);
  sendResponse({ success: true });
  return true; // keep message channel open for potential async

		case "finalSave":
			handleFinalSave(request, sender);
			break;
        case "editorCancel":
            handleEditorCancel(sender);
            break;
        case "focusEditor":
            handleFocusEditor();
            break;
        case "checkEditorStatus":
            handleCheckEditorStatus(sendResponse);
            return true; 
        case "requestValidation":
            handleRequestValidation(request, sender);
            break;
			
case "registerOverlayReturnTab": {
  // In overlay mode, the content script and editor run in the SAME tab.
  // Record this tab as the "return" tab so editor.js can heartbeat and we can forward messages.
  if (sender?.tab?.id) {
    chrome.storage.local.set(
      { returnTabId: sender.tab.id, returnWindowId: sender.tab.windowId },
      () => { /* no-op */ }
    );
    sendResponse && sendResponse({ ok: true });
  } else {
    // Not expected, but fail safely
    sendResponse && sendResponse({ ok: false, reason: "No sender.tab.id" });
  }
  return true; // keep MV3 message channel open for sendResponse
}


        case "getFieldsFromPage":
            handleGetFieldsFromPage(request, sender);
            break;
        case "getFunctionsFromPage":
            handleGetFunctionsFromPage(request, sender);
            break;
		case "getFunctionDetailsFromPage":
			handleGetFunctionDetailsFromPage(request, sender);
			break;
        case "forwardValidationResult":
            handleForwardValidationResult(request, sender);
            break;
        case "forwardFieldsList":
            handleForwardFieldsList(request, sender);
            break;
        case "forwardFunctionsList":
            handleForwardFunctionsList(request, sender);
            break;
			case "forwardFunctionDetails":
        handleForwardFunctionDetails(request, sender);
        break;
		case "updateOriginalTextarea":
  forwardUpdateOriginalTextarea(request, sender);
  break;

        case "gdriveSave":
            handleGDriveSave(request, sendResponse);
            return true;
        case "gdriveInitialSave":
            handleGDriveInitialSave(request);
            break;
        case "gdriveLoadRevisions":
            handleGDriveLoadRevisions(request, sendResponse);
            return true;
		case "onedriveSave":
			handleOneDriveSave(request, sendResponse);
			return true;	
			case "onedriveLoadRevisions":
				handleOneDriveLoadRevisions(request, sendResponse);
				return true;
        case "gdriveRestoreRevision":
            handleGDriveRestoreRevision(request, sendResponse);
            return true;
		case "ensureGDriveAuth":
            handleEnsureGDriveAuth(sendResponse);
            return true; 
		case "ensureOneDriveAuth":
			handleEnsureOneDriveAuth(sendResponse);
			return true;
		case "onedriveRestoreRevision": 
            handleOneDriveRestoreRevision(request, sendResponse);
            return true;
		case "manualSave":
			handleManualSave(request, sendResponse);
			return true;
        case "clearOneDriveTokens":
            oneDriveAccessToken = null;
            oneDriveTokenTimestamp = null;
            console.log('[Snippy Auth] Cleared in-memory OneDrive tokens.');
            break;			
		case "getAuthStatus":
			handleGetAuthStatus(sendResponse);
			return true; 	
		
    }
});
async function forwardUpdateOriginalTextarea(request, sender) {
  try {
    // Prefer the Quickbase tab we recorded for overlay flows
    const { returnTabId } = await chrome.storage.local.get('returnTabId');

    let targetTabId = returnTabId;

    // Fallback: active tab of the last-focused window (should be the Quickbase tab)
    if (!targetTabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      targetTabId = activeTab?.id;
    }

    if (targetTabId) {
      await chrome.tabs.sendMessage(targetTabId, {
        action: 'updateOriginalTextarea',
        value: request.value
      });
    } else {
      console.warn('Snippy: No targetTabId found for updateOriginalTextarea.');
    }
  } catch (err) {
    // ignore the common "Receiving end does not exist" noise; log others
    if (!String(err?.message || '').includes('Receiving end does not exist')) {
      console.error('Snippy: Failed to forward updateOriginalTextarea.', err);
    }
  }
}


async function handleOpenEditor(request, sender) {
    const newEditorTab = await chrome.tabs.create({
      url: chrome.runtime.getURL('editor.html'),
      index: sender.tab.index + 1
    });

    await chrome.storage.local.set({
        codeToEdit: request.code,
        pageMetadata: request.metadata,
        returnTabId: sender.tab.id,
        returnWindowId: sender.tab.windowId, 
        editorTabId: newEditorTab.id 
    });
}


async function handleInitialAutosave(request) {
  const pageMetadata = request.metadata;
  if (!pageMetadata || !pageMetadata.type) {
    console.error("CRITICAL: handleInitialAutosave called with invalid metadata.", request);
    return;
  }

  try {
    const { revisionSaveTarget } = await chrome.storage.sync.get('revisionSaveTarget');
    const saveTarget = revisionSaveTarget || 'local';
    if (saveTarget === 'none') return;

    let latestCode = null;
    if (saveTarget === 'gdrive') {
      const revisions = await _fetchGDriveRevisions(pageMetadata);
      if (revisions.length > 0) latestCode = await _fetchGDriveRevisionContent(revisions[0].id);
    } else if (saveTarget === 'onedrive') {
      const revisions = await _fetchOneDriveRevisions(pageMetadata);
      if (revisions.length > 0) latestCode = await _fetchOneDriveRevisionContent(revisions[0].id);
    } else if (saveTarget === 'local') {
        const revisions = await getLocalRevisions(pageMetadata);
        if(revisions.length > 0) latestCode = revisions[0].code;
    }

    if (latestCode === null || (latestCode.replace(/\r\n/g, '\n').trim() !== request.code.replace(/\r\n/g, '\n').trim())) {
      console.log(`Snippy: Initial content is different for ${saveTarget}. Saving.`);
      if (saveTarget === 'gdrive') await _saveToGDrive(request.code, pageMetadata);
      else if (saveTarget === 'onedrive') await _saveToOneDrive(request.code, pageMetadata);
      else if (saveTarget === 'local') await addLocalRevision(request.code, pageMetadata, new Date().toISOString());

    } else {
      console.log('Snippy: Initial content is identical. No autosave needed.');
    }
  } catch (err) {
    console.error('Snippy Initial Autosave Error:', err);
  }
}



async function handleFinalSave(request, sender) {
  const pageMetadata = request.metadata;
  if (!pageMetadata || !pageMetadata.type) {
    console.error("CRITICAL: handleFinalSave called with invalid metadata.", request);
    return;
  }

  try {
    const { revisionSaveTarget } = await chrome.storage.sync.get('revisionSaveTarget');
    const saveTarget = revisionSaveTarget || 'local';

    if (saveTarget !== 'none') {
        let latestCode = null;
        if (saveTarget === 'gdrive') {
            await getAuthToken(true);
            const revisions = await _fetchGDriveRevisions(pageMetadata);
            if (revisions.length > 0) latestCode = await _fetchGDriveRevisionContent(revisions[0].id);
        } else if (saveTarget === 'onedrive') {
            await getOneDriveAuthToken(true);
            const revisions = await _fetchOneDriveRevisions(pageMetadata);
            if (revisions.length > 0) latestCode = await _fetchOneDriveRevisionContent(revisions[0].id);
        } else if (saveTarget === 'local') {
            const revisions = await getLocalRevisions(pageMetadata);
            if(revisions.length > 0) latestCode = revisions[0].code;
        }

        if (latestCode === null || (latestCode.replace(/\r\n/g, '\n').trim() !== request.code.replace(/\r\n/g, '\n').trim())) {
            console.log(`Snippy: Final content is different for ${saveTarget}. Saving.`);
            if (saveTarget === 'gdrive') await _saveToGDrive(request.code, pageMetadata);
            else if (saveTarget === 'onedrive') await _saveToOneDrive(request.code, pageMetadata);
            else if (saveTarget === 'local') await addLocalRevision(request.code, pageMetadata, new Date().toISOString());

        } else {
            console.log('Snippy: Skipping final save — identical to latest.');
        }
    }
  } catch (err) {
    console.error('Snippy Final Save Error:', err);
  }

  
  const { returnTabId, returnWindowId } = await chrome.storage.local.get(['returnTabId', 'returnWindowId']);
  if (returnTabId) {
    await chrome.tabs.sendMessage(returnTabId, { action: "updateCode", code: request.code });
    await chrome.tabs.sendMessage(returnTabId, { action: "editorWasClosed" });
    await chrome.windows.update(returnWindowId, { focused: true });
    await chrome.tabs.update(returnTabId, { active: true });
  }
  await chrome.tabs.remove(sender.tab.id);
  await chrome.storage.local.remove(['returnTabId', 'returnWindowId', 'editorTabId', 'codeToEdit', 'pageMetadata', 'nativeCodeOnLoad']);
}


async function handleGetAuthStatus(sendResponse) {
    let gdriveStatus = false;
    let onedriveStatus = false;

    
    try {
        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                
                if (chrome.runtime.lastError || !token) reject();
                else resolve(token);
            });
        });
        if (token) gdriveStatus = true;
    } catch (e) {
        gdriveStatus = false; 
    }

    
    try {
        const { oneDriveRefreshToken } = await chrome.storage.local.get('oneDriveRefreshToken');
        if (oneDriveRefreshToken) {
            onedriveStatus = true;
        }
    } catch (e) {
        onedriveStatus = false; 
    }

    sendResponse({ gdrive: gdriveStatus, onedrive: onedriveStatus });
}


async function handleManualSave(request, sendResponse) {
    const pageMetadata = request.metadata;
    const saveTarget = (await chrome.storage.sync.get('revisionSaveTarget')).revisionSaveTarget || 'local';
	const customFileName = request.customFileName?.trim() || null;

    try {
        if (saveTarget === 'none') {
            throw new Error("Revisions are disabled.");
        }

        let latestCode = null;
        if (saveTarget === 'gdrive') {
            await getAuthToken(true);
            const revisions = await _fetchGDriveRevisions(pageMetadata);
            if (revisions.length > 0) latestCode = await _fetchGDriveRevisionContent(revisions[0].id);
        } else if (saveTarget === 'onedrive') {
            await getOneDriveAuthToken(true);
            const revisions = await _fetchOneDriveRevisions(pageMetadata);
            if (revisions.length > 0) latestCode = await _fetchOneDriveRevisionContent(revisions[0].id);
        } else if (saveTarget === 'local') {
            const revisions = await getLocalRevisions(pageMetadata);
            if(revisions.length > 0) latestCode = revisions[0].code;
        }

        const normalize = (str) => (str || '').replace(/\r\n/g, '\n').trim();

// If this is an overlay-triggered backup (i.e., treatAsAuto = true), only save when changed.
// If it's a manual save from Snippy's UI, always save (no dedupe).
const treatAsAuto = request.treatAsAuto === true;
const hasChanges = treatAsAuto
  ? normalize(request.code) !== normalize(latestCode || '')
  : true;


        if (hasChanges) {
            if (treatAsAuto) {
  console.log('Snippy (Overlay Backup): Change detected — saving revision before native Save/Apply.');
} else {
  console.log('Snippy (Manual Save): Always saving on user request.');
}

            const prefix = request.prefix || "";
            if (saveTarget === 'gdrive') await saveToGDrive(request.code, pageMetadata, prefix, customFileName);
            else if (saveTarget === 'onedrive') await saveToOneDrive(request.code, pageMetadata, prefix, customFileName);
            else if (saveTarget === 'local') await addLocalRevision(request.code, pageMetadata, new Date().toISOString(), customFileName);
            sendResponse({ success: true });
        } else {
            console.log('Snippy (Manual Save): Skipping save — identical to latest.');
            sendResponse({ success: true, error: 'NO_CHANGES' });
        }
    } catch (err) {
        console.error('Snippy Manual Save Error in Background:', err);
        sendResponse({ success: false, error: err.message });
    }
}






async function handleEditorCancel(sender) {
    const { returnTabId, returnWindowId, nativeCodeOnLoad } = await chrome.storage.local.get(['returnTabId', 'returnWindowId', 'nativeCodeOnLoad']);
    if (returnTabId && returnWindowId) {
        if (nativeCodeOnLoad !== undefined) {
             await chrome.tabs.sendMessage(returnTabId, { action: "restoreOriginalCode", code: nativeCodeOnLoad });
        }
        await chrome.tabs.sendMessage(returnTabId, { action: "editorWasClosed" });
        
       
        await chrome.windows.update(returnWindowId, { focused: true });
        await chrome.tabs.update(returnTabId, { active: true });
    }
    
    
    await chrome.tabs.remove(sender.tab.id);
    await chrome.storage.local.remove(['returnTabId', 'returnWindowId', 'editorTabId', 'codeToEdit', 'pageMetadata', 'nativeCodeOnLoad']);
}

async function handleFocusEditor() {
    const { editorTabId } = await chrome.storage.local.get('editorTabId');
    if (editorTabId) {
        try {
            const tab = await chrome.tabs.get(editorTabId);
            await chrome.windows.update(tab.windowId, { focused: true });
            await chrome.tabs.update(editorTabId, { active: true });
        } catch (error) {
            console.warn("Snippy: Could not focus editor tab. It may have been closed.", error.message);
        }
    }
}

async function handleCheckEditorStatus(sendResponse) {
    const { editorTabId } = await chrome.storage.local.get('editorTabId');
    if (!editorTabId) {
        sendResponse({ alive: false });
        return;
    }
    
    try {
        await chrome.tabs.get(editorTabId);
        
        sendResponse({ alive: true });
    } catch (error) {
        
        sendResponse({ alive: false });
    }
}


async function handleRequestValidation(request, sender) {
    const { returnTabId } = await chrome.storage.local.get('returnTabId');
    if (returnTabId) {
        try {
            await chrome.tabs.sendMessage(returnTabId, { action: "requestValidation", code: request.code });
        } catch (error) {
            console.warn(`Snippy: Could not send validation request to tab ${returnTabId}.`, error.message);
        }
    }
}

async function handleGetFieldsFromPage(request, sender) {
    const { returnTabId } = await chrome.storage.local.get('returnTabId');
    if (returnTabId) {
        try {
            await chrome.tabs.sendMessage(returnTabId, { action: "getFieldsFromPage" });
        } catch (error) {
            console.warn(`Snippy: Could not send getFieldsFromPage request to tab ${returnTabId}.`, error.message);
        }
    }
}

async function handleGetFunctionsFromPage(request, sender) {
    const { returnTabId } = await chrome.storage.local.get('returnTabId');
    if (returnTabId) {
        try {
            await chrome.tabs.sendMessage(returnTabId, { action: "getFunctionsFromPage" });
        } catch (error) {
            console.warn(`Snippy: Could not send getFunctionsFromPage request to tab ${returnTabId}.`, error.message);
        }
    }
}

async function handleGetFunctionDetailsFromPage(request, sender) {
	console.log('[Snippy Debug] BACKGROUND received getFunctionDetailsFromPage with payload:', request.payload);
    const { returnTabId } = await chrome.storage.local.get('returnTabId');
    if (returnTabId) {
        try {
            
            await chrome.tabs.sendMessage(returnTabId, { 
                action: "getFunctionDetailsFromPage", 
                payload: request.payload 
            });
        } catch (error) {
            console.warn(`Snippy: Could not send getFunctionDetailsFromPage request to tab ${returnTabId}.`, error.message);
        }
    }
}

async function handleForwardValidationResult(request, sender) {
    const { editorTabId } = await chrome.storage.local.get('editorTabId');
    if (editorTabId) {
        try {
            await chrome.tabs.sendMessage(editorTabId, { action: "displayValidationResult", data: request.data });
        } catch (error) {
            if (!error.message.includes("Receiving end does not exist")) {
                console.error("Snippy: An unexpected error occurred while forwarding validation results.", error);
            }
        }
    }
}

async function handleForwardFieldsList(request, sender) {
  console.log(`Snippy (background.js): Received 'forwardFieldsList' with ${request.data.length} fields.`);

  // Read editorTabId for tab-mode and overlayOpen for iframe-mode
  const { editorTabId, overlayOpen } = await chrome.storage.local.get(['editorTabId', 'overlayOpen']);

  // If overlay is open (or there is no tab editor), broadcast to the iframe (extension page)
  if (overlayOpen || !editorTabId) {
    chrome.runtime.sendMessage({ action: "displayFieldsList", data: request.data });
    return;
  }

  // Otherwise, we’re in TAB mode – send to the editor tab
  try {
    await chrome.tabs.sendMessage(editorTabId, { action: "displayFieldsList", data: request.data });
  } catch (error) {
    if (!error.message?.includes("Receiving end does not exist")) {
      console.error("Snippy: Unexpected error while forwarding fields list.", error);
    }
  }
}


async function handleForwardFunctionsList(request, sender) {
  console.log(`Snippy (background.js): Received 'forwardFunctionsList' with ${request.data.length} functions.`);

  const { editorTabId, overlayOpen } = await chrome.storage.local.get(['editorTabId', 'overlayOpen']);

  if (overlayOpen || !editorTabId) {
    chrome.runtime.sendMessage({ action: "displayFunctionsList", data: request.data });
    return;
  }

  try {
    await chrome.tabs.sendMessage(editorTabId, { action: "displayFunctionsList", data: request.data });
  } catch (error) {
    if (!error.message?.includes("Receiving end does not exist")) {
      console.error("Snippy: Unexpected error while forwarding functions list.", error);
    }
  }
}




async function handleForwardFunctionDetails(request, sender) {
  console.log("Snippy (background.js): Received 'forwardFunctionDetails'.");

  const { editorTabId, overlayOpen } = await chrome.storage.local.get(['editorTabId', 'overlayOpen']);

  if (overlayOpen || !editorTabId) {
    chrome.runtime.sendMessage({ action: "displayFunctionDetails", data: request.data });
    return;
  }

  try {
    await chrome.tabs.sendMessage(editorTabId, { action: "displayFunctionDetails", data: request.data });
  } catch (error) {
    if (!error.message?.includes("Receiving end does not exist")) {
      console.error("Snippy: Unexpected error while forwarding function details.", error);
    }
  }
}






async function saveToGDrive(code, metadata, prefix = "", customFileName = null) {
    const token = await getAuthToken(true);
    const mainFolderId = await findOrCreateFolder(token, "Snippy for Quickbase", "root");

    if (metadata.type === 'formula') {
        const { tableId, fieldId } = metadata;
        const formulasFolderId = await findOrCreateFolder(token, "Formulas", mainFolderId);
        const tableFolderId = await findOrCreateFolder(token, tableId, formulasFolderId);
        
        
        const timestamp = snippyFormatTimestamp(new Date());


       const idPart = metadata.type === 'formula'
  ? `Field ID ${metadata.fieldId}`
  : `Page ID ${metadata.pageId}`;

const filename = customFileName
  ? `${prefix}${idPart} - ${customFileName.endsWith('.txt') ? customFileName : customFileName + '.txt'}`
  : `${prefix}${idPart} - ${timestamp}.txt`;



        await createFinalFile(token, filename, code, tableFolderId);
    } else {
        const { appId, pageId } = metadata;
        const codePagesFolderId = await findOrCreateFolder(token, "Code Pages", mainFolderId);
        const appFolderId = await findOrCreateFolder(token, appId, codePagesFolderId);

        
        const timestamp = snippyFormatTimestamp(new Date());
// KeyProps: custom filename "<Table Name> - Data Validation Rules - MM/DD/YYYY HH:MM AM.txt"
if (String(metadata.fieldId) === 'KeyProps') {
  const tableLabel = metadata.tableName || metadata.tableId || 'Unknown Table';
  const filename = `${tableLabel} - Data Validation Rules - ${timestamp}.txt`;
  await createFinalFile(token, filename, code, tableFolderId);
  return; // we've saved, skip the default idPart filename logic
}


        const idPart = metadata.type === 'formula'
  ? `Field ID ${metadata.fieldId}`
  : `Page ID ${metadata.pageId}`;

const filename = customFileName
  ? `${prefix}${idPart} - ${customFileName.endsWith('.txt') ? customFileName : customFileName + '.txt'}`
  : `${prefix}${idPart} - ${timestamp}.txt`;



        await createFinalFile(token, filename, code, appFolderId);
    }
}



async function saveToOneDrive(code, metadata, prefix = "", customFileName = null) {
  const token = await getOneDriveAuthToken(false);

  // Root
  const rootFolder = await ensureOneDriveFolder(token, null, "Snippy for Quickbase");

  // Pretty timestamp (MM/DD/YYYY HH:MM AM) -> OneDrive-safe (slashes/colons replaced)
  const now = new Date();
  const prettyTs = (typeof snippyFormatTimestamp === 'function')
    ? snippyFormatTimestamp(now)
    : (() => {
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const yyyy = now.getFullYear();
        let hh24 = now.getHours();
        const ampm = hh24 >= 12 ? 'PM' : 'AM';
        let hh12 = hh24 % 12; if (hh12 === 0) hh12 = 12;
        const hh = String(hh12).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        return `${mm}/${dd}/${yyyy} ${hh}:${min} ${ampm}`;
      })();
  const timestamp = prettyTs.replace(/\//g, '-').replace(/:/g, '-'); // OneDrive-safe

  let parentFolder;
  let filename;

  if (metadata.type === 'formula') {
    // Formulas -> /Formulas/{tableId}/
    const formulaFolder = await ensureOneDriveFolder(token, rootFolder.id, "Formulas");
    const tableFolder = await ensureOneDriveFolder(token, formulaFolder.id, metadata.tableId);
    parentFolder = tableFolder;

    // KeyProps special name
    if (String(metadata.fieldId) === 'KeyProps') {
      const tableLabel = metadata.tableName || metadata.tableId || 'Unknown Table';
      filename = `${tableLabel} - Data Validation Rules - ${timestamp}.txt`;
    } else {
      const idPart = `Field ID ${metadata.fieldId}`;
      filename = customFileName
        ? `${prefix}${idPart} - ${customFileName.endsWith('.txt') ? customFileName : customFileName + '.txt'}`
        : `${prefix}${idPart} - ${timestamp}.txt`;
    }
  } else {
    // Code pages -> /Code Pages/{appId}/
    const codeFolder = await ensureOneDriveFolder(token, rootFolder.id, "Code Pages");
    const appFolder = await ensureOneDriveFolder(token, codeFolder.id, metadata.appId);
    parentFolder = appFolder;

    const idPart = `Page ID ${metadata.pageId}`;
    filename = customFileName
      ? `${prefix}${idPart} - ${customFileName.endsWith('.txt') ? customFileName : customFileName + '.txt'}`
      : `${prefix}${idPart} - ${timestamp}.txt`;
  }

  // --- Upload to OneDrive (Graph) ---
  const uploadUrl =
    `https://graph.microsoft.com/v1.0/me/drive/items/${parentFolder.id}:/${encodeURIComponent(filename)}:/content`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain'
    },
    body: code
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`OneDrive upload failed: ${errorText}`);
  }

  console.log("✅ Snippy OneDrive Save Complete:", filename);
}




async function ensureOneDriveFolder(token, parentId, name) {
  const url = parentId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${parentId}/children`
    : `https://graph.microsoft.com/v1.0/me/drive/root/children`;

  try {
   
    const listRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const listData = await listRes.json();
    if (listData && listData.value) {
      const existing = listData.value.find(item => item.name === name && item.folder);
      if (existing) {
        return existing; 
      }
    }

   
    const createRes = await fetch(url, {
      method: "POST",
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail" 
      })
    });
    const createdData = await createRes.json();
    if (createRes.ok) {
      return createdData; 
    }

  
    if (createdData.error && createdData.error.code === 'nameAlreadyExists') {
     
      const retryRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const retryData = await retryRes.json();
      const nowExisting = retryData.value?.find(item => item.name === name && item.folder);
      if (nowExisting) {
        return nowExisting;
      }
    }
    
    
    throw new Error(createdData.error?.message || 'Unknown folder creation error');

  } catch(err) {
      console.error(`Snippy: Fatal error trying to ensure folder '${name}':`, err);
      throw err;
  }
}

async function handleOneDriveRestoreRevision(request, sendResponse) {
    _fetchOneDriveRevisionContent(request.fileId)
        .then(code => sendResponse({ success: true, code }))
        .catch(err => sendResponse({ success: false, error: err.message }));
}


async function handleGDriveSave(request, sendResponse) {
    try {
        await saveToGDrive(request.code, request.metadata, "[Manual Save] ");
        sendResponse({ success: true });
    } catch (error) {
        console.error("Snippy GDrive Save Failed:", error);
        sendResponse({ success: false, error: error.message });
    }
}


async function handleOneDriveSave(request, sendResponse) {
  try {
    
    const prefix = request.prefix || "";
    await saveToOneDrive(request.code, request.metadata, prefix);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Snippy OneDrive Save Failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}



async function handleGDriveInitialSave(request) {
    try {
        await saveToGDrive(request.code, request.metadata, "[Initial Save] ");
    } catch (error) {
        console.error("Snippy GDrive Initial Save Failed:", error);
        
    }
}

async function handleGDriveLoadRevisions(request, sendResponse) {
    _fetchGDriveRevisions(request.metadata)
        .then(files => sendResponse({ success: true, files }))
        .catch(err => sendResponse({ success: false, error: err.message }));
}

async function handleOneDriveLoadRevisions(request, sendResponse) {
    _fetchOneDriveRevisions(request.metadata)
        .then(files => sendResponse({ success: true, files }))
        .catch(err => sendResponse({ success: false, error: err.message }));
}
async function handleGDriveRestoreRevision(request, sendResponse) {
    _fetchGDriveRevisionContent(request.fileId)
        .then(code => sendResponse({ success: true, code }))
        .catch(err => sendResponse({ success: false, error: err.message }));
}










async function handleEnsureGDriveAuth(sendResponse) {
    try {
        const token = await getAuthToken(true);
        if (token) {
            sendResponse({ success: true });
        } else {
            throw new Error("Authentication succeeded but returned an empty token.");
        }
    } catch (error) {
        console.error("Snippy GDrive Auth Failed in background:", error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleEnsureOneDriveAuth(sendResponse) {
  try {
    const token = await getOneDriveAuthToken(true);
    if (token) {
      sendResponse({ success: true });
    } else {
      throw new Error("Token was empty.");
    }
  } catch (err) {
    console.error("Snippy OneDrive Auth Failed:", err);
    sendResponse({ success: false, error: err.message });
  }
}


async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        if (interactive) {
          console.warn('Snippy: Non-interactive OAuth failed. Retrying with popup...');
          chrome.identity.getAuthToken({ interactive: true }, (interactiveToken) => {
            if (chrome.runtime.lastError || !interactiveToken) {
              reject(chrome.runtime.lastError || new Error('OAuth2 not granted or revoked by user.'));
            } else {
              resolve(interactiveToken);
            }
          });
        } else {
          reject(chrome.runtime.lastError || new Error('OAuth2 not granted (interactive prompt suppressed).'));
        }
      } else {
        resolve(token);
      }
    });
  });
}




async function getOneDriveAuthToken(interactive = false) {
 
  const now = Date.now();
  if (oneDriveAccessToken && oneDriveTokenTimestamp && (now - oneDriveTokenTimestamp < 3500 * 1000)) {
    console.log("[Snippy Auth] Using valid in-memory OneDrive access token.");
    return oneDriveAccessToken;
  }
  console.log("[Snippy Auth] In-memory OneDrive token is invalid or expired.");

  
  const { oneDriveRefreshToken } = await chrome.storage.local.get('oneDriveRefreshToken');

  if (oneDriveRefreshToken) {
    console.log("[Snippy Auth] Found a refresh token. Attempting silent refresh...");
    try {
      const newTokens = await refreshOneDriveToken(oneDriveRefreshToken);
      oneDriveAccessToken = newTokens.access_token;
      oneDriveTokenTimestamp = Date.now();
      
      await chrome.storage.local.set({ oneDriveRefreshToken: newTokens.refresh_token });
      console.log("[Snippy Auth] Silent refresh successful.");
      return oneDriveAccessToken;
    } catch (error) {
      console.error("Snippy: OneDrive refresh token failed:", error);
      
      if (!interactive) {
        throw new Error("OneDrive token refresh failed and interactive mode is disabled.");
      }
    }
  }

  
  if (interactive) {
    console.log("[Snippy Auth] No valid refresh token. Starting full interactive auth flow...");
    try {
      const authCode = await getOneDriveAuthorizationCode();
      const newTokens = await exchangeCodeForTokens(authCode);

      oneDriveAccessToken = newTokens.access_token;
      oneDriveTokenTimestamp = Date.now();
     
      await chrome.storage.local.set({ oneDriveRefreshToken: newTokens.refresh_token });
      console.log("[Snippy Auth] Full interactive auth successful.");
      return oneDriveAccessToken;
    } catch (error) {
       console.error("Snippy: Full interactive auth failed:", error);
       throw error;
    }
  }

  
  throw new Error("Could not get OneDrive token: No refresh token available and interactive mode is off.");
}




async function findOrCreateFolder(token, folderName, parentId) {
    const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentId}' in parents and trashed=false`;
    const searchResponse = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, token);
    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    } else {
        const metadata = { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] };
        const createResponse = await driveFetch('https://www.googleapis.com/drive/v3/files', token, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(metadata));
        const createData = await createResponse.json();
        return createData.id;
    }
}

async function createFinalFile(token, filename, content, parentId) {
    const metadata = { name: filename, mimeType: 'text/plain', parents: [parentId] };
    const boundary = '-------314159265358979323846';
    const body = `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${content}\r\n\r\n--${boundary}--`;
    await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', token, 'POST', { 'Content-Type': `multipart/related; boundary=${boundary}` }, body);
}

async function listRevisions(token, folderId, nameContains) {
    const query = `'${folderId}' in parents and name contains '${nameContains}' and mimeType != 'application/vnd.google-apps.folder' and trashed=false`;
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=100`, token);
    const data = await response.json();
    return data.files || [];
}



async function listOneDriveRevisions(token, folderId, nameContains) {

  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?$select=id,name,createdDateTime,file,deleted&$top=200`;
  
  console.log(`[Snippy Debug] listOneDriveRevisions: Fetching URL: ${url}`);
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  
  if (!response.ok) {
    const errorData = await response.json();
    console.error(`[Snippy Debug] API call failed with status ${response.status}:`, errorData);
    throw new Error(`Microsoft Graph API Error: ${errorData.error.message}`);
  }

  const data = await response.json();
  
  
  const matching = data.value?.filter(file =>
    file.name.includes(nameContains) &&
    file.file &&
    !file.deleted
  );

  let result = matching || [];

  
  result.sort((a, b) => {
    
    return new Date(b.createdDateTime) - new Date(a.createdDateTime);
  });

  console.log(`[Snippy Debug] listOneDriveRevisions: Found, filtered, and sorted ${result.length} files.`);
  return result;
}



async function fetchRevisionContent(token, fileId) {
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, token);
    return response.text();
}

async function driveFetch(url, token, method = 'GET', headers = {}, body = undefined) {
    const response = await fetch(url, {
        method: method,
        headers: { ...headers, 'Authorization': `Bearer ${token}` },
        body: body
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Google Drive API Error (${response.status}): ${errorBody}`);
    }
    return response;
}
