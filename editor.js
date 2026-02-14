if (!window.SNIPPY_DEBUG_MODE) {
  console.log = console.info = console.debug = console.warn = () => {};
}
// === Overlay autosize: include absolute/fixed dropdowns & expose a nudge (TOP-LOADED) ===
(function snippyAutoSizeOverlay() {
  try {
    function measureDocHeight() {
      const doc = document;
      let h = Math.max(
        doc.documentElement.scrollHeight,
        doc.body.scrollHeight,
        doc.documentElement.offsetHeight,
        doc.body.offsetHeight
      );

      // Include absolutely/fixed-positioned UI (menus/modals) that don't affect scrollHeight
      let maxBottom = 0;
      if (doc.body) {
        const nodes = doc.body.querySelectorAll('*');
        nodes.forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          if (cs.position === 'absolute' || cs.position === 'fixed') {
            const r = el.getBoundingClientRect();
            const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
            const bottom = r.bottom + scrollY;
            if (bottom > maxBottom) maxBottom = bottom;
          }
        });
      }
      return Math.max(h, Math.ceil(maxBottom));
    }

   // --- Coalesced + hysteresis height posting ---
let _snippyLastSentH = 0;            // last height we actually sent to the parent
let _snippyLastMeasureH = 0;         // last measured height in the child
let _snippyLastSendTs = 0;           // ms timestamp of last send
let _snippyShrinkArmedAt = 0;        // if > 0, when we're allowed to shrink
let _snippyRAF = null;               // requestAnimationFrame id if scheduled

// Only post if height changed "enough"
const MIN_DELTA = 8;                 // ignore nudges smaller than 8px
const MAX_SEND_RATE_MS = 120;        // never send more than ~8/sec
const SHRINK_GRACE_MS = 400;         // don't shrink again until stable for 400ms

function postHeightCoalesced(reason) {
  // rAF: collapse a burst of calls into one measurement per frame
  if (_snippyRAF) return;
  _snippyRAF = requestAnimationFrame(() => {
    _snippyRAF = null;

    const now = performance.now();
    if (now - _snippyLastSendTs < MAX_SEND_RATE_MS) return;

    const h = measureDocHeight();
    _snippyLastMeasureH = h;
    const delta = Math.abs(h - _snippyLastSentH);

    // If change is tiny, ignore (prevents oscillation on 1–2px flips)
    if (delta < MIN_DELTA) return;

    // Growth is always OK immediately.
    // Shrink only if we've been stable long enough.
    const isShrink = h < _snippyLastSentH;
    if (isShrink) {
      if (_snippyShrinkArmedAt === 0) _snippyShrinkArmedAt = now + SHRINK_GRACE_MS;
      if (now < _snippyShrinkArmedAt) return; // wait for stability
    } else {
      // On growth, reset shrink guard so future shrinks must wait again
      _snippyShrinkArmedAt = 0;
    }

    _snippyLastSentH = h;
    _snippyLastSendTs = now;

    console.log('[Snippy Overlay] nudge -> postHeight', { h, reason, isShrink });
    window.parent.postMessage(
      { source: 'snippy-editor-frame', type: 'contentHeight', height: h },
      '*'
    );
  });
}

// Public nudge API
window.__snippyOverlayNudge = (reason = 'nudge') => {
  postHeightCoalesced(reason);
};


    // Observe genuine layout changes
    const ro = new ResizeObserver(() => window.__snippyOverlayNudge());
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);

    // Debounced nudge for visibility-only changes
    let _nudgeTimer = null;
    const debouncedNudge = () => {
      if (_nudgeTimer) return;
      _nudgeTimer = setTimeout(() => {
        _nudgeTimer = null;
        window.__snippyOverlayNudge();
      }, 30);
    };

    // Watch for class/style/open changes and DOM add/remove
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes') {
          if (m.attributeName === 'class' || m.attributeName === 'style' || m.attributeName === 'open') {
            debouncedNudge();
            break;
          }
        } else if (m.type === 'childList') {
          debouncedNudge();
          break;
        }
      }
    });
    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'open'],
    });

    // Clicks often toggle menus; nudge next tick
    document.addEventListener('click', () => setTimeout(debouncedNudge, 0), true);
    // Animated open/close
    window.addEventListener('transitionend', debouncedNudge, true);
    // Keep fresh if the doc scrolls
    window.addEventListener('scroll', debouncedNudge, { passive: true });

    // Startup heartbeat to prove we're armed
    console.log('[Snippy Overlay] autosize armed');
   [0, 150, 400].forEach((ms) =>
  setTimeout(() => window.__snippyOverlayNudge('startup'), ms)
);

  } catch (e) {
    console.warn('[Snippy Overlay] autosize init failed:', e);
  }
})();

const announcementBtn = document.getElementById('announcement-btn');
const announcementModal = document.getElementById('announcements-modal');
const announcementIndicator = document.getElementById('announcement-indicator');
const markAllReadBtn = document.getElementById('mark-all-read-btn');
const announcementListContainer = document.getElementById('announcement-list-container');
let currentAnnouncements = [];


async function loadAnnouncements() {
  announcementListContainer.innerHTML = "<p>Loading announcements...</p>";

  const response = await fetch("https://snippy-server-clean.onrender.com/api/announcements");
  const list = await response.json();
  


  console.log('--- STEP 3: DATA RECEIVED BY CLIENT ---');
  console.log(JSON.stringify(list, null, 2));
  console.log('---------------------------------------');
// --- Start: Storage Clean-up Logic ---

const activeIds = new Set(list.map(a => a.id));
let { readAnnouncementIds = [] } = await chrome.storage.sync.get('readAnnouncementIds');

// Ensure we're working with an array, not the old '__all__' string
if (Array.isArray(readAnnouncementIds)) {
  const originalCount = readAnnouncementIds.length;
  const cleanedReadIds = readAnnouncementIds.filter(id => activeIds.has(id));

  // If we removed any expired IDs, update storage and use the clean list going forward
  if (cleanedReadIds.length < originalCount) {
    readAnnouncementIds = cleanedReadIds;
    chrome.storage.sync.set({ readAnnouncementIds: cleanedReadIds });
  }
} else {
  // If storage still contains the old '__all__' string, reset it.
  readAnnouncementIds = [];
  chrome.storage.sync.set({ readAnnouncementIds: [] });
}

// --- End: Storage Clean-up Logic ---
  const seen = new Set(readAnnouncementIds);
const visibleAnnouncements = list.filter(a => !seen.has(a.id));
currentAnnouncements = visibleAnnouncements;
  const anyUnread = list.some(a => !seen.has(a.id));
  announcementIndicator.style.display = anyUnread ? 'block' : 'none';

  if (!visibleAnnouncements.length) {
  announcementListContainer.innerHTML = "<p>No active announcements right now.</p>";
  return;
}


  announcementListContainer.innerHTML = "";
  visibleAnnouncements.forEach(a => {
    const box = document.createElement('div');
    box.className = 'admin-section';

    const isRead = seen.has(a.id);

    box.innerHTML = `
      <strong>${a.title}</strong> <span style="font-size: 12px;">(${a.category})</span><br>
      <div style="margin: 10px 0;" class="announcement-body"></div>
	
      <p style="font-size: 12px; opacity: 0.7;">Visible from ${a.start} to ${a.end}</p>
      <button class="mark-read-btn" data-id="${a.id}" ${isRead ? 'disabled' : ''}>
        ${isRead ? '✔️ Read' : '✅ Mark as Read'}
      </button>
    `;
box.querySelector('.announcement-body').innerHTML = a.body;
    announcementListContainer.appendChild(box);
  });

  document.querySelectorAll(".mark-read-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.getAttribute("data-id"), 10);
      
      const updated = new Set(readAnnouncementIds === '__all__' ? [] : readAnnouncementIds);
      updated.add(id);
      chrome.storage.sync.set({ readAnnouncementIds: [...updated] }, () => loadAnnouncements());
    });
  });
}
document.addEventListener('DOMContentLoaded', () => {

  const saveBtn = document.getElementById('save-btn');
  const saveDriveBtn = document.getElementById('save-drive-btn');
  const loadRevisionsBtn = document.getElementById('load-revisions-btn');
  const revisionTargetSelect = document.getElementById('revision-target-selector');

  if (saveBtn) saveBtn.disabled = true;
  
  if (saveDriveBtn) saveDriveBtn.disabled = true;
  if (loadRevisionsBtn) loadRevisionsBtn.disabled = true;
  if (revisionTargetSelect) revisionTargetSelect.disabled = true;

  console.log('[Snippy Debug] DOMContentLoaded event fired.')
  let cmEditor
  let pageMetadata
  let currentErrorMarks = [];
  let originalCodeSnapshot = null
  let isRevertActive = false
  let allFields = []
  let allFunctions = []
  let heartbeatInterval = null
  let allDonors = []
  let activeRejectionId = null 
  const isEdge = navigator.userAgent.includes('Edg/');




  function execCommand(cmd) {
    document.execCommand(cmd, false, null);
  }

  function getRichEditorHTML(id) {
    return document.getElementById(id)?.innerHTML || '';
  }




  function execCommand(cmd) {
    document.designMode = "on";
    document.execCommand(cmd, false, null);
    document.designMode = "off";
  }

  //Function: enablePasteAsHTML



  function enablePasteAsHTML(editorId) {
    const editor = document.getElementById(editorId);
    if (!editor) return;

    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');

      
      if (text.match(/^<.+>$/)) {
        document.execCommand('insertHTML', false, text);
      } else {
        document.execCommand('insertText', false, text);
      }
    });
  }


  // function: shouldShowInsults


  async function shouldShowInsults() {
    console.log('[Snippy Debug] Running shouldShowInsults check...');

    try {
      const {
        snippyUnlock,
        showFreeloaderComments
      } = await chrome.storage.sync.get([
        'snippyUnlock',
        'showFreeloaderComments'
      ]);

      
      if (!snippyUnlock || !snippyUnlock.email || !snippyUnlock.code) {
        console.log('[Snippy Debug] Not a donor: showing insult.');
        return true;
      }

      
      console.log('[Snippy Debug] Donor with toggle:', showFreeloaderComments);
      return showFreeloaderComments !== false;
    } catch (err) {
      console.warn('Error determining if insults should be shown:', err);
      return false;
    }
  }


  //function: showFreeloaderInsult




  async function showFreeloaderInsult() {
    try {
      const shouldShow = await shouldShowInsults();
      if (!shouldShow) return;

      const res = await fetch('https://snippy-server-clean.onrender.com/api/random-approved-insult');
      const result = await res.json();

      if (!result || !result.text || !result.id) return;

      const container = document.getElementById('freeloader-insult');
      if (!container) return;

      let authorLine = '';
      if (result.showName && result.submittedByName && result.submittedByName.trim() !== '') {
        authorLine = `<div class="insult-author">— ${result.submittedByName}</div>`;
      }

      container.innerHTML = `
  ${result.text}
  ${authorLine}
  <a href="https://www.snippyforquickbase.com/#donate" target="_blank" id="insult-donate-link">
    <span class="insult-cta">[Click to shut Snippy up]</span>
  </a>
`;
      let authorBlock = '';
      console.log('[Snippy DEBUG] full result:', result);
      console.log('[Snippy DEBUG] says: showName is', result.showName);
      console.log('[Snippy DEBUG] says: submittedByName is', result.submittedByName);
      if (result.showName && result.submittedByName && result.submittedByName.trim() !== '') {
        console.log('[Snippy DEBUG] authorBlock was created:', result.submittedByName);
        authorBlock = `
    <div class="insult-author">
      <em>${result.submittedByName}</em> says:
    </div>
    
  `;
      }

      container.innerHTML = `
  ${authorBlock}
  ${result.text}
 <br> <a href="https://www.snippyforquickbase.com/#donate" target="_blank" id="insult-donate-link">
    <span class="insult-cta">[Click to shut Snippy up]</span>
  </a>
`;

      container.classList.remove('hidden');
      container.classList.add('show');


      const onClick = () => {
        fetch(`https://snippy-server-clean.onrender.com/api/click-insult?id=${result.id}`, {
          method: 'POST'
        }).catch((err) => console.warn('Failed to track insult click:', err));

        container.classList.add('fade-away');
        setTimeout(() => {
          container.classList.remove('show', 'fade-away');
          container.classList.add('hidden');
          container.innerHTML = '';
        }, 1500);

        container.removeEventListener('click', onClick);
      };


      container.addEventListener('click', onClick);


      setTimeout(() => {
        container.classList.add('fade-away');
        container.removeEventListener('click', onClick);
      }, 8000);


      setTimeout(() => {
        container.classList.remove('show', 'fade-away');
        container.classList.add('hidden');
        container.innerHTML = '';
      }, 10000);


    } catch (err) {
      console.warn('Snippy: Failed to show freeloader insult:', err);
    }
  }









  function setupRichTextButtons(editorId, boldBtnId, italicBtnId, underlineBtnId) {
    const makeHandler = (cmd) => (e) => {

      e.preventDefault();

      const selection = window.getSelection();
      if (!selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      const editor = document.getElementById(editorId);


      if (!editor || !editor.contains(range.startContainer)) {
        if (editor) editor.focus();
        return;
      }


      document.execCommand(cmd, false, null);
    };

    document.getElementById(boldBtnId)?.addEventListener('mousedown', makeHandler('bold'));
    document.getElementById(italicBtnId)?.addEventListener('mousedown', makeHandler('italic'));
    document.getElementById(underlineBtnId)?.addEventListener('mousedown', makeHandler('underline'));
  }






  // ----------Modal Setup



  document.getElementById('retrieve-token-link').addEventListener('click', async (e) => {
    e.preventDefault()
    const email = document.getElementById('unlock-email').value.trim()
    const errorEl = document.getElementById('unlock-error')

    if (!email) {
      errorEl.textContent = 'Please enter your email first.'
      errorEl.style.display = 'block'
      return
    }

    try {
      const res = await fetch(`https://snippy-server-clean.onrender.com/api/resend-code?email=${encodeURIComponent(email)}`)
      if (res.ok) {
        errorEl.textContent = '✅ Your unlock code was sent!'
        errorEl.style.color = 'green'
        errorEl.style.display = 'block'
      } else {
        const result = await res.json()
        errorEl.textContent = result.error || 'Could not find your unlock code.'
        errorEl.style.color = 'red'
        errorEl.style.display = 'block'
      }
    } catch (err) {
      errorEl.textContent = 'Server error. Try again later.'
      errorEl.style.color = 'red'
      errorEl.style.display = 'block'
    }
  })

  document.getElementById('unlock-submit-btn').addEventListener('click', async () => {
    const email = document.getElementById('unlock-email').value.trim()
    const code = document.getElementById('unlock-code').value.trim()
    const errorEl = document.getElementById('unlock-error')

    if (!email || !code) {
      errorEl.textContent = 'Please enter both email and code.'
      errorEl.style.display = 'block'
      return
    }

    try {
      const res = await fetch(`https://snippy-server-clean.onrender.com/api/verify-code?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`)
      const result = await res.json()

      if (result.valid) {
        await chrome.storage.sync.set({
          snippyUnlock: {
            email,
            code,
            isAdmin: !!result.isAdmin
          }
        })

        closeModal(unlockModal)
        errorEl.style.display = 'none'


        updateDonorBadgeUI(result.isAdmin)
        enableDonorPanel()
        if (result.isAdmin) {
          enableAdminPanel()
        }

        console.log('✅ Snippy unlocked. Admin:', result.isAdmin)
      } else {
        errorEl.textContent = 'Invalid code or email.'
        errorEl.style.display = 'block'
      }
    } catch (err) {
      console.error('❌ Unlock request failed:', err)
      errorEl.textContent = 'Server error. Try again later.'
      errorEl.style.display = 'block'
    }
  })

  const editorContainer = document.getElementById('editor-container')
  if (!editorContainer) {
    document.body.innerHTML = '<h1>Critical Error: Editor container not found. Cannot initialize.</h1>'
    return
  }


  const cancelBtn = document.getElementById('cancel-btn')
  // Detect overlay (iframe) vs tab
const IS_OVERLAY = (() => {
  try {
    return window.top !== window;
  } catch (e) {
    // Cross-origin iframe will throw; treat as overlay
    return true;
  }
})();

// In overlay, hide the footer buttons but keep the footer space
if (IS_OVERLAY) {
  [saveBtn, cancelBtn].forEach(btn => {
    if (btn) {
      btn.style.visibility = 'hidden';     // keeps space reserved
      btn.style.pointerEvents = 'none';    // make sure they’re not clickable
      btn.setAttribute('aria-hidden', 'true');
      btn.tabIndex = -1;                   // keep them out of tab order
    }
  });
}


  const fontIncreaseBtn = document.getElementById('font-increase-btn')
  const fontDecreaseBtn = document.getElementById('font-decrease-btn')
  const themeSelector = document.getElementById('theme-selector')

  const lightThemeSelect = document.getElementById('light-theme-select')
  const darkThemeSelect = document.getElementById('dark-theme-select')


  const revisionsSelector = document.getElementById('revisions-selector')
  const revisionsPlaceholder = document.getElementById('revisions-placeholder')
  const gdriveToggle = document.getElementById('disable-gdrive-toggle')
  const gdriveContainer = document.getElementById('gdrive-toggle-container')

  const fieldSearchInput = document.getElementById('field-search-input')
  const fieldListContainer = document.getElementById('field-list-container')
  const showFunctionsBtn = document.getElementById('show-functions-btn')


  const settingsBtn = document.getElementById('settings-btn')
  document.getElementById('beautify-toolbar-btn').addEventListener('click', () => {
    handleBeautify();
    showFreeloaderInsult();
  });

  document.getElementById('search-toolbar-btn').addEventListener('click', () => openSearch(cmEditor));
announcementBtn.addEventListener('click', async () => {
  openModal(announcementModal);
  await loadAnnouncements();
});

markAllReadBtn.addEventListener('click', async () => {
 
  if (currentAnnouncements.length === 0) return;

  
  const currentIds = currentAnnouncements.map(a => a.id);

  
  const { readAnnouncementIds = [] } = await chrome.storage.sync.get('readAnnouncementIds');
  const existingIds = Array.isArray(readAnnouncementIds) ? readAnnouncementIds : [];

  
  const allReadIds = [...new Set([...existingIds, ...currentIds])];

  
  chrome.storage.sync.set({ readAnnouncementIds: allReadIds }, () => {
   
    loadAnnouncements();
  });
});


  const donorDropdown = document.getElementById('donor-dropdown');
  const adminDropdown = document.getElementById('admin-dropdown');
  const donorPanelBtn = document.getElementById('donor-panel-btn');
  const adminPanelBtn = document.getElementById('admin-panel-btn');

  if (donorPanelBtn) {
    donorPanelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('donor-dropdown');
      if (panel) panel.classList.toggle('hidden');
	  if (window.__snippyOverlayNudge) window.__snippyOverlayNudge();



      const adminPanel = document.getElementById('admin-dropdown');
      if (adminPanel) adminPanel.classList.add('hidden');
	  if (window.__snippyOverlayNudge) window.__snippyOverlayNudge();

    });
  }

  if (adminPanelBtn) {
    adminPanelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('admin-dropdown');
      if (panel) panel.classList.toggle('hidden');
if (window.__snippyOverlayNudge) window.__snippyOverlayNudge();
// Micro-burst to catch animated dropdowns
[50, 200, 400].forEach(ms => setTimeout(() => {
  if (window.__snippyOverlayNudge) window.__snippyOverlayNudge();
}, ms));




      const donorPanel = document.getElementById('donor-dropdown');
      if (donorPanel) donorPanel.classList.add('hidden');
	 if (window.__snippyOverlayNudge) window.__snippyOverlayNudge();


    });
  }



  const settingsDropdown = document.getElementById('settings-dropdown')

  let options = [{
      value: 'gdrive',
      label: 'Google Drive'
    },
    {
      value: 'onedrive',
      label: 'Microsoft OneDrive'
    },
    {
      value: 'local',
      label: 'Local Storage'
    },
    {
      value: 'none',
      label: 'None (I like to live dangerously.)'
    }
  ];
  if (isEdge) {
    options = options.filter(opt => opt.value !== 'gdrive');
  }
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    revisionTargetSelect.appendChild(o);
  });

  chrome.storage.sync.get('revisionSaveTarget', (result) => {
    revisionTargetSelect.value = result.revisionSaveTarget || 'local';
    updateRevisionUIState(revisionTargetSelect.value);
  });



  function updateRevisionUIState(value) {
    const shouldDisable = (value === 'none');
    saveDriveBtn.disabled = shouldDisable;
    loadRevisionsBtn.disabled = shouldDisable;
    revisionsSelector.disabled = shouldDisable;
    revisionsPlaceholder.textContent = shouldDisable ? 'Revisions disabled. Enjoying living dangerously?' : '';
  }

  const modalOverlay = document.querySelector('.modal-overlay')

  const functionsModal = document.getElementById('functions-modal')
  const unlockModal = document.getElementById('unlock-modal')
  const functionSearchInput = document.getElementById('function-search-input')
  const functionListContainer = document.getElementById('function-list-container')
  const functionInfoSignature = document.getElementById('function-info-signature')
  const functionInfoDescription = document.getElementById('function-info-description')
  const functionInfoExample = document.getElementById('function-info-example')
  const modalInsertBtn = document.getElementById('modal-insert-btn')

  // --- Admin Elements ---
  const adminAddUserBtn = document.getElementById('admin-add-user-btn')
  const addUserModal = document.getElementById('add-user-modal')
  const addDonorSubmitBtn = document.getElementById('add-donor-submit-btn')
  const addUserFeedbackEl = document.getElementById('add-user-feedback')
  const adminResendCodeBtn = document.getElementById('admin-resend-code-btn')
  const resendCodeModal = document.getElementById('resend-code-modal')
  const resendCodeSubmitBtn = document.getElementById('resend-code-submit-btn')
  const resendCodeFeedbackEl = document.getElementById('resend-code-feedback')
  const adminViewDonorsBtn = document.getElementById('admin-view-donors-btn')
  const viewDonorsModal = document.getElementById('view-donors-modal')
  const donorSearchInput = document.getElementById('donor-search-input')
  const donorAdminFilter = document.getElementById('donor-admin-filter')
  const donorListContainer = document.getElementById('donor-list-container')
  const viewDonorsFeedbackEl = document.getElementById('view-donors-feedback')

  // --- Donor Elements ---
  const donorSubmitInsultBtn = document.getElementById('donor-submit-insult-btn')
  const submitInsultModal = document.getElementById('submit-insult-modal')
  const donorInsultSubmitBtn = document.getElementById('donor-insult-submit-btn')
  const submitInsultFeedbackEl = document.getElementById('submit-insult-feedback')
  const donorViewSubmissionsBtn = document.getElementById('donor-view-submissions-btn')
  const mySubmissionsModal = document.getElementById('my-submissions-modal')
  const mySubmissionsContainer = document.getElementById('my-submissions-container')
  const mySubmissionsFeedbackEl = document.getElementById('my-submissions-feedback')
  const showCommentsToggle = document.getElementById('show-comments-toggle')

  const confirmationModal = document.getElementById('confirmation-modal')
  const confirmationTitle = document.getElementById('confirmation-title')
  const confirmationMessage = document.getElementById('confirmation-message')
  const rejectionReasonModal = document.getElementById('rejection-reason-modal')
  const rejectionReasonSubmitBtn = document.getElementById('rejection-reason-submit-btn')

  // --- Insult Management Elements ---
  const adminManageInsultsBtn = document.getElementById('admin-manage-insults-btn')
  const adminCreateAnnouncementBtn = document.getElementById('admin-create-announcement-btn');
