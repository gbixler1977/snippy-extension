// background.js - REVISED: Now focuses the originating Quickbase tab upon closing the editor.

console.log("--- Snippy Background Script (GDrive & Cleanup Enabled) has started ---");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Use a switch statement for clarity and extensibility
    switch(request.action) {
        case "openEditor":
            handleOpenEditor(request, sender);
            break;
        case "editorSave":
            handleEditorSave(request, sender);
            break;
        case "editorCancel":
            handleEditorCancel(sender);
            break;
        case "focusEditor":
            handleFocusEditor();
            break;
        case "checkEditorStatus":
            handleCheckEditorStatus(sendResponse);
            return true; // Important for async response
        case "requestValidation":
            handleRequestValidation(request, sender);
            break;
        case "getFieldsFromPage":
            handleGetFieldsFromPage(request, sender);
            break;
        case "getFunctionsFromPage":
            handleGetFunctionsFromPage(request, sender);
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
        case "gdriveSave":
            handleGDriveSave(request, sendResponse);
            return true;
        case "gdriveInitialSave":
            handleGDriveInitialSave(request);
            break;
        case "gdriveLoadRevisions":
            handleGDriveLoadRevisions(request, sendResponse);
            return true;
        case "gdriveRestoreRevision":
            handleGDriveRestoreRevision(request, sendResponse);
            return true;
    }
});

// --- Editor Tab Handlers ---
async function handleOpenEditor(request, sender) {
    const newEditorTab = await chrome.tabs.create({
      url: chrome.runtime.getURL('editor.html'),
      index: sender.tab.index + 1
    });

    await chrome.storage.local.set({
        codeToEdit: request.code,
        pageMetadata: request.metadata,
        returnTabId: sender.tab.id,
        returnWindowId: sender.tab.windowId, // Store the window ID of the originating tab
        editorTabId: newEditorTab.id 
    });
}

async function handleEditorSave(request, sender) {
    const { returnTabId, returnWindowId, editorTabId, pageMetadata } = await chrome.storage.local.get(['returnTabId', 'returnWindowId', 'editorTabId', 'pageMetadata']);

    if (!editorTabId || !returnTabId || !returnWindowId) return;

    // 1. Attempt to save to Google Drive first, unless disabled or blocked by Edge.
    if (!request.skipGDrive) {
        try {
            await saveToGDrive(request.code, pageMetadata, "[Saved] ");
        } catch (error) {
            console.error("Snippy GDrive Save Failed during combined save:", error);
            await chrome.tabs.sendMessage(editorTabId, { action: "gdriveSaveFailed", error: error.message });
        }
    } else {
        console.log("Snippy: Skipping Google Drive save due to setting or Edge restriction.");
    }

    // 3. Proceed to save to Quickbase.
    await chrome.tabs.sendMessage(returnTabId, { action: "updateCode", code: request.code });
    await chrome.tabs.sendMessage(returnTabId, { action: "editorWasClosed" });

    // 4. Focus the original Quickbase tab and window.
    await chrome.windows.update(returnWindowId, { focused: true });
    await chrome.tabs.update(returnTabId, { active: true });

    // 5. Close the editor tab and clean up storage.
    await chrome.tabs.remove(sender.tab.id);
    await chrome.storage.local.remove(['returnTabId', 'returnWindowId', 'editorTabId', 'codeToEdit', 'pageMetadata', 'nativeCodeOnLoad']);
}


async function handleEditorCancel(sender) {
    const { returnTabId, returnWindowId, nativeCodeOnLoad } = await chrome.storage.local.get(['returnTabId', 'returnWindowId', 'nativeCodeOnLoad']);
    if (returnTabId && returnWindowId) {
        if (nativeCodeOnLoad !== undefined) {
             await chrome.tabs.sendMessage(returnTabId, { action: "restoreOriginalCode", code: nativeCodeOnLoad });
        }
        await chrome.tabs.sendMessage(returnTabId, { action: "editorWasClosed" });
        
        // Focus the original Quickbase tab and window
        await chrome.windows.update(returnWindowId, { focused: true });
        await chrome.tabs.update(returnTabId, { active: true });
    }
    
    // Close the editor tab and clean up storage
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
        // If the above line doesn't throw an error, the tab exists.
        sendResponse({ alive: true });
    } catch (error) {
        // If it throws an error, the tab does not exist.
        sendResponse({ alive: false });
    }
}

// --- Data Request Handlers ---
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

// --- Data Forwarding Handlers ---
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
    const { editorTabId } = await chrome.storage.local.get('editorTabId');
    if (editorTabId) {
        try {
            await chrome.tabs.sendMessage(editorTabId, { action: "displayFieldsList", data: request.data });
        } catch (error) {
            if (!error.message.includes("Receiving end does not exist")) {
                console.error("Snippy: An unexpected error occurred while forwarding fields list.", error);
            }
        }
    }
}

