



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



const RevisionStore = {
  async shouldSave(code, metadata) {
    const target = await getSaveTarget();
    if (target === 'none') return false;

    const latest = await RevisionStore.getLatest(metadata, target);
    if (latest === null) {
      console.log("Snippy: No previous revision found. A save is required.");
      return true;
    }

    const normalize = (str) => str.replace(/\r\n/g, '\n').trim();
    const normalizedLatest = normalize(latest);
    const normalizedCode = normalize(code);

    if (normalizedLatest !== normalizedCode) {
      console.log("Snippy Decision: Code is DIFFERENT. A save is required.");
      return true;
    } else {
      console.log("Snippy Decision: Code is IDENTICAL. No save needed.");
      return false;
    }
  },

  async addRevision(code, metadata, prefix = "", customFileName = null) {
    
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'manualSave',
            code,
            metadata,
            prefix,
			customFileName
        }, (response) => {
            if (response?.success) {
  if (response?.error === 'NO_CHANGES') {
    resolve('NO_CHANGES');
  } else {
    resolve('OK');
  }
} else {
  reject(new Error(response?.error || 'Unknown manual save error.'));
}


        });
    });
  },

  async getLatest(metadata, target) {
    const revisions = await RevisionStore.getRevisions(metadata, target);
    if (!revisions || revisions.length === 0) {
      return null;
    }
    const latestRevisionId = revisions[0].id;
    return await RevisionStore.getRevisionById(latestRevisionId, metadata, target);
  },

  async getRevisions(metadata, target = null) {
    const finalTarget = target || await getSaveTarget();
    if (finalTarget === 'none' || finalTarget === 'local') {
        return getLocalRevisions(metadata);
    }
    
    
    return new Promise((resolve) => {
        const action = finalTarget === 'gdrive' ? 'gdriveLoadRevisions' : 'onedriveLoadRevisions';
        chrome.runtime.sendMessage({ action, metadata }, (response) => {
            if (response?.success && Array.isArray(response.files)) {
                const mappedFiles = response.files.map(f => ({
                    id: f.id,
                    name: f.name,
                    timestamp: f.createdTime || f.createdDateTime,
                    source: finalTarget
                }));
                resolve(mappedFiles);
            } else {
                console.error(`Failed to load revisions for ${finalTarget}:`, response?.error);
                resolve([]); 
            }
        });
    });
  },

  async getRevisionById(id, metadata, target = null) {
    const finalTarget = target || await getSaveTarget();
    if (finalTarget === 'none' || finalTarget === 'local') {
        const revisions = await getLocalRevisions(metadata);
        const rev = revisions.find(r => r.id === id);
        return rev?.code || null;
    }

    
    return new Promise((resolve) => {
        const action = finalTarget === 'gdrive' ? 'gdriveRestoreRevision' : 'onedriveRestoreRevision';
        chrome.runtime.sendMessage({ action, fileId: id }, (response) => {
            if (response?.success) {
                resolve(response.code);
            } else {
                console.error(`Failed to restore revision for ${finalTarget}:`, response?.error);
                resolve(null);
            }
        });
    });
  }
};


async function getSaveTarget() {
  const result = await chrome.storage.sync.get('revisionSaveTarget');
  return result.revisionSaveTarget || 'local';
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
  return (result[key] || []).map((r, i) => ({ ...r, id: r.id || `rev-${i}`, source: 'local' }));
}

async function addLocalRevision(code, metadata, timestamp, customFileName = null) {
  const key = getLocalKey(metadata);
  const existing = await getLocalRevisions(metadata);
  console.log("🧪 addLocalRevision called with name:", customFileName);


  const newRev = {
    id: `rev-${Date.now()}`,
    code,
    timestamp,
  };

  if (customFileName) {	  

    newRev.name = customFileName.endsWith('.txt') ? customFileName : `${customFileName}.txt`;
  } else {
  const ts = snippyFormatTimestamp(timestamp);

  // Special label for KeyProps saved as "formula"
  if (metadata.type === 'formula' && String(metadata.fieldId) === 'KeyProps') {
    const tableLabel = metadata.tableName || metadata.tableId || 'Unknown Table';
    newRev.name = `${tableLabel} - Data Validation Rules - ${ts}.txt`;
  } else {
    const idPart = metadata.type === 'formula'
      ? `Field ID ${metadata.fieldId}`
      : `Page ID ${metadata.pageId}`;
    newRev.name = `${idPart} - ${ts}.txt`;
  }
}


  const updated = [newRev, ...existing].slice(0, MAX_REVISIONS);
  await chrome.storage.local.set({ [key]: updated });
}


export default RevisionStore;
export { addLocalRevision };