const adminAnnouncementModal = document.getElementById('admin-announcement-modal');
let announcementSubmitBtn = document.getElementById('announcement-submit-btn');
const adminManageAnnouncementsBtn = document.getElementById('admin-manage-announcements-btn');
let editingAnnouncementId = null;

adminManageAnnouncementsBtn.addEventListener('click', async () => {
  editingAnnouncementId = null;

  announcementFeedbackEl.style.display = 'none';
  document.getElementById('announcement-title').value = '';
  document.getElementById('announcement-body').innerHTML = '';
  document.getElementById('announcement-category').value = 'update';
  document.getElementById('announcement-start').value = '';
  document.getElementById('announcement-end').value = '';
  announcementSubmitBtn.textContent = 'Create';

  const list = document.getElementById('announcement-list');
  list.innerHTML = 'Loading...';

  try {
    const response = await fetch('/api/admin/announcements');
    const allAnnouncements = await response.json();

    list.innerHTML = '';
    if (allAnnouncements.length === 0) {
      list.textContent = 'No announcements found.';
    } else {
      allAnnouncements.forEach((a) => {
        const box = document.createElement('div');
        box.className = 'announcement-entry';
        box.innerHTML = `
          <strong>${a.title}</strong><br>
          <div style="margin: 10px 0;" class="announcement-body"></div>
          <small>Category: ${a.category}</small><br>
          <small>Start: ${a.start || 'immediate'}</small><br>
          <small>End: ${a.end || 'none'}</small><br>
          <button class="btn-announcement-edit">Edit</button>
          <button class="btn-announcement-delete">Delete</button>
          <hr>
        `;
        box.querySelector('.announcement-body').innerHTML = a.body;

        box.querySelector('.btn-announcement-edit').addEventListener('click', () => {
          editingAnnouncementId = a.id;
          document.getElementById('announcement-title').value = a.title;
          document.getElementById('announcement-body').innerHTML = a.body;
          document.getElementById('announcement-category').value = a.category;
          document.getElementById('announcement-start').value = a.start || '';
          document.getElementById('announcement-end').value = a.end || '';
          announcementSubmitBtn.textContent = 'Update';
        });

        box.querySelector('.btn-announcement-delete').addEventListener('click', async () => {
          const confirmed = confirm(`Delete "${a.title}"?`);
          if (!confirmed) return;
          await fetch('/api/admin/delete-announcement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: a.id })
          });
          box.remove();
        });

        list.appendChild(box);
      });
    }
  } catch (e) {
    list.innerHTML = '❌ Failed to load announcements.';
  }

  openModal(adminAnnouncementModal);
});

const announcementFeedbackEl = document.getElementById('announcement-feedback');
  const insultManagementModal = document.getElementById('insult-management-modal')
  const newInsultText = document.getElementById('new-insult-text')
  const addInsultSubmitBtn = document.getElementById('add-insult-submit-btn')
  const addInsultFeedbackEl = document.getElementById('add-insult-feedback')
  const insultStatusFilter = document.getElementById('insult-status-filter')
  const insultsByStatusContainer = document.getElementById('insults-by-status-container')
  const insultViewFeedbackEl = document.getElementById('insult-view-feedback')

  const searchBar = document.getElementById('search-bar')
  const searchInput = document.getElementById('search-input')
  const replaceInput = document.getElementById('replace-input')
  const findPrevBtn = document.getElementById('find-prev-btn')
  const findNextBtn = document.getElementById('find-next-btn')
  const replaceBtn = document.getElementById('replace-btn')
  const replaceAllBtn = document.getElementById('replace-all-btn')
  const searchStatus = document.getElementById('search-status')
  const searchCloseBtn = document.getElementById('search-close-btn')

  revisionTargetSelect.addEventListener('change', () => {
    const value = revisionTargetSelect.value;
    updateRevisionUIState(value);

    const setTargetAndRefresh = (target) => {
      chrome.storage.sync.set({
        revisionSaveTarget: target
      }, () => {
        console.log(`[Snippy Debug] Revision target set to "${target}". Automatically loading revisions.`);

        if (target !== 'none') {
          handleLoadRevisions();
        } else {

          revisionsSelector.innerHTML = '';
          revisionsPlaceholder.textContent = 'Revisions disabled';
          revisionsPlaceholder.classList.remove('hidden');
          revisionsSelector.classList.add('hidden');
        }
        checkAuthStatusAndUpdateUI();
      });
    };

    if (value === 'gdrive') {
      console.log('[Snippy Debug] User selected Google Drive. Requesting authentication check...');
      chrome.runtime.sendMessage({
        action: 'ensureGDriveAuth'
      }, (response) => {
        if (response?.success) {
          setTargetAndRefresh('gdrive');
        } else {
          alert('Google Drive authentication failed. Reverting to Local.');
          revisionTargetSelect.value = 'local';
          updateRevisionUIState('local');
          setTargetAndRefresh('local');
        }
      });

    } else if (value === 'onedrive') {
      console.log('[Snippy Debug] User selected OneDrive. Requesting authentication check...');
      chrome.runtime.sendMessage({
        action: 'ensureOneDriveAuth'
      }, (response) => {
        if (response?.success) {
          setTargetAndRefresh('onedrive');
        } else {
          alert('OneDrive authentication failed. Reverting to Local.');
          revisionTargetSelect.value = 'local';
          updateRevisionUIState('local');
          setTargetAndRefresh('local');
        }
      });

    } else {

      setTargetAndRefresh(value);
    }

  });


  function enterOrphanedState() {
    console.warn('[Snippy Debug] Entering orphaned state. Parent tab disconnected.')
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Parent Tab Closed'
    }
    if (cancelBtn) cancelBtn.disabled = true
    if (saveDriveBtn) saveDriveBtn.disabled = true
    if (loadRevisionsBtn) loadRevisionsBtn.disabled = true
    if (revisionsSelector) revisionsSelector.disabled = true
    const orphanBanner = document.createElement('div')
    orphanBanner.id = 'orphan-banner'
    orphanBanner.style.cssText = 'background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; padding: 12px; text-align: center; font-weight: bold; font-size: 14px; position: fixed; top: 0; left: 0; width: 100%; z-index: 10000;'
    orphanBanner.innerHTML = '⚠️ <strong>Connection Lost!</strong> The original Quickbase tab was closed or navigated away from. <br>Please copy your code manually and close this editor.'
    document.body.prepend(orphanBanner)
    editorContainer.style.paddingTop = `${orphanBanner.offsetHeight}px`
  }

  function setupMessageListener() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Snippy Debug] Message received in editor:', request);

    const isFormula =
      !!pageMetadata && (pageMetadata.type === 'formula' || pageMetadata.type === 'keyprops');

    switch (request.action) {
      case 'displayValidationResult': {
        handleDisplayValidationResult(request.data);
        break;
      }

      case 'displayFieldsList': {
        if (isFormula) {
          allFields = request.data;
          renderFieldList(allFields);
        }
        break;
      }

      case 'displayFunctionsList': {
        console.log(`[Snippy Debug] displayFunctionsList received. isFormula: ${isFormula}`);
        console.log('[Snippy Debug] displayFunctionsList received. Payload:', request.data);

        if (isFormula) {
          allFunctions = request.data;
          if (cmEditor) {
            const functionNames = allFunctions.map(f => f.name);
            cmEditor.setOption('mode', { name: 'qb-formula', keywords: functionNames });
            console.log('[Snippy Debug] Mode updated for formula with dynamic keywords.');
            renderFunctionList(allFunctions);
          }
        }
        break;
      }

      case 'displayFunctionDetails': {
        console.log('[Snippy Debug] EDITOR received displayFunctionDetails:', request.data);
        updateFunctionInfoPanel(request.data);

        const index = allFunctions.findIndex(f => f.id === request.data.id);
        if (index !== -1) {
          allFunctions[index] = request.data;
        }
        break;
      }

      case 'gdriveSaveFailed': {
        alert(`Warning: Could not save to Google Drive.\n\nError: ${request.error}`);
        break;
      }

      case 'dumpCurrentCodeRequest': {
        const code = cmEditor ? cmEditor.getValue() : '';
        sendResponse({ ok: true, code, metadata: pageMetadata });
        // responded synchronously; no need to return true
        break;
      }

      default: {
        // no-op
        break;
      }
    }
  });
}