async function handleForwardFunctionsList(request, sender) {
    console.log(`Snippy (background.js): Received 'forwardFunctionsList' with ${request.data.length} functions.`);
    const { editorTabId } = await chrome.storage.local.get('editorTabId');
    if (editorTabId) {
        console.log(`Snippy (background.js): Found editorTabId: ${editorTabId}. Attempting to forward functions list.`);
        try {
            await chrome.tabs.sendMessage(editorTabId, { action: "displayFunctionsList", data: request.data });
            console.log("Snippy (background.js): Successfully sent 'displayFunctionsList' message to editor tab.");
        } catch (error) {
            if (!error.message.includes("Receiving end does not exist")) {
                console.error("Snippy: An unexpected error occurred while forwarding functions list.", error);
            }
        }
    }
}


// --- Google Drive Logic Handlers ---

// Core GDrive save logic. Throws error on failure.
async function saveToGDrive(code, metadata, prefix = "") {
    const token = await getAuthToken(true);
    const mainFolderId = await findOrCreateFolder(token, "Snippy for Quickbase", "root");

    if (metadata.type === 'formula') {
        const { tableId, fieldId } = metadata;
        const formulasFolderId = await findOrCreateFolder(token, "Formulas", mainFolderId);
        const tableFolderId = await findOrCreateFolder(token, tableId, formulasFolderId);
        const timestamp = new Date().toLocaleString('en-US', { hour12: true }).replace(/\//g, '-').replace(/, /g, ' ').replace(/:/g, '-');
        const filename = `${prefix}Field ID ${fieldId} - ${timestamp}.txt`;
        await createFinalFile(token, filename, code, tableFolderId);
    } else {
        const { appId, pageId } = metadata;
        const codePagesFolderId = await findOrCreateFolder(token, "Code Pages", mainFolderId);
        const appFolderId = await findOrCreateFolder(token, appId, codePagesFolderId);
        const timestamp = new Date().toLocaleString('en-US', { hour12: true }).replace(/\//g, '-').replace(/, /g, ' ').replace(/:/g, '-');
        const filename = `${prefix}Page ID ${pageId} - ${timestamp}.txt`;
        await createFinalFile(token, filename, code, appFolderId);
    }
}

// Handler for the manual "Save to Drive" button
async function handleGDriveSave(request, sendResponse) {
    try {
        await saveToGDrive(request.code, request.metadata, "[Manual Save] ");
        sendResponse({ success: true });
    } catch (error) {
        console.error("Snippy GDrive Save Failed:", error);
        sendResponse({ success: false, error: error.message });
    }
}

// Handler for the automatic initial save on editor open
async function handleGDriveInitialSave(request) {
    try {
        await saveToGDrive(request.code, request.metadata, "[Initial Save] ");
    } catch (error) {
        console.error("Snippy GDrive Initial Save Failed:", error);
        // Do not alert the user; this is a background task.
    }
}

async function handleGDriveLoadRevisions(request, sendResponse) {
    try {
        const token = await getAuthToken(false);
        const mainFolderId = await findOrCreateFolder(token, "Snippy for Quickbase", "root");
        let files;

        if (request.metadata.type === 'formula') {
            const { tableId, fieldId } = request.metadata;
            const formulasFolderId = await findOrCreateFolder(token, "Formulas", mainFolderId);
            const tableFolderId = await findOrCreateFolder(token, tableId, formulasFolderId);
            files = await listRevisions(token, tableFolderId, `Field ID ${fieldId}`);
        } else {
            const { appId, pageId } = request.metadata;
            const codePagesFolderId = await findOrCreateFolder(token, "Code Pages", mainFolderId);
            const appFolderId = await findOrCreateFolder(token, appId, codePagesFolderId);
            files = await listRevisions(token, appFolderId, `Page ID ${pageId}`);
        }
        sendResponse({ success: true, files: files });
    } catch (error) {
        console.error("Snippy GDrive Load Revisions Failed:", error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleGDriveRestoreRevision(request, sendResponse) {
    try {
        const token = await getAuthToken(false);
        const content = await fetchRevisionContent(token, request.fileId);
        sendResponse({ success: true, code: content });
    } catch (error) {
        console.error("Snippy GDrive Restore Revision Failed:", error);
        sendResponse({ success: false, error: error.message });
    }
}


// --- Google API Helper Functions ---
function getAuthToken(interactive) {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: interactive }, (token) => {
            if (chrome.runtime.lastError || !token) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(token);
            }
        });
    });
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