function handleDisplayValidationResult(payload) {
  if (!cmEditor) return;
  const annotations = payload.annotations || [];

  // Clear old highlights
  if (currentErrorMarks.length > 0) {
    currentErrorMarks.forEach(mark => mark.clear());
    currentErrorMarks = [];
  }

  cmEditor.clearGutter('CodeMirror-lint-markers');

  annotations.forEach((err) => {
    if (!err || typeof err.row !== 'number' || err.row < 0) return;

    const editorFontSize = parseInt(window.getComputedStyle(cmEditor.getWrapperElement()).fontSize, 10);
    const iconSize = Math.max(8, Math.round(editorFontSize * 0.9));

    const marker = document.createElement('div');
    marker.className = `lint-marker-${err.type}`;
    marker.style.cssText = `width: ${iconSize}px; height: ${iconSize}px; margin-left: -5px; cursor: pointer; background-repeat: no-repeat; background-position: center center; background-size: 100%;`;
    marker.style.backgroundImage = err.type === 'warning'
      ? 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'%23ffc107\' viewBox=\'-2 -2 20 20\'%3e%3cpath d=\'M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5a.905.905 0 0 1 .9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z\'/%3e%3c/svg%3e")'
      : 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'%23dc3545\' viewBox=\'-2 -2 20 20\'%3e%3cpath d=\'M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zM5.337 4.019c.125-.219.38-.344.65-.344h4.026c.27 0 .525-.125.65.344l3.333 5.925c.125.219.125.469 0 .688l-3.333 5.925c-.125-.219-.38-.344-.65-.344H5.987c-.27 0-.525-.125-.65-.344l-3.333-5.925c-.125-.219-.125-.469 0 .688l3.333-5.925z\'/%3e%3c/svg%3e")';

    // --- Tooltip on hover ---
   marker.addEventListener('mouseenter', () => {
  try {
    const message = err.text || err.message || '[Unknown error]';
    const tooltip = document.createElement('div');
    tooltip.className = 'snippy-error-tooltip';
    tooltip.textContent = message;

    document.body.appendChild(tooltip);

    const rect = marker.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;

    tooltip.style.top = `${rect.top + scrollY}px`;
    tooltip.style.left = `${rect.right + 8 + scrollX}px`;

    marker._snippyTooltip = tooltip;
  } catch (e) {
    console.error('Snippy Tooltip Error:', e);
  }
});



   marker.addEventListener('mouseleave', () => {
  try {
    if (marker._snippyTooltip) {
      marker._snippyTooltip.remove();
      marker._snippyTooltip = null;
    }
  } catch (e) {
    console.error('Snippy Tooltip Cleanup Error:', e);
  }
});


    cmEditor.setGutterMarker(err.row, 'CodeMirror-lint-markers', marker);

    // Highlight token in line
    try {
      const token = cmEditor.getTokenAt({ line: err.row, ch: err.column + 1 });
      if (token && token.string.trim().length > 0) {
        const from = { line: err.row, ch: token.start };
        const to = { line: err.row, ch: token.end };
        const mark = cmEditor.markText(from, to, { className: 'cm-error-token' });
        currentErrorMarks.push(mark);
      }
    } catch (e) {
      console.warn("Snippy: Could not find a token to highlight for an error.", e);
    }
  });
}












  function renderFieldList(fields) {
    fieldListContainer.innerHTML = ''
    fields.forEach((field) => {
      const item = document.createElement('div')
      item.className = 'field-item'
      item.dataset.value = field.value
      item.innerHTML = `<span class="field-name">${field.name}</span><span class="field-type">${field.type || ''}</span>`
      fieldListContainer.appendChild(item)
    })
  }

  function renderFunctionList(functions) {
    functionListContainer.innerHTML = ''
    functions.forEach((func) => {
      const item = document.createElement('div')
      item.className = 'function-item'
      item.dataset.id = func.id
      item.textContent = func.name
      item.title = `ID: ${func.id}`
      functionListContainer.appendChild(item)
    })
  }

  async function loadAndRenderThemeSelectors() {
    try {
      const response = await fetch(chrome.runtime.getURL('themes.json'))
      console.log('[Snippy Debug] Fetching themes.json from:', chrome.runtime.getURL('themes.json'))

      const themes = await response.json()
      console.log('[Snippy Debug] Loaded themes:', themes)

      const lightThemes = themes.filter((t) => !t.dark)
      const darkThemes = themes.filter((t) => t.dark)


      lightThemes.forEach((theme) => {
        const option = document.createElement('option')
        option.value = theme.name
        option.textContent = theme.label
        lightThemeSelect.appendChild(option)
      })


      darkThemes.forEach((theme) => {
        const option = document.createElement('option')
        option.value = theme.name
        option.textContent = theme.label
        darkThemeSelect.appendChild(option)
      })


      const {
        preferredLightTheme,
        preferredDarkTheme
      } = await chrome.storage.sync.get([
        'preferredLightTheme',
        'preferredDarkTheme'
      ])




      lightThemeSelect.value = preferredLightTheme || 'quickbase-light'
      darkThemeSelect.value = preferredDarkTheme || 'quickbase-dark'
    } catch (error) {
      console.error('Failed to load or render themes.json:', error)
    }
  }

  function updateFunctionInfoPanel(func) {
    if (!func) {
      functionInfoSignature.textContent = 'Select a function...'
      functionInfoDescription.textContent = ''
      functionInfoExample.textContent = ''
      return
    }
    functionInfoSignature.textContent = func.signature
    functionInfoDescription.textContent = func.description
    functionInfoExample.textContent = func.example
  }
function showErrorModal(message) {
  const modal = document.getElementById('error-modal');
  const messageEl = document.getElementById('error-modal-message');
  messageEl.innerHTML = message;
  openModal(modal);
}
  function openModal(modal) {
    if (!modal) return
    modalOverlay.classList.remove('hidden')
    modal.classList.remove('hidden')
	if (window.__snippyOverlayNudge) window.__snippyOverlayNudge();

  }

  function closeModal(modal) {
    if (!modal) return
    modalOverlay.classList.add('hidden')
    modal.classList.add('hidden')
	if (window.__snippyOverlayNudge) window.__snippyOverlayNudge();

  }

  function openSearch(cm) {
    searchBar.style.display = 'flex'
    const selection = cm.getSelection()
    if (selection) searchInput.value = selection
    searchInput.focus()
    searchInput.select()
    find(false)
    showFreeloaderInsult();
	if (window.__snippyOverlayNudge) window.__snippyOverlayNudge();

  }

  function closeSearch() {
    searchBar.style.display = 'none'
    cmEditor.focus()
	if (window.__snippyOverlayNudge) window.__snippyOverlayNudge();

  }

  function find(reverse = false) {
    if (!cmEditor) return
    const query = searchInput.value
    if (!query) {
      searchStatus.textContent = ''
      const cursor = cmEditor.getCursor()
      cmEditor.setSelection(cursor, cursor)
      return
    }
    let cursor = cmEditor.getSearchCursor(query, reverse ? cmEditor.getCursor('from') : cmEditor.getCursor('to'), {
      caseFold: true
    })
    if (!cursor.find(reverse)) {
      const from = reverse ? CodeMirror.Pos(cmEditor.lastLine()) : CodeMirror.Pos(cmEditor.firstLine(), 0)
      cursor = cmEditor.getSearchCursor(query, from, {
        caseFold: true
      })
      if (!cursor.find(reverse)) {
        searchStatus.textContent = 'Not found'
        return
      }
    }
    cmEditor.setSelection(cursor.from(), cursor.to())
    cmEditor.scrollIntoView({
      from: cursor.from(),
      to: cursor.to()
    }, 50)
    searchStatus.textContent = ''
  }

  function replace() {
    if (!cmEditor) return
    const query = searchInput.value
    const replacement = replaceInput.value
    const selection = cmEditor.getSelection()
    if (query && selection.toLowerCase() === query.toLowerCase()) {
      cmEditor.replaceSelection(replacement, 'end')
    }
    find(false)
  }

  function replaceAll() {
    if (!cmEditor) return
    const query = searchInput.value
    const replacement = replaceInput.value
    if (!query) return
    let count = 0
    cmEditor.operation(() => {
      const cursor = cmEditor.getSearchCursor(query, CodeMirror.Pos(cmEditor.firstLine(), 0), {
        caseFold: true
      })
      while (cursor.findNext()) {
        cursor.replace(replacement)
        count++
      }
    })
    searchStatus.textContent = `Replaced ${count} occurrences.`
  }

  function showAdminFeedback(message, isSuccess) {
    addUserFeedbackEl.textContent = message
    addUserFeedbackEl.className = `admin-feedback ${isSuccess ? 'success' : 'error'}`
    addUserFeedbackEl.style.display = 'block'
  }

  function hideAdminFeedback() {
    addUserFeedbackEl.style.display = 'none'
  }

  function setupEventListeners() {
    saveBtn.addEventListener('click', () => {
      handleSave();

    });

    cancelBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'editorCancel'
      })
    })
    fieldSearchInput.addEventListener('focus', () => {
      fieldListContainer.style.display = 'block'
    })
    fieldSearchInput.addEventListener('blur', () => {
      setTimeout(() => {
        fieldListContainer.style.display = 'none'
      }, 150)
    })
    fieldSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase()
      renderFieldList(allFields.filter((field) => field.name.toLowerCase().includes(searchTerm)))
    })
    fieldListContainer.addEventListener('click', (e) => {
      const fieldItem = e.target.closest('.field-item')
      if (fieldItem && cmEditor) {
        cmEditor.replaceSelection(fieldItem.dataset.value)
        fieldListContainer.style.display = 'none'
        cmEditor.focus()
      }
    })
    showFunctionsBtn.addEventListener('click', () => openModal(functionsModal))
    functionSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase()
      renderFunctionList(allFunctions.filter((func) => func.name.toLowerCase().includes(searchTerm)))
    })


    functionListContainer.addEventListener('click', (e) => {
      const funcItem = e.target.closest('.function-item')
      if (funcItem) {
        const currentSelected = functionListContainer.querySelector('.selected')
        if (currentSelected) currentSelected.classList.remove('selected')
        funcItem.classList.add('selected')

        const funcId = funcItem.dataset.id
        console.log('[Snippy Debug] Requesting full details for:', funcId)


        chrome.runtime.sendMessage({
          action: 'getFunctionDetailsFromPage',
          payload: {
            id: funcId
          }
        });
      }
    })

    modalInsertBtn.addEventListener('click', () => {
      const selectedItem = functionListContainer.querySelector('.selected')
      if (selectedItem && cmEditor) {

        console.log('[Snippy Debug] Insert clicked. Selected ID:', selectedItem?.dataset.id);


        const functionName = allFunctions.find((f) => f.id === selectedItem.dataset.id).name
        cmEditor.replaceSelection(`${functionName}()`)
        const cursorPos = cmEditor.getCursor()
        cmEditor.setCursor(cursorPos.line, cursorPos.ch - 1)
        closeModal(functionsModal)
        cmEditor.focus()
      }
    })
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      settingsDropdown.classList.toggle('hidden')
	  if (window.__snippyOverlayNudge) window.__snippyOverlayNudge();

	  
    })

    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);



    fontIncreaseBtn.addEventListener('click', () => updateFontSize(1))
    fontDecreaseBtn.addEventListener('click', () => updateFontSize(-1))
    themeSelector.addEventListener('change', (e) => {
      handleThemeChange(e);
      showFreeloaderInsult();
    });

    gdriveToggle?.addEventListener('change', () => {
      const isDisabled = gdriveToggle.checked
      chrome.storage.sync.set({
        gdriveDisabled: isDisabled
      })
      if (isDisabled) disableGDriveFeatures(false)
      else enableGDriveFeatures()
      showFreeloaderInsult();
    })
    saveDriveBtn.addEventListener('click', () => {
  openModal(document.getElementById('manual-save-modal'));
});

    loadRevisionsBtn.addEventListener('click', handleLoadRevisions)
    revisionsSelector.addEventListener('change', handleRestoreRevision)
    searchCloseBtn.addEventListener('click', closeSearch)
    findNextBtn.addEventListener('click', () => find(false))
    findPrevBtn.addEventListener('click', () => find(true))
    replaceBtn.addEventListener('click', replace)
    replaceAllBtn.addEventListener('click', replaceAll)
    searchInput.addEventListener('input', () => find(false))
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        find(e.shiftKey)
      } else if (e.key === 'Escape') closeSearch()
    })
    replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        replace()
      } else if (e.key === 'Escape') closeSearch()
    })
    document.getElementById('feedback-btn')?.addEventListener('click', () => {
      settingsDropdown.classList.add('hidden');
      window.open('https://www.snippyforquickbase.com/feedback.html', '_blank')
    })




    document.getElementById('already-donated-link')?.addEventListener('click', (e) => {
      e.preventDefault()
      openModal(unlockModal)
    })


    document.getElementById('unlock-cancel-btn')?.addEventListener('click', () => {
      closeModal(unlockModal)
    })



    document.getElementById('donate-btn')?.addEventListener('click', () => {
      settingsDropdown.classList.add('hidden');
      window.open('https://www.snippyforquickbase.com/#donate', '_blank')
    })

    window.addEventListener('click', (e) => {
      if (!settingsDropdown.classList.contains('hidden') && !settingsDropdown.contains(e.target) && !settingsDropdown.contains(e.target)) {
        settingsDropdown.classList.add('hidden')
      }

    })

    document.querySelectorAll('.modal-overlay, .modal .close-btn, .modal .modal-cancel-btn').forEach((el) => {
      el.addEventListener('click', (e) => {
        const modalToClose = e.target.closest('.modal')
        if (modalToClose) closeModal(modalToClose)
        else if (e.target.classList.contains('modal-overlay')) {
          document.querySelectorAll('.modal').forEach((m) => closeModal(m))
        }
      })
    })
	
	
// ----- Admin Announcement Listeners -----	
	
async function fetchAndRenderAllAnnouncements() {
  try {
    const res = await fetch('https://snippy-server-clean.onrender.com/api/admin/announcements?auth=snippy-coder-47');
    const data = await res.json();
    renderAdminAnnouncementList(data);
  } catch (err) {
    console.error("❌ Failed to load admin announcements:", err);
    const container = document.getElementById('admin-announcement-list');
    if (container) container.innerHTML = '<p>Error loading announcements.</p>';
  }
}

function renderAdminAnnouncementList(data) {
  const container = document.getElementById('admin-announcement-list');
  if (!container) return;

  container.innerHTML = '';

  if (!data || data.length === 0) {
    container.innerHTML = '<p>No announcements yet.</p>';
    return;
  }

  data.forEach(announcement => {
    const box = document.createElement('div');
    box.className = 'admin-section';
    box.innerHTML = `
      <strong>${announcement.title}</strong> <span style="font-size: 12px;">(${announcement.category})</span><br>
      <div class="announcement-body">${announcement.body}</div>
      <p style="font-size: 12px; opacity: 0.7;">${announcement.start} to ${announcement.end}</p>
      <button class="edit-announcement-btn" data-id="${announcement.id}">✏️ Edit</button>
      <button class="delete-announcement-btn danger" data-id="${announcement.id}">🗑 Delete</button>
    `;
    container.appendChild(box);
  });

  container.querySelectorAll('.edit-announcement-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = data.find(d => d.id == id);
      if (!item) return;

      document.getElementById('announcement-title').value = item.title;
      document.getElementById('announcement-body').innerHTML = item.body;
      document.getElementById('announcement-category').value = item.category;
      document.getElementById('announcement-start').value = item.start;
      document.getElementById('announcement-end').value = item.end;

      const submitBtn = document.getElementById('announcement-submit-btn');
    if (submitBtn) {
      submitBtn.dataset.mode = 'edit';	  
      submitBtn.dataset.id = id;
      submitBtn.textContent = 'Save Changes';
    }

      openModal(adminAnnouncementModal);
    });
  });

  container.querySelectorAll('.delete-announcement-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('Are you sure you want to delete this announcement?')) return;

      try {
        const res = await fetch('https://snippy-server-clean.onrender.com/api/admin/delete-announcement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, auth: 'snippy-coder-47' })
        });
        const result = await res.json();
        if (result.success) {
          fetchAndRenderAllAnnouncements();
        } else {
          alert('Failed to delete.');
        }
      } catch (err) {
        console.error('Delete failed:', err);
        alert('Error deleting announcement.');
      }
    });
  });
}




    // --- Admin Listeners ---
    adminAddUserBtn.addEventListener('click', () => {
      hideAdminFeedback()
      adminDropdown.classList.add('hidden')
      openModal(addUserModal)
    })
    addDonorSubmitBtn.addEventListener('click', handleAddDonor)
    adminResendCodeBtn.addEventListener('click', () => {
      resendCodeFeedbackEl.style.display = 'none'
      document.getElementById('resend-code-email').value = ''
      adminDropdown.classList.add('hidden')
      openModal(resendCodeModal)
    })
    resendCodeSubmitBtn.addEventListener('click', handleResendCode)
    adminViewDonorsBtn.addEventListener('click', handleViewDonors)
    donorSearchInput.addEventListener('input', filterAndRenderDonors)
    donorAdminFilter.addEventListener('change', filterAndRenderDonors)
    donorListContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('promote-btn')) handlePromoteClick(e)
      if (e.target.classList.contains('delete-btn')) handleDeleteClick(e)
    })

    // --- Donor Listeners ---
    donorSubmitInsultBtn.addEventListener('click', handleDonorSubmitInsultClick)
    donorInsultSubmitBtn.addEventListener('click', handleDonorInsultSubmit)
    donorViewSubmissionsBtn.addEventListener('click', handleViewSubmissionsClick)
    showCommentsToggle.addEventListener('change', (e) => {
      chrome.storage.sync.set({
        showFreeloaderComments: e.target.checked
      })
    })





    // --- Insult Management Listeners ---
	function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}
	
    adminManageInsultsBtn.addEventListener('click', handleManageInsultsClick)
	const adminManageAnnouncementsBtn = document.getElementById('admin-manage-announcements-btn')
if (adminManageAnnouncementsBtn) {
  adminManageAnnouncementsBtn.addEventListener('click', () => {
    console.log('✅ Manage Announcements clicked');
    const btn = document.getElementById('announcement-submit-btn');
    if (btn) {
      btn.textContent = 'Create';
      btn.dataset.mode = '';
      btn.dataset.id = '';
    }
    fetchAndRenderAllAnnouncements();
    openModal(adminAnnouncementModal);
  });
}

announcementSubmitBtn.addEventListener('click', async () => {
  const title = document.getElementById('announcement-title').value.trim();
  let body = document.getElementById('announcement-body').innerHTML.trim();
  body = decodeHtmlEntities(body);
  const category = document.getElementById('announcement-category').value;
  const start = document.getElementById('announcement-start').value;
  const end = document.getElementById('announcement-end').value;

  if (!title || !body || !start || !end) {
    announcementFeedbackEl.textContent = 'All fields are required.';
    announcementFeedbackEl.className = 'admin-feedback error';
    announcementFeedbackEl.style.display = 'block';
    return;
  }

  try {
    const { snippyUnlock } = await chrome.storage.sync.get('snippyUnlock');
    const isEdit = announcementSubmitBtn.dataset.mode === 'edit';
    const endpoint = isEdit
      ? 'https://snippy-server-clean.onrender.com/api/admin/update-announcement'
      : 'https://snippy-server-clean.onrender.com/api/admin/announcements';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: isEdit ? Number(announcementSubmitBtn.dataset.id) : undefined,
        title,
        body,
        category,
        start,
        end,
        createdByEmail: snippyUnlock?.email || '',
        auth: 'snippy-coder-47'
      })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      const mode = announcementSubmitBtn.dataset.mode;
      announcementFeedbackEl.textContent = mode === 'edit'
        ? '✅ Changes saved!'
        : '✅ Announcement created!';

      announcementFeedbackEl.className = 'admin-feedback success';
      fetchAndRenderAllAnnouncements();
	  document.getElementById('announcement-title').value = '';
document.getElementById('announcement-body').innerHTML = '';
document.getElementById('announcement-category').value = 'update';
document.getElementById('announcement-start').value = '';
document.getElementById('announcement-end').value = '';

      announcementSubmitBtn.dataset.mode = '';
      announcementSubmitBtn.dataset.id = '';
    } else {
      throw new Error(result.error || 'Unknown server error');
    }
  } catch (err) {
    announcementFeedbackEl.textContent = `Error: ${err.message}`;
    announcementFeedbackEl.className = 'admin-feedback error';
  }

  announcementFeedbackEl.style.display = 'block';
});


  
  
  
  








    addInsultSubmitBtn.addEventListener('click', handleAddInsultSubmit)
    insultStatusFilter.addEventListener('change', () => {
      fetchAndRenderInsults(insultStatusFilter.value)
    })
    insultsByStatusContainer.addEventListener('click', (e) => {
      const button = e.target.closest('.action-btn')
      if (!button) return

      const insultId = button.dataset.id
      if (button.classList.contains('insult-delete-btn')) {
        const insultText = button.dataset.text
        handleDeleteInsultClick(insultId, insultText)
      } else if (button.classList.contains('insult-approve-btn')) {
        handleApproveInsultClick(insultId)
      } else if (button.classList.contains('insult-reject-btn')) {
        handleRejectInsultClick(insultId)
      }
    })
    rejectionReasonSubmitBtn.addEventListener('click', handleRejectionReasonSubmit)

    lightThemeSelect.addEventListener('change', () => {
      chrome.storage.sync.set({
        preferredLightTheme: lightThemeSelect.value
      })
      if (!document.body.classList.contains('dark') && typeof cmEditor !== 'undefined') {
        cmEditor.setOption('theme', lightThemeSelect.value)
		cmEditor.refresh();
      }
    })

    darkThemeSelect.addEventListener('change', () => {
      chrome.storage.sync.set({
        preferredDarkTheme: darkThemeSelect.value
      })
      if (document.body.classList.contains('dark') && typeof cmEditor !== 'undefined') {
        cmEditor.setOption('theme', darkThemeSelect.value)
      }
    })


    document.getElementById('gdrive-disconnect-btn')?.addEventListener('click', handleGDriveDisconnect);
    document.getElementById('onedrive-disconnect-btn')?.addEventListener('click', handleOneDriveDisconnect);
document.getElementById('error-modal-ok').addEventListener('click', () => {
  closeModal(document.getElementById('error-modal')); 
});
document.getElementById('user-guide-btn').addEventListener('click', () => {
  window.open('https://www.snippyforquickbase.com/guide.html', '_blank');
});

const resetManualSaveModal = () => {
  document.getElementById('manual-filename-input').value = '';
  const error = document.getElementById('manual-save-error');
  if (error) error.style.display = 'none';
};

document.getElementById('manual-save-cancel-btn')?.addEventListener('click', () => {
  closeModal(document.getElementById('manual-save-modal'));
  resetManualSaveModal();
});

document.querySelector('#manual-save-modal .close-btn')?.addEventListener('click', () => {
  closeModal(document.getElementById('manual-save-modal'));
  resetManualSaveModal();
});

document.getElementById('manual-save-confirm-btn')?.addEventListener('click', async () => {
  const input = document.getElementById('manual-filename-input');
  const errorEl = document.getElementById('manual-save-error');
  const name = input.value.trim();

  // Characters disallowed by Windows and most cloud storage systems
  const forbidden = /[\/\\:\*\?"<>\|]/;

  if (name && forbidden.test(name)) {
    errorEl.textContent = 'Filenames cannot include / \\ : * ? " < > |';
    errorEl.style.display = 'block';
    return;
  }

  errorEl.style.display = 'none';

  closeModal(document.getElementById('manual-save-modal'));

  saveDriveBtn.disabled = true;
  saveDriveBtn.textContent = 'Saving...';

  try {
    const { default: RevisionStore } = await import(chrome.runtime.getURL('RevisionStore.js'));
    const currentCode = cmEditor.getValue();

    // 🔧 Normalize KeyProps → treat as formula for revision keys
    const metaForSave = (pageMetadata?.type === 'keyprops')
      ? { ...pageMetadata, type: 'formula', fieldId: 'KeyProps' }
      : pageMetadata;

    const result = await RevisionStore.addRevision(currentCode, metaForSave, "[Manual Save] ", name || null);

    if (result === 'NO_CHANGES') {
      saveDriveBtn.textContent = '🟰 No Changes';
    } else {
      saveDriveBtn.textContent = '✅ Saved!';
    }
  } catch (err) {
    console.error('Snippy Manual Save Error:', err);
    saveDriveBtn.textContent = '⚠️ Failed';
  }

  setTimeout(() => {
    saveDriveBtn.textContent = '💾 Manually Save';
    saveDriveBtn.disabled = false;
  }, 2500);
});


  }

  async function handleAddDonor() {
    const nameInput = document.getElementById('add-donor-name')
    const emailInput = document.getElementById('add-donor-email')
    const isAdminCheckbox = document.getElementById('add-donor-is-admin')
    const name = nameInput.value.trim()
    const email = emailInput.value.trim()
    const isAdmin = isAdminCheckbox.checked
    if (!name || !email) {
      showAdminFeedback('Both Name and Email are required.', false)
      return
    }
    addDonorSubmitBtn.disabled = true
    addDonorSubmitBtn.textContent = 'Adding...'
    hideAdminFeedback()
    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/manual-add-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          email,
          isAdmin,
          auth: 'snippy-coder-47'
        })
      })
      const result = await response.json()
      if (response.ok) {
        showAdminFeedback(`Success! User ${name} added. Their code is: ${result.code}`, true)
        nameInput.value = ''
        emailInput.value = ''
        isAdminCheckbox.checked = false
      } else {
        throw new Error(result.error || 'An unknown error occurred.')
      }
    } catch (err) {
      showAdminFeedback(`Error: ${err.message}`, false)
    } finally {
      addDonorSubmitBtn.disabled = false
      addDonorSubmitBtn.textContent = 'Add User'
    }
  }

  async function handleResendCode() {
    const emailInput = document.getElementById('resend-code-email')
    const email = emailInput.value.trim()
    if (!email) {
      resendCodeFeedbackEl.textContent = 'Email address is required.'
      resendCodeFeedbackEl.className = 'admin-feedback error'
      resendCodeFeedbackEl.style.display = 'block'
      return
    }
    resendCodeSubmitBtn.disabled = true
    resendCodeSubmitBtn.textContent = 'Sending...'
    resendCodeFeedbackEl.style.display = 'none'
    try {
      const response = await fetch(`https://snippy-server-clean.onrender.com/api/resend-code?email=${encodeURIComponent(email)}`)
      if (response.ok) {
        resendCodeFeedbackEl.textContent = `✅ Success! An email was sent to ${email}.`
        resendCodeFeedbackEl.className = 'admin-feedback success'
        emailInput.value = ''
      } else {
        const result = await response.json()
        throw new Error(result.error || 'Could not find that user.')
      }
    } catch (err) {
      resendCodeFeedbackEl.textContent = `Error: ${err.message}`
      resendCodeFeedbackEl.className = 'admin-feedback error'
    } finally {
      resendCodeFeedbackEl.style.display = 'block'
      resendCodeSubmitBtn.disabled = false
      resendCodeSubmitBtn.textContent = 'Send Email'
    }
  }

  async function handleViewDonors() {
    adminDropdown.classList.add('hidden')
    viewDonorsFeedbackEl.style.display = 'none'
    donorListContainer.innerHTML = '<p>Loading donors...</p>'
    openModal(viewDonorsModal)

    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/dev-list-donors', {
        headers: {
          auth: 'snippy-coder-47'
        }
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: 'Failed to parse error response.'
        }))
        throw new Error(errData.error || `HTTP error! status: ${response.status}`)
      }
      allDonors = await response.json()
      filterAndRenderDonors()
    } catch (err) {
      donorListContainer.innerHTML = ''
      viewDonorsFeedbackEl.textContent = `Error: ${err.message}`
      viewDonorsFeedbackEl.className = 'admin-feedback error'
      viewDonorsFeedbackEl.style.display = 'block'
    }
  }

  function filterAndRenderDonors() {
    const searchTerm = donorSearchInput.value.toLowerCase()
    const adminStatus = donorAdminFilter.value

    let filteredDonors = [...allDonors]

    if (adminStatus === 'admin') {
      filteredDonors = filteredDonors.filter((donor) => donor.isAdmin)
    } else if (adminStatus === 'donor') {
      filteredDonors = filteredDonors.filter((donor) => !donor.isAdmin)
    }

    if (searchTerm) {
      filteredDonors = filteredDonors.filter((donor) => {
        const name = donor.name || ''
        const email = donor.email || ''
        const code = donor.code || ''
        return (
          name.toLowerCase().includes(searchTerm) ||
          email.toLowerCase().includes(searchTerm) ||
          code.toLowerCase().includes(searchTerm)
        )
      })
    }

    renderDonorList(filteredDonors)
  }

  function renderDonorList(donors) {
    donorListContainer.innerHTML = ''
    viewDonorsFeedbackEl.style.display = 'none'

    if (!donors || donors.length === 0) {
      donorListContainer.innerHTML = '<p style="padding: 20px; text-align: center;">No donors found matching the criteria.</p>'
      return
    }

    const table = document.createElement('table')
    table.id = 'donor-list-table'

    const thead = document.createElement('thead')
    thead.innerHTML = `
            <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Code</th>
                <th>Admin?</th>
                <th>Actions</th>
            </tr>
        `
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    donors.forEach((donor) => {
      const tr = document.createElement('tr')
      const isAdminClass = donor.isAdmin ? 'admin-status-yes' : ''
      const promoteButton = donor.isAdmin ?
        '' :
        `<button class="action-btn promote-btn" data-email="${donor.email}" data-name="${donor.name}">Promote</button>`

      const deleteButton = `<button class="action-btn delete-btn danger" data-email="${donor.email}" data-name="${donor.name}" style="margin-left: 5px;">Delete</button>`

      tr.innerHTML = `
                <td>${donor.name || ''}</td>
                <td>${donor.email || ''}</td>
                <td>${donor.code || ''}</td>
                <td class="${isAdminClass}">${donor.isAdmin ? 'Yes' : 'No'}</td>
                <td>${promoteButton}${deleteButton}</td>
            `
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)

    donorListContainer.appendChild(table)
  }

  function handlePromoteClick(event) {
    const button = event.target
    const userName = button.dataset.name
    const userEmail = button.dataset.email

    confirmationTitle.textContent = 'Promote User?'
    confirmationMessage.innerHTML = `Are you sure you want to promote <strong>${userName}</strong> to an Admin?`

    const confirmBtn = confirmationModal.querySelector('#confirmation-confirm-btn')
    const newConfirmBtn = confirmBtn.cloneNode(true)
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn)

    newConfirmBtn.addEventListener('click', () => {
      promoteUser(userEmail, userName)
    }, {
      once: true
    })

    openModal(confirmationModal)
  }

  async function promoteUser(email, name) {
    closeModal(confirmationModal)
    viewDonorsFeedbackEl.style.display = 'none'

    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/manual-add-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          email,
          isAdmin: true,
          auth: 'snippy-coder-47'
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: 'An unknown error occurred.'
        }))
        throw new Error(errData.error)
      }

      viewDonorsFeedbackEl.textContent = `✅ Success! ${name} has been promoted to Admin.`
      viewDonorsFeedbackEl.className = 'admin-feedback success'
      viewDonorsFeedbackEl.style.display = 'block'

      await handleViewDonors()
    } catch (err) {
      viewDonorsFeedbackEl.textContent = `Error: ${err.message}`
      viewDonorsFeedbackEl.className = 'admin-feedback error'
      viewDonorsFeedbackEl.style.display = 'block'
    }
  }

  function handleDeleteClick(event) {
    const button = event.target
    const userName = button.dataset.name
    const userEmail = button.dataset.email

    confirmationTitle.textContent = 'Delete User?'
    confirmationMessage.innerHTML = `Are you sure you want to permanently delete <strong>${userName}</strong>? This action cannot be undone.`

    const confirmBtn = confirmationModal.querySelector('#confirmation-confirm-btn')
    const newConfirmBtn = confirmBtn.cloneNode(true)
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn)

    newConfirmBtn.addEventListener('click', () => {
      deleteUser(userEmail, userName)
    }, {
      once: true
    })

    openModal(confirmationModal)
  }

  async function deleteUser(email, name) {
    closeModal(confirmationModal)
    viewDonorsFeedbackEl.style.display = 'none'

    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/delete-donor', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          auth: 'snippy-coder-47'
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: 'An unknown error occurred.'
        }))
        throw new Error(errData.error)
      }

      viewDonorsFeedbackEl.textContent = `✅ Success! ${name} has been deleted.`
      viewDonorsFeedbackEl.className = 'admin-feedback success'
      viewDonorsFeedbackEl.style.display = 'block'

      await handleViewDonors()
    } catch (err) {
      viewDonorsFeedbackEl.textContent = `Error: ${err.message}`
      viewDonorsFeedbackEl.className = 'admin-feedback error'
      viewDonorsFeedbackEl.style.display = 'block'
    }
  }

  // --- Insult Management Functions ---
  async function handleManageInsultsClick() {
    adminDropdown.classList.add('hidden')
    addInsultFeedbackEl.style.display = 'none'
    insultViewFeedbackEl.style.display = 'none'
    newInsultText.value = ''
    openModal(insultManagementModal)
    insultStatusFilter.value = 'pending'
    await fetchAndRenderInsults('pending')
  }

  async function fetchAndRenderInsults(status) {
    insultsByStatusContainer.innerHTML = '<p>Loading insults...</p>'
    insultViewFeedbackEl.style.display = 'none'
    try {
      const response = await fetch(`https://snippy-server-clean.onrender.com/api/admin-insults?status=${encodeURIComponent(status)}&auth=snippy-coder-47`)
      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: 'Failed to parse error response.'
        }))
        throw new Error(errData.error || `HTTP error! status: ${response.status}`)
      }
      const insults = await response.json()
      renderInsultsTable(insults)
    } catch (err) {
      insultsByStatusContainer.innerHTML = ''
      insultViewFeedbackEl.textContent = `Error loading insults: ${err.message}`
      insultViewFeedbackEl.className = 'admin-feedback error'
      insultViewFeedbackEl.style.display = 'block'
    }
  }

  function renderInsultsTable(insults) {
    insultsByStatusContainer.innerHTML = ''
    if (!insults || insults.length === 0) {
      insultsByStatusContainer.innerHTML = '<p style="padding: 20px; text-align: center;">No insults found with this status.</p>'
      return
    }

    const table = document.createElement('table')
    table.id = 'insults-table'

    const thead = document.createElement('thead')
    thead.innerHTML = `
            <tr>
                <th>Text</th>
                <th>Submitter</th>
                <th>Actions</th>
            </tr>
        `
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    const currentStatus = insultStatusFilter.value

    insults.forEach((insult) => {
      const tr = document.createElement('tr')
      let actionsHtml = `<button class="action-btn danger insult-delete-btn" data-id="${insult.id}" data-text="${insult.text.substring(0, 30)}...">Delete</button>`

      if (currentStatus === 'pending') {
        actionsHtml += `
                    <button class="action-btn approve insult-approve-btn" data-id="${insult.id}">Approve</button>
                    <button class="action-btn reject insult-reject-btn" data-id="${insult.id}">Reject</button>
                `
      }

      const insultTd = document.createElement('td');
      insultTd.className = 'insult-text-cell';
      const insultDiv = document.createElement('div');
      insultDiv.className = 'rich-insult';
      insultDiv.innerHTML = insult.text;
      insultTd.appendChild(insultDiv);

      const submitterTd = document.createElement('td');
      submitterTd.innerHTML = `${insult.submittedByName || ''}<br><small>${insult.submittedByEmail || ''}</small>`;

      const actionsTd = document.createElement('td');
      actionsTd.className = 'insult-actions-cell';
      actionsTd.innerHTML = actionsHtml;

      tr.appendChild(insultTd);
      tr.appendChild(submitterTd);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr)
    })
    table.appendChild(tbody)
    insultsByStatusContainer.appendChild(table)
  }

  async function handleAddInsultSubmit() {
    const text = newInsultText.innerHTML.trim()
    if (!text) {
      addInsultFeedbackEl.textContent = 'Insult text cannot be empty.'
      addInsultFeedbackEl.className = 'admin-feedback error'
      addInsultFeedbackEl.style.display = 'block'
      return
    }

    addInsultSubmitBtn.disabled = true
    addInsultFeedbackEl.style.display = 'none'

    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/insert-insult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          auth: 'snippy-coder-47'
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: 'An unknown error occurred.'
        }))
        throw new Error(errData.error)
      }

      addInsultFeedbackEl.textContent = '✅ Success! Insult added and approved.'
      addInsultFeedbackEl.className = 'admin-feedback success'
      newInsultText.value = ''
      if (insultStatusFilter.value === 'approved') {
        await fetchAndRenderInsults('approved')
      }
    } catch (err) {
      addInsultFeedbackEl.textContent = `Error: ${err.message}`
      addInsultFeedbackEl.className = 'admin-feedback error'
    } finally {
      addInsultFeedbackEl.style.display = 'block'
      addInsultSubmitBtn.disabled = false
    }
  }

  function handleDeleteInsultClick(insultId, insultText) {
    confirmationTitle.textContent = 'Delete Insult?'
    confirmationMessage.innerHTML = `Are you sure you want to permanently delete this insult?<br><br><em>"${insultText}"</em>`

    const confirmBtn = confirmationModal.querySelector('#confirmation-confirm-btn')
    const newConfirmBtn = confirmBtn.cloneNode(true)
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn)

    newConfirmBtn.addEventListener('click', () => {
      deleteInsult(insultId)
    }, {
      once: true
    })

    openModal(confirmationModal)
  }

  async function deleteInsult(id) {
    closeModal(confirmationModal)
    insultViewFeedbackEl.style.display = 'none'

    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/delete-insult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id,
          auth: 'snippy-coder-47'
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: 'An unknown error occurred.'
        }))
        throw new Error(errData.error)
      }

      insultViewFeedbackEl.textContent = '✅ Success! Insult has been deleted.'
      insultViewFeedbackEl.className = 'admin-feedback success'
      insultViewFeedbackEl.style.display = 'block'

      await fetchAndRenderInsults(insultStatusFilter.value)
    } catch (err) {
      insultViewFeedbackEl.textContent = `Error: ${err.message}`
      insultViewFeedbackEl.className = 'admin-feedback error'
      insultViewFeedbackEl.style.display = 'block'
    }
  }

  async function handleApproveInsultClick(insultId) {
    try {
      const {
        snippyUnlock
      } = await chrome.storage.sync.get('snippyUnlock')
      if (!snippyUnlock || !snippyUnlock.email) throw new Error('Could not identify admin user.')

      const response = await fetch('https://snippy-server-clean.onrender.com/api/approve-insult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: insultId,
          approverEmail: snippyUnlock.email,
          auth: 'snippy-coder-47'
        })
      })
      if (!response.ok) throw new Error((await response.json()).error)

      insultViewFeedbackEl.textContent = '✅ Submission approved.'
      insultViewFeedbackEl.className = 'admin-feedback success'
      insultViewFeedbackEl.style.display = 'block'
      await fetchAndRenderInsults('pending')
    } catch (err) {
      insultViewFeedbackEl.textContent = `Error: ${err.message}`
      insultViewFeedbackEl.className = 'admin-feedback error'
      insultViewFeedbackEl.style.display = 'block'
    }
  }

  function handleRejectInsultClick(insultId) {
    activeRejectionId = insultId
    document.getElementById('rejection-reason-input').value = ''
    openModal(rejectionReasonModal)
  }

  async function handleRejectionReasonSubmit() {
    if (!activeRejectionId) return
    const reason = document.getElementById('rejection-reason-input').value.trim()

    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/reject-insult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: activeRejectionId,
          reason: reason || null,
          auth: 'snippy-coder-47'
        })
      })
      if (!response.ok) throw new Error((await response.json()).error)

      insultViewFeedbackEl.textContent = '✅ Submission rejected.'
      insultViewFeedbackEl.className = 'admin-feedback success'
      insultViewFeedbackEl.style.display = 'block'
      closeModal(rejectionReasonModal)
      await fetchAndRenderInsults('pending')
    } catch (err) {
      insultViewFeedbackEl.textContent = `Error: ${err.message}`
      insultViewFeedbackEl.className = 'admin-feedback error'
      insultViewFeedbackEl.style.display = 'block'
    } finally {
      activeRejectionId = null
    }
  }

  // --- Donor Functions ---
  function handleDonorSubmitInsultClick() {
    donorDropdown.classList.add('hidden')
    submitInsultFeedbackEl.style.display = 'none'
    document.getElementById('donor-insult-text').value = ''
    openModal(submitInsultModal)
  }

  async function handleDonorInsultSubmit() {
    const text = document.getElementById('donor-insult-text').innerHTML.trim()
    const submittedByName = document.getElementById('donor-submitted-name').value.trim() || 'Anonymous'
    const showName = document.getElementById('donor-show-name').checked

    if (!text) {
      submitInsultFeedbackEl.textContent = 'Come on, you can think of something better than nothing.'
      submitInsultFeedbackEl.className = 'admin-feedback error'
      submitInsultFeedbackEl.style.display = 'block'
      return
    }

    submitInsultFeedbackEl.style.display = 'none'
    donorInsultSubmitBtn.disabled = true
    donorInsultSubmitBtn.textContent = 'Submitting...'

    try {
      const {
        snippyUnlock
      } = await chrome.storage.sync.get('snippyUnlock')
      if (!snippyUnlock || !snippyUnlock.email) {
        throw new Error('Could not identify current user. Please re-verify your code.')
      }

      const response = await fetch('https://snippy-server-clean.onrender.com/api/submit-insult', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          submittedByName,
          submittedByEmail: snippyUnlock.email,
          showName
        })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'An unknown server error occurred.')

      let successMessage = '✅ Success! Your comment has been submitted for review.'
      if (result.status === 'duplicate') {
        successMessage = '🤔 That comment was already submitted, but thanks for thinking alike!'
      }
      submitInsultFeedbackEl.textContent = successMessage
      submitInsultFeedbackEl.className = 'admin-feedback success'
      document.getElementById('donor-insult-text').value = ''
    } catch (err) {
      submitInsultFeedbackEl.textContent = `Error: ${err.message}`
      submitInsultFeedbackEl.className = 'admin-feedback error'
    } finally {
      submitInsultFeedbackEl.style.display = 'block'
      donorInsultSubmitBtn.disabled = false
      donorInsultSubmitBtn.textContent = 'Submit for Review'
    }
  }

  async function handleViewSubmissionsClick() {
    donorDropdown.classList.add('hidden')
    mySubmissionsContainer.innerHTML = '<p>Loading your submissions...</p>'
    mySubmissionsFeedbackEl.style.display = 'none'
    openModal(mySubmissionsModal)

    try {

      const {
        snippyUnlock
      } = await chrome.storage.sync.get('snippyUnlock')

      if (!snippyUnlock || !snippyUnlock.email || !snippyUnlock.code) {
        console.warn('🔍 No unlock found — treating as freeloader.')
        showFreeloaderInsult();
        return;
      }


      const response = await fetch(`https://snippy-server-clean.onrender.com/api/my-insults?email=${encodeURIComponent(snippyUnlock.email)}`)
      if (!response.ok) {
        const errData = await response.json().catch(() => ({
          error: 'Failed to parse error response.'
        }))
        throw new Error(errData.error || `HTTP error! status: ${response.status}`)
      }
      const submissions = await response.json()
      renderMySubmissions(submissions)
    } catch (err) {
      mySubmissionsContainer.innerHTML = ''
      mySubmissionsFeedbackEl.textContent = `Error: ${err.message}`
      mySubmissionsFeedbackEl.className = 'admin-feedback error'
      mySubmissionsFeedbackEl.style.display = 'block'
    }
  }

  function renderMySubmissions(submissions) {
    mySubmissionsContainer.innerHTML = ''
    if (!submissions || submissions.length === 0) {
      mySubmissionsContainer.innerHTML = '<p style="text-align: center; padding: 20px;">You haven\'t submitted any comments yet. Get to it!</p>'
      return
    }

    const table = document.createElement('table')
    table.id = 'my-submissions-table'

    table.innerHTML = `
        <thead>
            <tr>
                <th>Your Freeloader Comment</th>
                <th>Status</th>
                <th>Clicks</th>
                <th>Reason (if rejected)</th>
            </tr>
        </thead>
    `
    const tbody = document.createElement('tbody')
    submissions.forEach((sub) => {
      const tr = document.createElement('tr')
      const statusClass = `status-${sub.status.toLowerCase().replace(/\s/g, '-')}`

      const insultTd = document.createElement('td');
      const insultDiv = document.createElement('div');
      insultDiv.className = 'rich-insult';
      insultDiv.innerHTML = sub.text;
      insultTd.appendChild(insultDiv);

      const statusTd = document.createElement('td');
      statusTd.innerHTML = `<strong class="${statusClass}">${sub.status}</strong>`;

      const clicksTd = document.createElement('td');
      clicksTd.textContent = sub.clickCount || 0;

      const reasonTd = document.createElement('td');
      reasonTd.textContent = sub.rejectionReason || 'N/A';

      tr.appendChild(insultTd);
      tr.appendChild(statusTd);
      tr.appendChild(clicksTd);
      tr.appendChild(reasonTd);

      tbody.appendChild(tr)
    })
    table.appendChild(tbody)
    mySubmissionsContainer.appendChild(table)
  }



  async function handleSave() {
    if (!cmEditor) return;

    saveBtn.disabled = true;
    const isFormula = !!pageMetadata && (pageMetadata.type === 'formula' || pageMetadata.type === 'keyprops');

    if (isFormula) {
      saveBtn.textContent = 'Validating...';
      await new Promise(resolve => setTimeout(resolve, 100));
      const errorMarkers = cmEditor.getWrapperElement().querySelector('.lint-marker-error, .lint-marker-warning');
      if (errorMarkers) {        
  showErrorModal('Do you not <em>see</em> the little error icon? Why would I let you save that?<br><br>Please fix the errors before saving.');
  saveBtn.disabled = false;
  saveBtn.textContent = 'Save & Close';
  return;
}
    }

    saveBtn.textContent = 'Saving...';
    const result = await chrome.storage.local.get('nativeContentWasChanged');
    if (result.nativeContentWasChanged) {
      if (!confirm('Heads up! The code in the Quickbase tab was changed after you opened this editor.\n\nSaving now will overwrite those changes.\n\nAre you sure you want to proceed?')) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Close';
        return;
      }
    }


    chrome.runtime.sendMessage({
      action: 'finalSave',
      code: cmEditor.getValue(),
      metadata: pageMetadata
    });
  }

  function handleBeautify() {
    if (!cmEditor) return
    if (isRevertActive) {
      cmEditor.setValue(originalCodeSnapshot)
      isRevertActive = false
      originalCodeSnapshot = null
      const btn = document.getElementById('beautify-toolbar-btn');
      if (btn) btn.innerHTML = isRevertActive ? '↩️ Revert' : '✨ Beautify';

      return
    }
    const currentCode = cmEditor.getValue()
    originalCodeSnapshot = currentCode
    let beautifiedCode = currentCode
    const editorMode = cmEditor.getOption('mode')

    const isFormulaMode = (editorMode && editorMode.name === 'qb-formula') || editorMode === 'qb-formula'

    if (isFormulaMode && typeof beautifyFormula === 'function') {
      const functionNames = allFunctions.map((f) => f.name)
      beautifiedCode = beautifyFormula(currentCode, functionNames)
    } else if (typeof jsBeautify !== 'undefined') {
      if (editorMode === 'htmlmixed') {
        beautifiedCode = jsBeautify.html_beautify(currentCode, {
          indent_size: 2,
          wrap_line_length: 120
        })
      } else if (editorMode === 'javascript') {
        beautifiedCode = jsBeautify.js_beautify(currentCode, {
          indent_size: 2
        })
      } else if (editorMode === 'css') {
        beautifiedCode = jsBeautify.css_beautify(currentCode, {
          indent_size: 2
        })
      }
    }

    if (currentCode !== beautifiedCode) {
      cmEditor.setValue(beautifiedCode)
      isRevertActive = true
      const btn = document.getElementById('beautify-toolbar-btn');
      if (btn) btn.innerHTML = isRevertActive ? '↩️ Revert' : '✨ Beautify';

      const revertHandler = () => {
        isRevertActive = false
        originalCodeSnapshot = null
        const btn = document.getElementById('beautify-toolbar-btn');
        if (btn) btn.innerHTML = '✨ Beautify';

        cmEditor.off('change', revertHandler)
      }
      cmEditor.on('change', revertHandler)
    }
  }


  async function handleGDriveDisconnect() {
    try {
      console.log("Snippy: Disconnecting Google Drive...");
      const token = await new Promise(resolve => {
        chrome.identity.getAuthToken({
          interactive: false
        }, token => resolve(token || null));
      });

      if (token) {

        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);

        chrome.identity.removeCachedAuthToken({
          token
        }, () => {
          console.log('Snippy: Revoked and removed Google Drive token.');
          alert('Google Drive has been disconnected.');
          checkAuthStatusAndUpdateUI();
        });
      } else {
        alert('Google Drive is already disconnected.');
      }
    } catch (err) {
      console.error("Snippy: GDrive disconnect failed:", err);
      alert("Failed to disconnect Google Drive.");
    }
  }

  async function handleOneDriveDisconnect() {
    try {
      console.log("Snippy: Disconnecting OneDrive...");

      await chrome.storage.local.remove('oneDriveRefreshToken');

      chrome.runtime.sendMessage({
        action: 'clearOneDriveTokens'
      });

      alert('OneDrive has been disconnected.');
      checkAuthStatusAndUpdateUI();
    } catch (err) {
      console.error("Snippy: OneDrive disconnect failed:", err);
      alert("Failed to disconnect OneDrive.");
    }
  }

  function enableAdminPanel() {
    console.log('🛠️ Admin panel enabled.')
    if (adminPanelBtn) {
      adminPanelBtn.classList.remove('hidden')
    }
  }

  function enableDonorPanel() {
    console.log('❤️ Donor panel enabled.')
    if (donorPanelBtn) {
      donorPanelBtn.classList.remove('hidden')
    }
  }

  function disableGDriveFeatures(isEdgeLock = false) {
    const msg = isEdgeLock ?
      'Disabled by Edge. Microsoft hates happiness.' :
      'You can’t disable Google Drive and expect to use Google Drive.';

    [saveDriveBtn, loadRevisionsBtn].forEach((btn) => {
      if (btn) {
        btn.disabled = true
        btn.title = msg
        btn.style.opacity = '0.5'
        btn.style.cursor = 'not-allowed'
      }
    })

    if (revisionsSelector) {
      revisionsSelector.disabled = true
      revisionsSelector.title = msg
    }

    if (revisionsPlaceholder) {
      revisionsPlaceholder.title = msg
    }
  }

  async function handleManualRevisionSave() {
    if (!cmEditor) return;

    saveDriveBtn.disabled = true;
    saveDriveBtn.textContent = 'Saving...';

    try {
      const {
        default: RevisionStore
      } = await import(chrome.runtime.getURL('RevisionStore.js'));
      const currentCode = cmEditor.getValue();
	  const metaForSave = (pageMetadata?.type === 'keyprops')
  ? { ...pageMetadata, type: 'formula', fieldId: 'KeyProps' }
  : pageMetadata;

      showFreeloaderInsult();


      const result = await RevisionStore.addRevision(currentCode, metaForSave, "[Manual Save] ");


      if (result === 'NO_CHANGES') {
        saveDriveBtn.textContent = '🟰 No Changes';
      } else {
        saveDriveBtn.textContent = '✅ Saved!';
      }


    } catch (err) {
      console.error('Snippy Manual Save Error:', err);
      saveDriveBtn.textContent = '⚠️ Failed';

     
    }

    setTimeout(() => {
      saveDriveBtn.textContent = '💾 Manually Save';
      saveDriveBtn.disabled = false;
    }, 2500);
  }

  function enableGDriveFeatures() {
    [saveDriveBtn, loadRevisionsBtn].forEach((btn) => {
      if (btn) {
        btn.disabled = false
        btn.title = ''
        btn.style.opacity = '1'
        btn.style.cursor = ''
      }
    })

    if (revisionsSelector) {
      revisionsSelector.disabled = false
      revisionsSelector.title = ''
    }

    if (revisionsPlaceholder) {
      revisionsPlaceholder.title = ''
    }
  }


  async function handleLogout() {
    try {

      await chrome.storage.sync.remove(['snippyUnlock', 'readAnnouncementIds']);
      console.log('Snippy: Donor logged out. UI will refresh.');


      alert('You have been logged out of your Snippy donor account.');
      location.reload();
    } catch (err) {
      console.error('Snippy: Logout failed:', err);
      alert('Logout failed. Please try again.');
    }
  }


  function updateDisconnectButtons(status) {
    const gdriveBtn = document.getElementById('gdrive-disconnect-btn');
    const onedriveBtn = document.getElementById('onedrive-disconnect-btn');


    const gdriveContainer = gdriveBtn?.closest('.dropdown-item');
    const onedriveContainer = onedriveBtn?.closest('.dropdown-item');

    if (gdriveContainer) gdriveContainer.style.display = status.gdrive ? 'flex' : 'none';
    if (onedriveContainer) onedriveContainer.style.display = status.onedrive ? 'flex' : 'none';
  }

  function checkAuthStatusAndUpdateUI() {
    chrome.runtime.sendMessage({
      action: 'getAuthStatus'
    }, (status) => {
      if (chrome.runtime.lastError) {
        console.warn("Could not check auth status:", chrome.runtime.lastError.message);

        updateDisconnectButtons({
          gdrive: false,
          onedrive: false
        });
        return;
      }
      if (status) {
        updateDisconnectButtons(status);
      }
    });
  }


  function updateFontSize(amount) {
    if (!cmEditor) return;
    const wrapper = cmEditor.getWrapperElement();
    const currentSize = parseInt(window.getComputedStyle(wrapper).fontSize, 10);
    const newSize = currentSize + amount;


    wrapper.style.fontSize = `${newSize}px`;


    const gutters = wrapper.querySelector('.CodeMirror-gutters');
    if (gutters) {
      gutters.style.width = `${newSize + 24}px`;
    }


    const fontSizeDisplay = document.getElementById('font-size-display');
    if (fontSizeDisplay) {
      fontSizeDisplay.textContent = `Font Size: ${newSize}px`;
    }


    const newIconSize = Math.max(8, Math.round(newSize * 0.9));
    const markers = document.querySelectorAll('.lint-marker-error, .lint-marker-warning');
    markers.forEach(marker => {
      marker.style.width = `${newIconSize}px`;
      marker.style.height = `${newIconSize}px`;
    });


    chrome.storage.sync.set({
      snippyFontSize: `${newSize}px`
    });
    document.documentElement.style.setProperty('--snippy-hint-font-size', `${newSize}px`);
    console.log('[Snippy Debug] 🧠 Updated CSS var to match new font size:', `${newSize}px`);

    cmEditor.refresh();
  }



  function updateThemeSelectorVisibility(mode) {
    const lightContainer = document.getElementById('light-theme-container');
    const darkContainer = document.getElementById('dark-theme-container');
    const lightMessage = document.getElementById('light-theme-message');
    const darkMessage = document.getElementById('dark-theme-message');

    if (!lightContainer || !darkContainer || !lightMessage || !darkMessage) return;

    if (mode === 'dark') {

      lightContainer.classList.add('hidden');
      darkContainer.classList.remove('hidden');


      lightMessage.classList.remove('hidden');
      darkMessage.classList.add('hidden');
    } else {

      lightContainer.classList.remove('hidden');
      darkContainer.classList.add('hidden');


      lightMessage.classList.add('hidden');
      darkMessage.classList.remove('hidden');
    }
  }



  async function handleThemeChange(event) {
    const newMode = event.target.value;

    try {

      const data = await chrome.storage.sync.get([
        'snippyUnlock',
        'preferredLightTheme',
        'preferredDarkTheme'
      ]);

      const isDonor = data.snippyUnlock && data.snippyUnlock.email && data.snippyUnlock.code;
      let themeNameToApply;

      if (isDonor) {

        themeNameToApply = newMode === 'dark' ?
          data.preferredDarkTheme || 'quickbase-dark' :
          data.preferredLightTheme || 'quickbase-light';
      } else {

        themeNameToApply = newMode === 'dark' ? 'quickbase-dark' : 'quickbase-light';
      }


      if (cmEditor) {
        cmEditor.setOption('theme', themeNameToApply);
      }

      document.body.classList.toggle('dark', newMode === 'dark');
      updateThemeSelectorVisibility(newMode);


      await chrome.storage.sync.set({
        snippyTheme: newMode
      });

    } catch (error) {
      console.error("Failed to handle theme change:", error);

      document.body.classList.toggle('dark', newMode === 'dark');
      if (cmEditor) {
        cmEditor.setOption('theme', newMode === 'dark' ? 'quickbase-dark' : 'quickbase-light');
      }
    }
  }

  function handleGDriveSave() {
    if (!cmEditor) return
    saveDriveBtn.disabled = true
    saveDriveBtn.textContent = 'Saving...'
    chrome.runtime.sendMessage({
      action: 'gdriveSave',
      code: cmEditor.getValue(),
      metadata: pageMetadata
    }, (response) => {
      showFreeloaderInsult();
      saveDriveBtn.textContent = response.success ? '✅ Saved!' : '⚠️ Failed'
      setTimeout(() => {
        saveDriveBtn.textContent = '💾 Manually Save';
        saveDriveBtn.disabled = false
      }, 3000)
    })
  }


  async function handleLoadRevisions() {
    if (!cmEditor) return;

    loadRevisionsBtn.disabled = true;
    loadRevisionsBtn.textContent = 'Loading...';
    revisionsSelector.innerHTML = '';

    try {
      const {
        default: RevisionStore
      } = await import(chrome.runtime.getURL('RevisionStore.js'));
      const targetResult = await chrome.storage.sync.get('revisionSaveTarget');
      const target = targetResult.revisionSaveTarget || 'local';
      console.log("%cMANUAL LOAD METADATA:", "color: green; font-weight: bold;", pageMetadata);

      console.log(`[Snippy Debug] handleLoadRevisions: Requesting revisions for target: "${target}"`);
	  const normalizedMeta = (pageMetadata?.type === 'keyprops')
  ? { ...pageMetadata, type: 'formula', fieldId: 'KeyProps' }
  : pageMetadata;

      const revisions = await RevisionStore.getRevisions(normalizedMeta, target);

      console.log(`[Snippy Debug] handleLoadRevisions: Received ${revisions?.length ?? 'null'} revisions from RevisionStore.`);

      if (revisions && revisions.length > 0) {
        revisionsSelector.innerHTML = '<option value="">Select a version...</option>';
        revisions.forEach((rev) => {
          const option = document.createElement('option');
          option.value = rev.id;
          const ts = new Date(rev.timestamp).toLocaleString();


          let sourceName = 'Unknown';
          if (rev.source === 'gdrive') sourceName = 'GDrive';
          if (rev.source === 'onedrive') sourceName = 'OneDrive';
          if (rev.source === 'local') sourceName = 'Local';

          const label = rev.name || `${sourceName}: ${ts}`;
			option.textContent = label;

          revisionsSelector.appendChild(option);
        });

        revisionsPlaceholder.classList.add('hidden');
        revisionsSelector.classList.remove('hidden');
      } else {
        revisionsSelector.innerHTML = '<option>No revisions found</option>';
        revisionsPlaceholder.classList.add('hidden');
        revisionsSelector.classList.remove('hidden');
      }

    } catch (err) {
      console.error('Snippy: Failed to load revisions:', err);
      revisionsSelector.innerHTML = '<option>Error loading revisions</option>';
      revisionsSelector.classList.remove('hidden');
    }

    loadRevisionsBtn.textContent = '🔄 Load Revisions';
    showFreeloaderInsult();
    loadRevisionsBtn.disabled = false;
  }


  async function handleRestoreRevision() {
    if (!cmEditor) return;

    const revisionId = revisionsSelector.value;
    if (!revisionId) return;

    revisionsSelector.disabled = true;

    try {
      const {
        default: RevisionStore
      } = await import(chrome.runtime.getURL('RevisionStore.js'));
      const targetResult = await chrome.storage.sync.get('revisionSaveTarget');
      const target = targetResult.revisionSaveTarget || 'local';
	  
	  // Normalize KeyProps metadata the same way we do for loading lists
const normalizedMeta = (pageMetadata?.type === 'keyprops')
  ? { ...pageMetadata, type: 'formula', fieldId: 'KeyProps' }
  : pageMetadata;


      const code = await RevisionStore.getRevisionById(revisionId, normalizedMeta, target);


      if (code !== null) {
        cmEditor.setValue(code);
      } else {
        alert("Unable to load the selected revision.");
      }
    } catch (err) {
      console.error('Snippy: Failed to restore revision:', err);
      alert("Error restoring revision.");
    }

    revisionsSelector.disabled = false;
  }


  const debounce = (func, delay) => {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay)
    }
  }

  function htmlmixedValidator(cm, options) {
    if (!window.JSHINT) {
      return []
    }

    const text = cm.getValue()
    const allAnnotations = []

    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
    let match

    while ((match = scriptRegex.exec(text)) !== null) {
      const scriptContent = match[1]

      if (!scriptContent.trim()) {
        continue
      }

      const scriptStartIndex = match.index
      JSHINT(scriptContent, options, options.globals)
      const {
        errors
      } = JSHINT.data()

      if (errors) {
        const scriptStartLine = text.substring(0, scriptStartIndex).split('\n').length - 1

        errors.forEach((err) => {
          if (!err) {
            return
          }

          const errorLine = scriptStartLine + err.line - 1
          const startChar = err.character - 1
          const endChar = startChar + 1

          allAnnotations.push({
            message: err.reason,
            severity: err.code.startsWith('W') ? 'warning' : 'error',
            from: CodeMirror.Pos(errorLine, startChar),
            to: CodeMirror.Pos(errorLine, endChar)
          })
        })
      }
    }
    return allAnnotations
  }


  function updateDonorBadgeUI(isAdmin = false) {
    const donorPanelBtnContainer = document.getElementById('donor-panel-btn-container');
    const adminPanelBtnContainer = document.getElementById('admin-panel-btn-container');
    const donorOptions = document.getElementById('donor-options-container');
    const adminOptions = document.getElementById('admin-options-container');
    const alreadyDonated = document.getElementById('already-donated-container');

    if (donorPanelBtnContainer) donorPanelBtnContainer.style.display = 'block';
    if (donorOptions) donorOptions.classList.remove('hidden');

    if (isAdmin) {
      if (adminPanelBtnContainer) adminPanelBtnContainer.style.display = 'block';
      if (adminOptions) adminOptions.classList.remove('hidden');
    }

    if (alreadyDonated) alreadyDonated.style.display = 'none';
  }



  // --- Main Initialization Logic ---
  chrome.storage.local.get(['codeToEdit', 'pageMetadata', 'returnTabId'], async (result) => {
    if (result.codeToEdit === undefined) {
      editorContainer.textContent = 'Error: Could not load code. Please close this tab and try again.'
      console.error('[Snippy Debug] Could not find codeToEdit in local storage.')
      return
    }

    pageMetadata = result.pageMetadata || {}
	
	// If we're inside the overlay iframe, hide the breadcrumb entirely.
try {
  if (window.top !== window) {
    const bc = document.querySelector('.snippy-breadcrumb');
    if (bc) bc.style.display = 'none';
  }
} catch {}

	
	const contextEl = document.getElementById('snippy-context-label');

// Detect overlay (iframe) once
const IS_OVERLAY = (() => { try { return window.top !== window; } catch { return true; } })();

if (contextEl) {
  if (IS_OVERLAY) {
    // In overlay mode we hide the entire breadcrumb area.
    contextEl.style.display = 'none';
  } else if (pageMetadata?.type === 'code' && pageMetadata.name) {
    // Code Page (unchanged structure to keep styling)
    contextEl.innerHTML = `
      <nav class="snippy-breadcrumb">
        Editing Code Page <strong>${pageMetadata.name}</strong>
      </nav>
      <div class="snippy-pills">
        <span class="pill">Page ID: ${pageMetadata.pageId}</span>
      </div>
    `;
  } else if (pageMetadata?.type === 'formula') {
    // Field-level Formula editor — use classic breadcrumb + pills so theme/pills apply
    contextEl.innerHTML = `
      <nav class="snippy-breadcrumb">
        Editing Field: ${pageMetadata.label || ''}
      </nav>
      <div class="snippy-pills">
        <span class="pill">Type: ${pageMetadata.fieldType || 'Formula'}</span>
        <span class="pill">Table: ${pageMetadata.tableName || 'Unknown'}</span>
      </div>
    `;
  } else if (pageMetadata?.type === 'keyprops') {
    // NEW: KeyProps gets your wording, but same structure/classes for styling
    contextEl.innerHTML = `
      <nav class="snippy-breadcrumb">
        Editing Data Validation Rules
      </nav>
      <div class="snippy-pills">
        <span class="pill">Table: ${pageMetadata.tableName || 'Unknown'}</span>
      </div>
    `;
  } else {
    contextEl.textContent = 'Editing…';
  }
}


	
	
    console.log('[Snippy Debug] Metadata loaded. Enabling UI controls.');
    if (saveBtn) saveBtn.disabled = false;

    if (revisionTargetSelect) revisionTargetSelect.disabled = false;


    chrome.storage.sync.get('revisionSaveTarget', (res) => {
      const currentTarget = res.revisionSaveTarget || 'local';
      if (revisionTargetSelect) revisionTargetSelect.value = currentTarget;

      const shouldDisable = (currentTarget === 'none');
      if (saveDriveBtn) saveDriveBtn.disabled = shouldDisable;
      if (loadRevisionsBtn) loadRevisionsBtn.disabled = shouldDisable;
    });

    checkAuthStatusAndUpdateUI();
    const {
      returnTabId
    } = result
    console.log('[Snippy Debug] pageMetadata received from storage:', pageMetadata)
    const isFormula = (pageMetadata?.type === 'formula' || pageMetadata?.type === 'keyprops');

    console.log(`[Snippy Debug] Determined isFormula: ${isFormula}`)

    chrome.storage.sync.get(['showFreeloaderComments'], (settings) => {

      if (showCommentsToggle) {
        showCommentsToggle.checked = settings.showFreeloaderComments !== false
      }
    });

    setupMessageListener()

    if (!isFormula) {
      const fieldHelper = document.getElementById('field-helper')
      const showFuncsBtn = document.getElementById('show-functions-btn')
      if (fieldHelper) fieldHelper.style.display = 'none'
      if (showFuncsBtn) showFuncsBtn.style.display = 'none'
    }

    chrome.storage.sync.get(['snippyTheme', 'snippyFontSize'], async (settingsResult) => {
      const savedTheme = settingsResult.snippyTheme || 'light'
      const savedFontSize = settingsResult.snippyFontSize || '14px'

      let modeToSet
      if (isFormula) {
        modeToSet = 'qb-formula'
      } else {
        const name = (pageMetadata?.name || '').toLowerCase()
        if (name.endsWith('.js')) modeToSet = 'javascript'
        else if (name.endsWith('.css')) modeToSet = 'css'
        else modeToSet = 'htmlmixed'
      }
      console.log(`[Snippy Debug] Initializing CodeMirror with mode: "${modeToSet}"`)

      const storedDarkTheme = settingsResult.preferredDarkTheme || 'quickbase-dark';
      const storedLightTheme = settingsResult.preferredLightTheme || 'quickbase-light';
	  
	  
	  
	  
	  let activeTagMarkers = [];

function highlightTagMatch(cm, from1, to1, from2, to2) {
  clearTagMatchMarkers(cm);

  activeTagMarkers.push(
    cm.markText(from1, to1, { className: "CodeMirror-matchingtag" }),
    cm.markText(from2, to2, { className: "CodeMirror-matchingtag" })
  );

  const topLine = Math.min(from1.line, from2.line);
  const bottomLine = Math.max(to1.line, to2.line);

  for (let line = topLine; line <= bottomLine; line++) {
  const marker = document.createElement("div");
marker.className = "snippy-tag-marker";  // 🍌 Different from bracket

  marker.style.height = "24px";
  marker.style.width = "2px";
  marker.style.backgroundColor = "#50fa7b";
  marker.style.marginLeft = "1px";
  marker.style.borderRadius = "1px";
  marker.line = line;
  cm.setGutterMarker(line, "bracket-guides", marker);

  if (!cm._tagMarkers) cm._tagMarkers = []; // ✅ Moved INSIDE the loop
  cm._tagMarkers.push(marker);
}


// 💡 Refresh after the loop — once only
if (!cm._pendingRefresh) {
  cm._pendingRefresh = true;
  setTimeout(() => {
    cm._pendingRefresh = false;
    cm.refresh();
  }, 0);
}
// 🧽 Gutter Nudge: Prevents stale render bug
const ghost = document.createElement('div');
ghost.style.width = '0px';  // invisible
cm.setGutterMarker(0, "snippy-gutter-nudge", ghost);
setTimeout(() => cm.setGutterMarker(0, "snippy-gutter-nudge", null), 10);

}

function clearTagMatchMarkers(cm) {
  activeTagMarkers.forEach((m) => m.clear());
  activeTagMarkers = [];
  if (cm._tagMarkers) {
  cm._tagMarkers.forEach((m) => {
    if (m) cm.setGutterMarker(m.line, "bracket-guides", null);
  });
  cm._tagMarkers = [];
}

  
}

	  
	  
	  
	  function drawBracketGuide(cm) {
    // Clear existing markers
	console.log('🎯 drawBracketGuide running!');
    if (!cm._bracketMarkers) cm._bracketMarkers = [];
cm._bracketMarkers.forEach((m) => {
  if (m) cm.setGutterMarker(m.line, "bracket-guides", null);
});
cm._bracketMarkers = [];


    const cursor = cm.getCursor();
    const pos = { line: cursor.line, ch: cursor.ch };

    const match = cm.findMatchingBracket(pos);
	console.log('📌 Bracket match:', match);
    if (!match || !match.match || match.from.line === match.to.line) return;

    const topLine = Math.min(match.from.line, match.to.line);
    const bottomLine = Math.max(match.from.line, match.to.line);

   for (let line = topLine; line <= bottomLine; line++) {
  const marker = document.createElement("div");
marker.className = "snippy-bracket-marker";  // 🟢 Force DOM change from tag

  marker.style.height = "24px";
  marker.style.width = "2px";
  marker.style.backgroundColor = "#50fa7b";
  marker.style.marginLeft = "1px";
  marker.style.borderRadius = "1px"; 
  marker.line = line;
  cm.setGutterMarker(line, "bracket-guides", marker);
  cm._bracketMarkers.push(marker);
}

// 🧽 After the loop, refresh once
if (!cm._pendingRefresh) {
  cm._pendingRefresh = true;
  setTimeout(() => {
    cm._pendingRefresh = false;
    cm.refresh();
  }, 0);
}
// 🧽 Gutter Nudge: Prevents stale render bug
const ghost = document.createElement('div');
ghost.style.width = '0px';  // invisible
cm.setGutterMarker(0, "snippy-gutter-nudge", ghost);
setTimeout(() => cm.setGutterMarker(0, "snippy-gutter-nudge", null), 10);


}

function drawTagMatchGuide(cm) {
  const cursor = cm.getCursor();
  const token = cm.getTokenAt(cursor);
  const lineContent = cm.getLine(cursor.line);

  const tagRegex = /<\/?([a-zA-Z0-9\-]+)(\s[^<>]*)?>/g;
  let match;
  let clickedTag = null;

  while ((match = tagRegex.exec(lineContent)) !== null) {
    const tagStart = match.index;
    const tagEnd = tagStart + match[0].length;

    if (cursor.ch >= tagStart && cursor.ch <= tagEnd) {
      clickedTag = {
        name: match[1],
        isClosing: match[0].startsWith("</"),
        from: cm.indexFromPos({ line: cursor.line, ch: tagStart }),
        to: cm.indexFromPos({ line: cursor.line, ch: tagEnd })
      };
      break;
    }
  }

  if (!clickedTag) {
    clearTagMatchMarkers(cm);
    return;
  }

  const doc = cm.getValue();
  const tagPattern = new RegExp(`<\\/?${clickedTag.name}\\b[^>]*>`, "gi");
  const positions = [];
  let m;

  while ((m = tagPattern.exec(doc)) !== null) {
    const isClose = m[0].startsWith("</");
    const pos = m.index;
    positions.push({ isClose, pos, len: m[0].length });
  }

  const clickedIndex = positions.findIndex(
    (p) => p.pos === clickedTag.from
  );

  if (clickedIndex === -1) {
    clearTagMatchMarkers(cm);
    return;
  }

  const stack = [];
  let matchPos = null;

  if (!clickedTag.isClosing) {
    // Walk forward to find closing tag
    for (let i = clickedIndex + 1; i < positions.length; i++) {
      if (!positions[i].isClose) {
        stack.push("open");
      } else {
        if (stack.length === 0) {
          matchPos = positions[i];
          break;
        }
        stack.pop();
      }
    }
  } else {
    // Walk backward to find opening tag
    for (let i = clickedIndex - 1; i >= 0; i--) {
      if (positions[i].isClose) {
        stack.push("close");
      } else {
        if (stack.length === 0) {
          matchPos = positions[i];
          break;
        }
        stack.pop();
      }
    }
  }

  if (matchPos) {
    const from1 = cm.posFromIndex(clickedTag.from);
    const to1 = cm.posFromIndex(clickedTag.to);
    const from2 = cm.posFromIndex(matchPos.pos);
    const to2 = cm.posFromIndex(matchPos.pos + matchPos.len);
    highlightTagMatch(cm, from1, to1, from2, to2);
  } else {
    clearTagMatchMarkers(cm);
  }
}



      const cmOptions = {
        value: result.codeToEdit,
        lineNumbers: true,
        mode: modeToSet,


        theme: savedTheme === 'dark' ? storedDarkTheme : storedLightTheme,
        autofocus: !IS_OVERLAY,
        lineWrapping: true,
        matchBrackets: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-lint-markers", "bracket-guides", "snippy-gutter-nudge"],
        extraKeys: {
          'Ctrl-F': (cm) => {
            openSearch(cm)
          },
          'Cmd-F': (cm) => {
            openSearch(cm)
          },
          Esc: () => {
            if (searchBar.style.display !== 'none') {
              closeSearch()
            }
          }
        }
      }

      if (modeToSet === 'javascript' || modeToSet === 'htmlmixed') {
        const jshintOptions = {
          asi: true,
          esversion: 6,
          shadow: true,
          expr: true,
          eqnull: true,
          sub: true,
          evil: true,
          supernew: true
        }
        const validator = modeToSet === 'htmlmixed' ? htmlmixedValidator : CodeMirror.lint.javascript
        cmOptions.lint = {
          options: jshintOptions,
          getAnnotations: validator
        }
      }


      chrome.storage.sync.get(['preferredLightTheme', 'preferredDarkTheme'], (themePrefs) => {
        const storedDarkTheme = themePrefs.preferredDarkTheme || 'quickbase-dark';
        const storedLightTheme = themePrefs.preferredLightTheme || 'quickbase-light';

        cmOptions.theme = savedTheme === 'dark' ? storedDarkTheme : storedLightTheme;
        cmEditor = CodeMirror(editorContainer, cmOptions);
		// Keep the native Quickbase code textarea in sync (only matters in overlay on code pages)
if (!isFormula) { // code pages
  cmEditor.on('change', debounce((cm) => {
    const newValue = cm.getValue();
    chrome.runtime.sendMessage({
      action: 'updateOriginalTextarea',
      value: newValue
    });
  }, 150));
}

		setTimeout(() => cmEditor.refresh(), 50);
		for (let i = 0; i < 3; i++) {
 
}

		cmEditor.on("cursorActivity", () => {
  drawBracketGuide(cmEditor);
  drawTagMatchGuide(cmEditor);
});

		cmEditor.on("scroll", () => {
  drawBracketGuide(cmEditor);
  drawTagMatchGuide(cmEditor);
});





        if (isFormula) {
          const pairs = {
            '(': ')',
            '[': ']',
            '{': '}',
            '"': '"',
            "'": "'"
          };

          cmEditor.options.extraKeys['Backspace'] = (cm) => {
            if (cm.getSelection().length > 0) return CodeMirror.Pass;
            const cursor = cm.getCursor();
            const charBefore = cm.getRange(CodeMirror.Pos(cursor.line, cursor.ch - 1), cursor);
            const charAfter = cm.getRange(cursor, CodeMirror.Pos(cursor.line, cursor.ch + 1));
            if (pairs[charBefore] === charAfter) {
              cm.replaceRange('', CodeMirror.Pos(cursor.line, cursor.ch - 1), CodeMirror.Pos(cursor.line, cursor.ch + 1));
            } else {
              return CodeMirror.Pass;
            }
          };

          Object.keys(pairs).forEach(opener => {
            const closer = pairs[opener];
            cmEditor.options.extraKeys[`'${closer}'`] = (cm) => {
              if (cm.getSelection().length > 0) return CodeMirror.Pass;
              const cursor = cm.getCursor();
              const charAfter = cm.getRange(cursor, CodeMirror.Pos(cursor.line, cursor.ch + 1));
              if (charAfter === closer) {
                cm.moveH(1, 'char');
              } else {
                return CodeMirror.Pass;
              }
            };
          });

          cmEditor.on('beforeChange', (cm, change) => {
            if (change.origin !== '+input' || change.text.length > 1) return;
            const opener = change.text[0];
            const closer = pairs[opener];
            if (!closer) return;
            const token = cm.getTokenAt(change.from);
            if (token.type && (token.type.includes('string') || token.type.includes('comment'))) return;
            if (opener === "'") {
              const charBefore = cm.getRange(CodeMirror.Pos(change.from.line, change.from.ch - 1), change.from);
              if (charBefore.length > 0 && /\w/.test(charBefore)) return;
            }
            const selection = cm.getSelection();
            if (selection.length > 0) {
              cm.replaceSelection(opener + selection + closer);
              change.cancel();
            } else {
              const cursor = change.from;
              const charAfter = cm.getRange(cursor, CodeMirror.Pos(cursor.line, cursor.ch + 1));
              if (charAfter.length > 0 && /\S/.test(charAfter)) return;
              const newText = opener + closer;
              change.update(change.from, change.to, [newText]);
              setTimeout(() => cm.setCursor(CodeMirror.Pos(change.from.line, change.from.ch + 1)), 0);
            }
          });

          const variableTypes = ["var bool", "var number", "var text", "var textlist", "var date", "var datetime", "var duration", "var timeofday", "var workdate", "var user", "var recordlist"];

          const renderSuggestion = (elt, self, data) => {
            elt.innerHTML = `<span class="CodeMirror-hint-text">${data.displayText}</span><span class="CodeMirror-hint-details">${data.details}</span>`;
          };









 

const formulaHinter = (cm, options) => {
  const cursor = cm.getCursor();
  const token = cm.getTokenAt(cursor);
  const line = cm.getLine(cursor.line);

  const tokenString = token.string;
  const start = token.start;
  const end = cursor.ch;
  let searchTerm = tokenString.slice(0, end - start);
  let searchMode = 'ALL';
  let from = CodeMirror.Pos(cursor.line, start);
  let to = CodeMirror.Pos(cursor.line, end);

  
  const bracketMatch = tokenString.match(/^\[(.*?)$/);
  const completeBracketMatch = tokenString.match(/^\[(.*?)]$/); 

  if (completeBracketMatch) {
    
    searchTerm = completeBracketMatch[1];
    searchMode = 'FIELDS_ONLY';
    from = CodeMirror.Pos(cursor.line, token.start + 1);
    to = CodeMirror.Pos(cursor.line, token.end - 1);
  } else if (bracketMatch) {
   
    searchTerm = bracketMatch[1];
    searchMode = 'FIELDS_ONLY';
    from = CodeMirror.Pos(cursor.line, token.start + 1);
    to = CodeMirror.Pos(cursor.line, token.end);
  } else if (tokenString.startsWith('$')) {
    searchTerm = tokenString.slice(1);
    searchMode = 'VARS_ONLY';
    from = CodeMirror.Pos(cursor.line, start + 1);
  }

  let list = [];

  if (searchMode === 'ALL' || searchMode === 'FIELDS_ONLY') {
    const fieldMatches = allFields
      .filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(f => ({
        text: f.name,
        displayText: f.name,
        details: `Field - ${f.type || 'unknown'}`,
        render: renderSuggestion,
   hint: (cm, data, completion) => {
    const cursor = cm.getCursor();
    const currentToken = cm.getTokenAt(cursor);
   
    
    let hasOpenBracket = currentToken.string.startsWith('[');
    const hasCloseBracket = currentToken.string.endsWith(']');

    
    let effectiveFrom = CodeMirror.Pos(from.line, from.ch);

    
    if (!hasOpenBracket && from.ch > 0) {
        const prevChar = cm.getRange(CodeMirror.Pos(from.line, from.ch - 1), from);
        if (prevChar === '[') {
           
            hasOpenBracket = true;
           
            effectiveFrom = CodeMirror.Pos(from.line, from.ch - 1);
        }
    }

  

    if (hasOpenBracket && hasCloseBracket) {
        
        const lengthDiff = completion.text.length - (to.ch - from.ch);
        const finalCursorPos = CodeMirror.Pos(cursor.line, currentToken.end + lengthDiff);
        
        cm.replaceRange(completion.text, from, to);
        cm.setCursor(finalCursorPos);

    } else if (hasOpenBracket && !hasCloseBracket) {
        
        const textToInsert = '[' + completion.text + ']';
        cm.replaceRange(textToInsert, effectiveFrom, to);
        cm.setCursor(cm.getCursor('to')); 

    } else {
       
        const textToInsert = '[' + completion.text + ']';
        cm.replaceRange(textToInsert, from, to);
        cm.setCursor(cm.getCursor('to'));
    }
}
      }));
    list.push(...fieldMatches);
  }

  if (searchMode === 'ALL' || searchMode === 'VARS_ONLY') {
    const varRegex = /\bvar\s+(\w+)\s+([a-zA-Z_]\w*)/g;
    const editorContent = cm.getValue();
    let match;
    const varUpperLimit = cm.indexFromPos(cursor);
    const declaredVars = [];
    while ((match = varRegex.exec(editorContent)) !== null) {
      if (match.index < varUpperLimit) {
        declaredVars.push({
          type: match[1],
          name: match[2]
        });
      }
    }

    const varMatches = declaredVars
      .filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(v => ({
        text: v.name,
        displayText: v.name,
        details: `Variable - ${v.type}`,
        render: renderSuggestion,
        hint: (cm, data, completion) => {
          const beforeCursor = cm.getRange(CodeMirror.Pos(cursor.line, from.ch - 1), from);
          const alreadyHasDollar = beforeCursor === '$';
          const finalText = alreadyHasDollar ? completion.text : '$' + completion.text;
          cm.replaceRange(finalText, from, to);
        }
      }));

    list.push(...varMatches);
  }

  if (searchMode === 'ALL') {
    const funcMatches = allFunctions
      .filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(f => ({
        text: `${f.name}()`,
        displayText: f.name,
        details: `Function`,
        render: renderSuggestion,
        hint: (cm, data, completion) => {
          cm.replaceRange(completion.text, from, to);
          const cur = cm.getCursor();
          cm.setCursor(cur.line, cur.ch - 1);
        }
      }));

    list.push(...funcMatches);
  }

  if (list.length === 0) return null;

  return {
    list,
    from,
    to
  };
};

          const showFormulaHint = (cm) => {
            cm.showHint({
              hint: formulaHinter,
              completeSingle: false,
              customKeys: {
                Home: (hintCm, handle) => {
                  handle.close();
                  hintCm.execCommand('goLineStart');
                },
                End: (hintCm, handle) => {
                  handle.close();
                  hintCm.execCommand('goLineEnd');
                }
              }
            });
          };










          cmEditor.on('change', debounce((cm, change) => {
            if (cm.state.completionActive) return;
            if (change.origin !== '+input' || change.text.join("").trim() === "") return;
            const cursor = cm.getCursor();
            const lineContent = cm.getLine(cursor.line).slice(0, cursor.ch);
            if (lineContent.trim() === "") return;
            const token = cm.getTokenAt(cursor);
            if (!token.string.trim() || token.type === 'string' || token.type === 'comment' || token.type === 'operator') return;
            showFormulaHint(cm);
          }, 250));

          cmEditor.on('inputRead', (cm, change) => {
            const typed = change.text[0];
            if (!typed || cm.state.completionActive) return;

            if (typed === '[' || typed === '$') {
              setTimeout(() => {
                showFormulaHint(cm);

                chrome.storage.sync.get('snippyFontSize', (res) => {
                  const fontSize = res.snippyFontSize || '18px';
                  document.documentElement.style.setProperty('--snippy-hint-font-size', fontSize);
                  console.log('[Snippy Debug] ✅ Set --snippy-hint-font-size to:', fontSize);
                });
              }, 50);
            }
          });

          


          cmEditor.on('hintsShown', () => {
            chrome.storage.sync.get('snippyFontSize', (res) => {
              const fontSize = res.snippyFontSize || '18px';
              document.documentElement.style.setProperty('--snippy-hint-font-size', fontSize);
              console.log('[Snippy Debug] ✅ Set --snippy-hint-font-size in hintsShown to:', fontSize);
            });

            const widget = cmEditor.state.completionActive.widget;
            if (widget && widget.selectedHint !== -1) {
              widget.changeActive(-1);
            }
          });




        }



        console.log('[Snippy Debug] CodeMirror instance created.');


        if (modeToSet === 'javascript' || modeToSet === 'htmlmixed') {
          setTimeout(() => {
            if (window.JSHINT && cmEditor) {
              cmEditor.performLint()
            }
          }, 50)
        }

        const wrapper = cmEditor.getWrapperElement()
        if (wrapper) wrapper.style.fontSize = savedFontSize
		cmEditor.refresh();
		
        document.documentElement.style.setProperty('--snippy-hint-font-size', savedFontSize);
        console.log('[Snippy Debug] 🪄 Applied CSS var for hint font size at startup:', savedFontSize);



        const initialFontSize = parseInt(savedFontSize, 10);
        const gutters = wrapper.querySelector('.CodeMirror-gutters');
        if (gutters) {
          gutters.style.width = `${initialFontSize + 24}px`;
        }
        const fontSizeDisplay = document.getElementById('font-size-display');
        if (fontSizeDisplay) {
          fontSizeDisplay.textContent = `Font Size: ${initialFontSize}px`;
        }

        if (themeSelector) themeSelector.value = savedTheme
        document.body.classList.toggle('dark', savedTheme === 'dark')

        updateThemeSelectorVisibility(savedTheme);
		cmEditor.refresh();

        setupEventListeners()
        setupRichTextButtons('new-insult-text', 'bold-btn', 'italic-btn', 'underline-btn');
        setupRichTextButtons('donor-insult-text', 'donor-bold-btn', 'donor-italic-btn', 'donor-underline-btn');
        enablePasteAsHTML('new-insult-text');
        enablePasteAsHTML('donor-insult-text');



        loadAndRenderThemeSelectors()

        if (isFormula) {
          chrome.runtime.sendMessage({
            action: 'requestValidation',
            code: cmEditor.getValue()
          });
          const triggerValidation = () => {
            if (!cmEditor) return
            chrome.runtime.sendMessage({
              action: 'requestValidation',
              code: cmEditor.getValue()
            })
          }
		  

          cmEditor.on('change', debounce(triggerValidation, 500))

          console.log('[Snippy Debug] Requesting fields and functions for formula page.')
          chrome.runtime.sendMessage({
            action: 'getFieldsFromPage'
          })
          chrome.runtime.sendMessage({
            action: 'getFunctionsFromPage'
          })
        }
// Code pages: mirror overlay edits into the native Quickbase <textarea>
if (!isFormula) {
  cmEditor.on('change', debounce(() => {
    const newValue = cmEditor.getValue();
    chrome.runtime.sendMessage({
      action: 'updateOriginalTextarea',
      value: newValue
    });
  }, 250));
}

        if (returnTabId) {
          heartbeatInterval = setInterval(() => {
            chrome.tabs.sendMessage(returnTabId, {
              action: 'ping'
            }, (response) => {
              if (chrome.runtime.lastError || !response || response.status !== 'pong') {
                console.error('Snippy Heartbeat Failed. Parent tab is likely closed.', chrome.runtime.lastError?.message || 'No response.')
                enterOrphanedState()
              }
            })
          }, 5000)
        } else {
          console.error('[Snippy Debug] Could not find returnTabId for heartbeat. Orphan check disabled.')
        }


        chrome.storage.sync.get('revisionSaveTarget', (targetData) => {
          const target = targetData.revisionSaveTarget || 'local';
          console.log(`[Snippy Debug] Performing initial backup check for revision target: "${target}"`);

          chrome.runtime.sendMessage({
  action: 'initialAutosave',
  code: result.codeToEdit,
  isInitial: true,
  metadata: pageMetadata
}, (response) => {
  const err = chrome.runtime.lastError;
  
  // This ONLY means the message failed to send (not the save logic itself)
  if (err) {
    console.warn("Snippy: Failed to reach background script:", err.message);
    alert("Snippy's background script is unresponsive. Try reloading the extension.");
    return;
  }

  // Optional: If you want to handle failure INSIDE the background script,
  // you'd need to explicitly send back { success: false } in the background response.
  if (response?.success === false) {
    if (target === 'onedrive') {
      chrome.runtime.sendMessage({ action: 'ensureOneDriveAuth' }, (authResp) => {
        if (authResp?.success) {
          chrome.runtime.sendMessage({
            action: 'initialAutosave',
            code: result.codeToEdit,
            isInitial: true,
            metadata: pageMetadata
          });
        } else {
          alert("Snippy couldn’t access OneDrive. Please re-authenticate or change your revision target.");
        }
      });
    } else if (target === 'gdrive') {
      alert("Snippy couldn't access Google Drive. Please re-authenticate or change your revision target.");
    }
  } else {
    console.log("✅ Initial save sent successfully.");
  }
});

        });

      })

      const unlock = await chrome.storage.sync.get('snippyUnlock')
      const user = unlock?.snippyUnlock

      if (user && user.email && user.code) {

        try {
          const res = await fetch(`https://snippy-server-clean.onrender.com/api/verify-code?email=${encodeURIComponent(user.email)}&code=${encodeURIComponent(user.code)}`)
          const verificationResult = await res.json()
          if (verificationResult.valid) {
            console.log('✅ Stored Snippy unlock is valid upon load.')
            updateDonorBadgeUI(verificationResult.isAdmin)
            enableDonorPanel()
            if (verificationResult.isAdmin) {
              enableAdminPanel()
            }

            showFreeloaderInsult();
          } else {
            console.warn('🚫 Stored Snippy unlock was invalid.')
            showFreeloaderInsult();




          }
        } catch (err) {
          console.error('Server error verifying stored unlock on load.', err)
        }
      } else {

        console.warn('🆓 No unlock found at all — roasting anyway.')
        showFreeloaderInsult();
      }

      const loggedInUserContainer = document.getElementById('logged-in-user-container');
      const loggedInUserLabel = document.getElementById('logged-in-user-label');
      const logoutBtn = document.getElementById('logout-btn');

      if (user && user.email) {
        if (loggedInUserContainer) {
          loggedInUserLabel.textContent = `🔐 Logged in as: ${user.email}`;
          loggedInUserContainer.classList.remove('hidden');
        }
      }


(async () => {
  try {
    const res = await fetch("https://snippy-server-clean.onrender.com/api/announcements");
    const list = await res.json();

    // Safe storage getter that works whether chrome.storage is Promise- or callback-style
    const safeGet = async (area, key) => {
      const api = chrome?.storage?.[area];
      if (!api || typeof api.get !== 'function') return {};
      // Promise form available?
      if (api.get.length === 1) {
        // callback-style: wrap
        return await new Promise((resolve) => api.get(key, (v) => resolve(v || {})));
      } else {
        // promise-style
        return (await api.get(key)) || {};
      }
    };

    const { readAnnouncementIds = [] } = await safeGet('sync', 'readAnnouncementIds');
    const seen = new Set(Array.isArray(readAnnouncementIds) ? readAnnouncementIds : []);
    const anyUnread = list.some(a => !seen.has(a.id));
    if (anyUnread && announcementIndicator) announcementIndicator.style.display = 'block';
  } catch (err) {
    console.warn('[Snippy Announcements] skipped:', err?.message || err);
  }
})();





    })
  })
  







  
});
