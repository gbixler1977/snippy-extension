document.addEventListener('DOMContentLoaded', () => {
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
  let activeRejectionId = null // To store the ID of the insult being rejected

  // --- Cache UI elements ---

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
          snippyUnlock: { email, code, isAdmin: !!result.isAdmin }
        })

        document.getElementById('unlock-modal').classList.add('hidden')
        errorEl.style.display = 'none'

        updateDonorBadgeUI(result.isAdmin)
        enableDonorPanel() // Enable for all valid users
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

  const saveBtn = document.getElementById('save-btn')
  const cancelBtn = document.getElementById('cancel-btn')
  const beautifyBtn = document.getElementById('beautify-btn')
  const fontIncreaseBtn = document.getElementById('font-increase-btn')
  const fontDecreaseBtn = document.getElementById('font-decrease-btn')
  const themeSelector = document.getElementById('theme-selector')

  const lightThemeSelect = document.getElementById('light-theme-select')
  const darkThemeSelect = document.getElementById('dark-theme-select')

  const saveDriveBtn = document.getElementById('save-drive-btn')
  const loadRevisionsBtn = document.getElementById('load-revisions-btn')
  const revisionsSelector = document.getElementById('revisions-selector')
  const revisionsPlaceholder = document.getElementById('revisions-placeholder')
  const gdriveToggle = document.getElementById('disable-gdrive-toggle')
  const gdriveContainer = document.getElementById('gdrive-toggle-container')
  const isEdge = navigator.userAgent.includes('Edg/')

  const fieldSearchInput = document.getElementById('field-search-input')
  const fieldListContainer = document.getElementById('field-list-container')
  const showFunctionsBtn = document.getElementById('show-functions-btn')

  const settingsBtn = document.getElementById('settings-btn')
  const settingsDropdown = document.getElementById('settings-dropdown')

  const modalOverlay = document.querySelector('.modal-overlay')

  const functionsModal = document.getElementById('functions-modal')
  const functionSearchInput = document.getElementById('function-search-input')
  const functionListContainer = document.getElementById('function-list-container')
  const functionInfoSignature = document.getElementById('function-info-signature')
  const functionInfoDescription = document.getElementById('function-info-description')
  const functionInfoExample = document.getElementById('function-info-example')
  const modalInsertBtn = document.getElementById('modal-insert-btn')

  // --- Admin Elements ---
  const adminPanelBtn = document.getElementById('admin-panel-btn')
  const adminDropdown = document.getElementById('admin-dropdown')
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
  const donorPanelBtn = document.getElementById('donor-panel-btn')
  const donorDropdown = document.getElementById('donor-dropdown')
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

  function enterOrphanedState () {
    console.warn('[Snippy Debug] Entering orphaned state. Parent tab disconnected.')
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Parent Tab Closed' }
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

  function setupMessageListener () {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('[Snippy Debug] Message received in editor:', request)
      const isFormula = pageMetadata && pageMetadata.type === 'formula'
      switch (request.action) {
        case 'displayValidationResult': handleDisplayValidationResult(request.data); break
        case 'displayFieldsList': if (isFormula) { allFields = request.data; renderFieldList(allFields) } break
        case 'displayFunctionsList':
          console.log(`[Snippy Debug] displayFunctionsList received. isFormula: ${isFormula}`)
          if (isFormula) {
            allFunctions = request.data
            if (cmEditor) {
              const functionNames = allFunctions.map((f) => f.name)
              cmEditor.setOption('mode', { name: 'qb-formula', keywords: functionNames })
              console.log('[Snippy Debug] Mode updated for formula with dynamic keywords.')
              renderFunctionList(allFunctions) // <-- this is the missing piece
            }
          }
          break

        case 'gdriveSaveFailed': alert(`Warning: Could not save to Google Drive.\n\nError: ${request.error}`); break
      }
    })
  }

  function handleDisplayValidationResult(payload) {
    if (!cmEditor) return;

    const annotations = payload.annotations || [];

    // Clear previous highlights
    if (currentErrorMarks.length > 0) {
      currentErrorMarks.forEach(mark => mark.clear());
      currentErrorMarks = [];
    }

    // Clear and add gutter icons
    cmEditor.clearGutter('CodeMirror-lint-markers');
    
    annotations.forEach((err) => {
      if (!err || typeof err.row !== 'number' || err.row < 0) return;
      
      // Add gutter icon
      // Add gutter icon
      const marker = document.createElement('div');
      marker.title = err.text;
      marker.className = `lint-marker-${err.type}`;

      // Calculate icon size based on the editor's current font size
      const editorFontSize = parseInt(window.getComputedStyle(cmEditor.getWrapperElement()).fontSize, 10);
      const iconSize = Math.max(8, Math.round(editorFontSize * 0.9)); // ~90% of font size, with a minimum of 8px

      marker.style.cssText = `width: ${iconSize}px; height: ${iconSize}px; margin-left: -5px; cursor: pointer; background-repeat: no-repeat; background-position: center center; background-size: 100%;`;

      marker.style.backgroundImage = err.type === 'warning'
        ? 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'%23ffc107\' viewBox=\'-2 -2 20 20\'%3e%3cpath d=\'M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5a.905.905 0 0 1 .9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z\'/%3e%3c/svg%3e")'
        : 'url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'%23dc3545\' viewBox=\'-2 -2 20 20\'%3e%3cpath d=\'M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zM5.337 4.019c.125-.219.38-.344.65-.344h4.026c.27 0 .525.125.65.344l3.333 5.925c.125.219.125.469 0 .688l-3.333 5.925c-.125-.219-.38-.344-.65-.344H5.987c-.27 0-.525-.125-.65-.344l-3.333-5.925c-.125-.219-.125-.469 0 .688l3.333-5.925z\'/%3e%3c/svg%3e")';
      cmEditor.setGutterMarker(err.row, 'CodeMirror-lint-markers', marker);
        
      try {
        // Ask CodeMirror what token is at the error position.
        // We use err.column + 1 to ensure we're "inside" the token we want.
        const token = cmEditor.getTokenAt({ line: err.row, ch: err.column + 1 });

        // If a valid token is found, highlight it from its start to its end.
        if (token && token.string.trim().length > 0) {
            const from = { line: err.row, ch: token.start };
            const to = { line: err.row, ch: token.end };
            
            const mark = cmEditor.markText(from, to, { className: 'cm-error-token' });
            currentErrorMarks.push(mark);
        }
      } catch (e) {
        // This might fail if the error is on a completely blank line, which is fine.
        console.warn("Snippy: Could not find a token to highlight for an error.", e);
      }
    });
  }

  function renderFieldList (fields) {
    fieldListContainer.innerHTML = ''
    fields.forEach((field) => {
      const item = document.createElement('div')
      item.className = 'field-item'
      item.dataset.value = field.value
      item.innerHTML = `<span class="field-name">${field.name}</span><span class="field-type">${field.type || ''}</span>`
      fieldListContainer.appendChild(item)
    })
  }

  function renderFunctionList (functions) {
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

  async function loadAndRenderThemeSelectors () {
    try {
      const response = await fetch(chrome.runtime.getURL('themes.json'))
      console.log('[Snippy Debug] Fetching themes.json from:', chrome.runtime.getURL('themes.json'))

      const themes = await response.json()
      console.log('[Snippy Debug] Loaded themes:', themes)

      const lightThemes = themes.filter((t) => !t.dark)
      const darkThemes = themes.filter((t) => t.dark)

      // Populate light theme dropdown
      lightThemes.forEach((theme) => {
        const option = document.createElement('option')
        option.value = theme.name
        option.textContent = theme.label
        lightThemeSelect.appendChild(option)
      })

      // Populate dark theme dropdown
      darkThemes.forEach((theme) => {
        const option = document.createElement('option')
        option.value = theme.name
        option.textContent = theme.label
        darkThemeSelect.appendChild(option)
      })

      // Get stored preferences or use defaults
      const { preferredLightTheme, preferredDarkTheme } = await chrome.storage.sync.get([
        'preferredLightTheme',
        'preferredDarkTheme'
      ])




      lightThemeSelect.value = preferredLightTheme || 'quickbase-light' // Default light theme
      darkThemeSelect.value = preferredDarkTheme || 'quickbase-dark' // Default dark theme
    } catch (error) {
      console.error('Failed to load or render themes.json:', error)
    }
  }

  function updateFunctionInfoPanel (func) {
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

  function openModal (modal) {
    if (!modal) return
    modalOverlay.classList.remove('hidden')
    modal.classList.remove('hidden')
  }

  function closeModal (modal) {
    if (!modal) return
    modalOverlay.classList.add('hidden')
    modal.classList.add('hidden')
  }

  function openSearch (cm) {
    searchBar.style.display = 'flex'
    const selection = cm.getSelection()
    if (selection) searchInput.value = selection
    searchInput.focus()
    searchInput.select()
    find(false)
  }

  function closeSearch () {
    searchBar.style.display = 'none'
    cmEditor.focus()
  }

  function find (reverse = false) {
    if (!cmEditor) return
    const query = searchInput.value
    if (!query) {
      searchStatus.textContent = ''
      const cursor = cmEditor.getCursor()
      cmEditor.setSelection(cursor, cursor)
      return
    }
    let cursor = cmEditor.getSearchCursor(query, reverse ? cmEditor.getCursor('from') : cmEditor.getCursor('to'), { caseFold: true })
    if (!cursor.find(reverse)) {
      const from = reverse ? CodeMirror.Pos(cmEditor.lastLine()) : CodeMirror.Pos(cmEditor.firstLine(), 0)
      cursor = cmEditor.getSearchCursor(query, from, { caseFold: true })
      if (!cursor.find(reverse)) {
        searchStatus.textContent = 'Not found'
        return
      }
    }
    cmEditor.setSelection(cursor.from(), cursor.to())
    cmEditor.scrollIntoView({ from: cursor.from(), to: cursor.to() }, 50)
    searchStatus.textContent = ''
  }

  function replace () {
    if (!cmEditor) return
    const query = searchInput.value
    const replacement = replaceInput.value
    const selection = cmEditor.getSelection()
    if (query && selection.toLowerCase() === query.toLowerCase()) {
      cmEditor.replaceSelection(replacement, 'end')
    }
    find(false)
  }

  function replaceAll () {
    if (!cmEditor) return
    const query = searchInput.value
    const replacement = replaceInput.value
    if (!query) return
    let count = 0
    cmEditor.operation(() => {
      const cursor = cmEditor.getSearchCursor(query, CodeMirror.Pos(cmEditor.firstLine(), 0), { caseFold: true })
      while (cursor.findNext()) {
        cursor.replace(replacement)
        count++
      }
    })
    searchStatus.textContent = `Replaced ${count} occurrences.`
  }

  function showAdminFeedback (message, isSuccess) {
    addUserFeedbackEl.textContent = message
    addUserFeedbackEl.className = `admin-feedback ${isSuccess ? 'success' : 'error'}`
    addUserFeedbackEl.style.display = 'block'
  }

  function hideAdminFeedback () {
    addUserFeedbackEl.style.display = 'none'
  }

 cmEditor.setOption('theme', darkThemeSelect.value)

  async function handleAddDonor () {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, isAdmin, auth: 'snippy-coder-47'
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

  async function handleResendCode () {
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

  async function handleViewDonors () {
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
        const errData = await response.json().catch(() => ({ error: 'Failed to parse error response.' }))
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

  function filterAndRenderDonors () {
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

  function renderDonorList (donors) {
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
      const promoteButton = donor.isAdmin
        ? ''
        : `<button class="action-btn promote-btn" data-email="${donor.email}" data-name="${donor.name}">Promote</button>`

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

  function handlePromoteClick (event) {
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
    }, { once: true })

    openModal(confirmationModal)
  }

  async function promoteUser (email, name) {
    closeModal(confirmationModal)
    viewDonorsFeedbackEl.style.display = 'none'

    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/manual-add-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          isAdmin: true,
          auth: 'snippy-coder-47'
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }))
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

  function handleDeleteClick (event) {
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
    }, { once: true })

    openModal(confirmationModal)
  }

  async function deleteUser (email, name) {
    closeModal(confirmationModal)
    viewDonorsFeedbackEl.style.display = 'none'

    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/delete-donor', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          auth: 'snippy-coder-47'
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }))
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
  async function handleManageInsultsClick () {
    adminDropdown.classList.add('hidden')
    addInsultFeedbackEl.style.display = 'none'
    insultViewFeedbackEl.style.display = 'none'
    newInsultText.value = ''
    openModal(insultManagementModal)
    insultStatusFilter.value = 'pending'
    await fetchAndRenderInsults('pending')
  }

  async function fetchAndRenderInsults (status) {
    insultsByStatusContainer.innerHTML = '<p>Loading insults...</p>'
    insultViewFeedbackEl.style.display = 'none'
    try {
      const response = await fetch(`https://snippy-server-clean.onrender.com/api/admin-insults?status=${encodeURIComponent(status)}&auth=snippy-coder-47`)
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Failed to parse error response.' }))
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

  function renderInsultsTable (insults) {
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

      tr.innerHTML = `
                <td class="insult-text-cell">"${insult.text}"</td>
                <td>${insult.submittedByName || ''}<br><small>${insult.submittedByEmail || ''}</small></td>
                <td class="insult-actions-cell">${actionsHtml}</td>
            `
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)
    insultsByStatusContainer.appendChild(table)
  }

  async function handleAddInsultSubmit () {
    const text = newInsultText.value.trim()
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          auth: 'snippy-coder-47'
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }))
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

  function handleDeleteInsultClick (insultId, insultText) {
    confirmationTitle.textContent = 'Delete Insult?'
    confirmationMessage.innerHTML = `Are you sure you want to permanently delete this insult?<br><br><em>"${insultText}"</em>`

    const confirmBtn = confirmationModal.querySelector('#confirmation-confirm-btn')
    const newConfirmBtn = confirmBtn.cloneNode(true)
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn)

    newConfirmBtn.addEventListener('click', () => {
      deleteInsult(insultId)
    }, { once: true })

    openModal(confirmationModal)
  }

  async function deleteInsult (id) {
    closeModal(confirmationModal)
    insultViewFeedbackEl.style.display = 'none'

    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/delete-insult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          auth: 'snippy-coder-47'
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }))
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

  async function handleApproveInsultClick (insultId) {
    try {
      const { snippyUnlock } = await chrome.storage.sync.get('snippyUnlock')
      if (!snippyUnlock || !snippyUnlock.email) throw new Error('Could not identify admin user.')

      const response = await fetch('https://snippy-server-clean.onrender.com/api/approve-insult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  function handleRejectInsultClick (insultId) {
    activeRejectionId = insultId
    document.getElementById('rejection-reason-input').value = ''
    openModal(rejectionReasonModal)
  }

  async function handleRejectionReasonSubmit () {
    if (!activeRejectionId) return
    const reason = document.getElementById('rejection-reason-input').value.trim()

    try {
      const response = await fetch('https://snippy-server-clean.onrender.com/api/reject-insult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  function handleDonorSubmitInsultClick () {
    donorDropdown.classList.add('hidden')
    submitInsultFeedbackEl.style.display = 'none'
    document.getElementById('donor-insult-text').value = ''
    openModal(submitInsultModal)
  }

  async function handleDonorInsultSubmit () {
    const text = document.getElementById('donor-insult-text').value.trim()
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
      const { snippyUnlock } = await chrome.storage.sync.get('snippyUnlock')
      if (!snippyUnlock || !snippyUnlock.email) {
        throw new Error('Could not identify current user. Please re-verify your code.')
      }

      const response = await fetch('https://snippy-server-clean.onrender.com/api/submit-insult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  async function handleViewSubmissionsClick () {
    donorDropdown.classList.add('hidden')
    mySubmissionsContainer.innerHTML = '<p>Loading your submissions...</p>'
    mySubmissionsFeedbackEl.style.display = 'none'
    openModal(mySubmissionsModal)

    try {
      const { snippyUnlock } = await chrome.storage.sync.get('snippyUnlock')
      if (!snippyUnlock || !snippyUnlock.email) {
        throw new Error('Could not identify current user.')
      }

      const response = await fetch(`https://snippy-server-clean.onrender.com/api/my-insults?email=${encodeURIComponent(snippyUnlock.email)}`)
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Failed to parse error response.' }))
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

  function renderMySubmissions (submissions) {
    mySubmissionsContainer.innerHTML = ''
    if (!submissions || submissions.length === 0) {
      mySubmissionsContainer.innerHTML = '<p style="text-align: center; padding: 20px;">You haven\'t submitted any comments yet. Get to it!</p>'
      return
    }

    const table = document.createElement('table')
    table.id = 'my-submissions-table'
    // Add "Clicks" to the table header
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
      // Add the clickCount data to the table row
      tr.innerHTML = `
            <td><em>"${sub.text}"</em></td>
            <td><strong class="${statusClass}">${sub.status}</strong></td>
            <td>${sub.clickCount || 0}</td>
            <td>${sub.rejectionReason || 'N/A'}</td>
        `
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)
    mySubmissionsContainer.appendChild(table)
  }

  async function handleSave () {
    if (!cmEditor) return;

    saveBtn.disabled = true; // Disable the button immediately
    const isFormula = pageMetadata && pageMetadata.type === 'formula';

    if (isFormula) {
      saveBtn.textContent = 'Validating...';

      // Give the live validator a moment to run after the user's last change
      await new Promise(resolve => setTimeout(resolve, 100)); 

      // NEW: Check for existing error markers directly in the editor's DOM
      const errorMarkers = cmEditor.getWrapperElement().querySelector('.lint-marker-error, .lint-marker-warning');

      if (errorMarkers) {
        alert('Do you not SEE the little error icon? Why would I let you save that?\n\nPlease fix the errors before saving.');
        saveBtn.disabled = false; // Re-enable the button
        saveBtn.textContent = 'Save & Close';
        return; // Stop the save process
      }
    }

    saveBtn.textContent = 'Saving...';
    chrome.storage.local.get('nativeContentWasChanged', (result) => {
      if (result.nativeContentWasChanged) {
        if (!confirm('Heads up! The code in the Quickbase tab was changed after you opened this editor.\n\nSaving now will overwrite those changes.\n\nAre you sure you want to proceed?')) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save & Close';
          return;
        }
      }
      chrome.storage.sync.get('gdriveDisabled', (syncData) => {
        const skipGDrive = isEdge || syncData.gdriveDisabled;
        chrome.runtime.sendMessage({
          action: 'editorSave',
          code: cmEditor.getValue(),
          skipGDrive
        });
      });
    });
  }

  function handleBeautify () {
    if (!cmEditor) return
    if (isRevertActive) {
      cmEditor.setValue(originalCodeSnapshot)
      isRevertActive = false
      originalCodeSnapshot = null
      beautifyBtn.innerHTML = '✨ Beautify'
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
        beautifiedCode = jsBeautify.html_beautify(currentCode, { indent_size: 2, wrap_line_length: 120 })
      } else if (editorMode === 'javascript') {
        beautifiedCode = jsBeautify.js_beautify(currentCode, { indent_size: 2 })
      } else if (editorMode === 'css') {
        beautifiedCode = jsBeautify.css_beautify(currentCode, { indent_size: 2 })
      }
    }

    if (currentCode !== beautifiedCode) {
      cmEditor.setValue(beautifiedCode)
      isRevertActive = true
      beautifyBtn.innerHTML = '↩️ Revert'

      const revertHandler = () => {
        isRevertActive = false
        originalCodeSnapshot = null
        beautifyBtn.innerHTML = '✨ Beautify'
        cmEditor.off('change', revertHandler)
      }
      cmEditor.on('change', revertHandler)
    }
  }

  function enableAdminPanel () {
    console.log('🛠️ Admin panel enabled.')
    if (adminPanelBtn) {
      adminPanelBtn.classList.remove('hidden')
    }
  }

  function enableDonorPanel () {
    console.log('❤️ Donor panel enabled.')
    if (donorPanelBtn) {
      donorPanelBtn.classList.remove('hidden')
    }
  }

  function disableGDriveFeatures (isEdgeLock = false) {
    const msg = isEdgeLock
      ? 'Disabled by Edge. Microsoft hates happiness.'
      : 'You can’t disable Google Drive and expect to use Google Drive.';

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

  function enableGDriveFeatures () {
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

  

function updateFontSize (amount) {
    if (!cmEditor) return;
    const wrapper = cmEditor.getWrapperElement();
    const currentSize = parseInt(window.getComputedStyle(wrapper).fontSize, 10);
    const newSize = currentSize + amount;
    
    // Set the new font size on the editor
    wrapper.style.fontSize = `${newSize}px`;

    // NEW: Calculate and set the new gutter width
    const gutters = wrapper.querySelector('.CodeMirror-gutters');
    if (gutters) {
      gutters.style.width = `${newSize + 24}px`;
    }

    // NEW: Update the font size display in the footer
    const fontSizeDisplay = document.getElementById('font-size-display');
    if (fontSizeDisplay) {
      fontSizeDisplay.textContent = `Font Size: ${newSize}px`;
    }
    
    // Update the icon sizes
    const newIconSize = Math.max(8, Math.round(newSize * 0.9));
    const markers = document.querySelectorAll('.lint-marker-error, .lint-marker-warning');
    markers.forEach(marker => {
        marker.style.width = `${newIconSize}px`;
        marker.style.height = `${newIconSize}px`;
    });

    // Save the new font size and refresh the editor
    chrome.storage.sync.set({ snippyFontSize: `${newSize}px` });
    cmEditor.refresh();
  }



function updateThemeSelectorVisibility(mode) {
    const lightContainer = document.getElementById('light-theme-container');
    const darkContainer = document.getElementById('dark-theme-container');
    const lightMessage = document.getElementById('light-theme-message');
    const darkMessage = document.getElementById('dark-theme-message');
    
    if (!lightContainer || !darkContainer || !lightMessage || !darkMessage) return;

    if (mode === 'dark') {
      // In Dark Mode: Show dark selector, hide light selector
      lightContainer.classList.add('hidden');
      darkContainer.classList.remove('hidden');

      // Show the message for the hidden light selector
      lightMessage.classList.remove('hidden');
      darkMessage.classList.add('hidden');
    } else {
      // In Light Mode: Show light selector, hide dark selector
      lightContainer.classList.remove('hidden');
      darkContainer.classList.add('hidden');

      // Show the message for the hidden dark selector
      lightMessage.classList.add('hidden');
      darkMessage.classList.remove('hidden');
    }
  }



 async function handleThemeChange (event) {
    const newMode = event.target.value; // This will be 'light' or 'dark'

    try {
      // Get user status and their preferred themes all at once
      const data = await chrome.storage.sync.get([
        'snippyUnlock', 
        'preferredLightTheme', 
        'preferredDarkTheme'
      ]);

      const isDonor = data.snippyUnlock && data.snippyUnlock.email && data.snippyUnlock.code;
      let themeNameToApply;

      if (isDonor) {
        // Donor: Use their saved preference or a default if not set
        themeNameToApply = newMode === 'dark'
          ? data.preferredDarkTheme || 'quickbase-dark'
          : data.preferredLightTheme || 'quickbase-light';
      } else {
        // Non-Donor: Always use the hardcoded defaults
        themeNameToApply = newMode === 'dark' ? 'quickbase-dark' : 'quickbase-light';
      }
      
      // --- Apply all changes ---
      if (cmEditor) {
        cmEditor.setOption('theme', themeNameToApply);
      }
      
      document.body.classList.toggle('dark', newMode === 'dark');
      updateThemeSelectorVisibility(newMode); // Update which donor dropdown is visible
      
      // Save the new mode ('light' or 'dark') to storage
      await chrome.storage.sync.set({ snippyTheme: newMode });

    } catch (error) {
        console.error("Failed to handle theme change:", error);
        // Fallback to defaults in case of error
        document.body.classList.toggle('dark', newMode === 'dark');
        if (cmEditor) {
            cmEditor.setOption('theme', newMode === 'dark' ? 'quickbase-dark' : 'quickbase-light');
        }
    }
  }

  function handleGDriveSave () {
    if (!cmEditor) return
    saveDriveBtn.disabled = true
    saveDriveBtn.textContent = 'Saving...'
    chrome.runtime.sendMessage({ action: 'gdriveSave', code: cmEditor.getValue(), metadata: pageMetadata }, (response) => {
      saveDriveBtn.textContent = response.success ? '✅ Saved!' : '⚠️ Failed'
      setTimeout(() => { saveDriveBtn.textContent = '💾 Save to Google Drive'; saveDriveBtn.disabled = false }, 3000)
    })
  }

  function handleGDriveLoadRevisions () {
    if (!cmEditor) return
    loadRevisionsBtn.disabled = true
    loadRevisionsBtn.textContent = 'Loading...'
    chrome.runtime.sendMessage({ action: 'gdriveLoadRevisions', metadata: pageMetadata }, (response) => {
      revisionsSelector.innerHTML = '<option value="">Select a version...</option>'
      if (response.success && response.files && response.files.length > 0) {
        response.files.forEach((file) => {
          const option = document.createElement('option')
          option.value = file.id
          option.textContent = file.name.split(' - ')[1]?.replace('.txt', '') || file.name
          revisionsSelector.appendChild(option)
        })
        revisionsPlaceholder.classList.add('hidden')
        revisionsSelector.classList.remove('hidden')
      } else {
        revisionsSelector.innerHTML = '<option>No versions found</option>'
        revisionsPlaceholder.classList.add('hidden')
        revisionsSelector.classList.remove('hidden')
      }
      loadRevisionsBtn.textContent = '🔄 Load Revisions'
      loadRevisionsBtn.disabled = false
    })
  }

  function handleGDriveRestoreRevision () {
    if (!cmEditor) return
    const fileId = revisionsSelector.value
    if (!fileId) return
    revisionsSelector.disabled = true
    chrome.runtime.sendMessage({ action: 'gdriveRestoreRevision', fileId }, (response) => {
      if (response.success) {
        cmEditor.setValue(response.code)
      }
      revisionsSelector.disabled = false
    })
  }

  const debounce = (func, delay) => { let timeout; return function (...args) { const context = this; clearTimeout(timeout); timeout = setTimeout(() => func.apply(context, args), delay) } }

  function htmlmixedValidator (cm, options) {
    if (!window.JSHINT) { return [] }

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
      const { errors } = JSHINT.data()

      if (errors) {
        const scriptStartLine = text.substring(0, scriptStartIndex).split('\n').length - 1

        errors.forEach((err) => {
          if (!err) { return }

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

  function updateDonorBadgeUI (isAdmin) {
    const badge = document.getElementById('donor-status-badge')
    const container = document.getElementById('donor-status-container')
    const donatedLink = document.getElementById('already-donated-container')

    if (badge && container && donatedLink) {
      badge.innerHTML = isAdmin ? '👑 <strong>Admin</strong>' : '❤️ <strong>Donor</strong>'
      container.style.display = 'flex'
      donatedLink.style.display = 'none'
    } else {
      console.error('[Snippy Debug] Could not find all UI elements to update donor badge.')
    }
  }

   // --- Main Initialization Logic ---
chrome.storage.local.get(['codeToEdit', 'pageMetadata', 'returnTabId'], async (result) => {
    if (result.codeToEdit === undefined) {
      editorContainer.textContent = 'Error: Could not load code. Please close this tab and try again.'
      console.error('[Snippy Debug] Could not find codeToEdit in local storage.')
      return
    }

    pageMetadata = result.pageMetadata || {}
    const { returnTabId } = result
    console.log('[Snippy Debug] pageMetadata received from storage:', pageMetadata)
    const isFormula = pageMetadata.type === 'formula'
    console.log(`[Snippy Debug] Determined isFormula: ${isFormula}`)

    chrome.storage.sync.get(['gdriveDisabled', 'showFreeloaderComments'], (settings) => {
      // GDrive Toggle
      const forceDisable = isEdge
      const shouldDisable = forceDisable || settings.gdriveDisabled
      if (gdriveToggle) {
        gdriveToggle.checked = shouldDisable
        if (forceDisable) {
          gdriveToggle.disabled = true
          gdriveToggle.title = 'Microsoft Edge does not support Google Drive OAuth. This setting is locked.'
          const msg = document.createElement('div')
          msg.style.cssText = 'font-size: 12px; color: #999; margin-top: 4px; margin-left: 2px;'
          msg.innerHTML = 'Google Drive is unavailable in Microsoft Edge.<br><a href="https://www.google.com/chrome/" target="_blank" style="color: #3b82f6; text-decoration: underline;">Download Chrome</a> for full features.'
                    gdriveContainer?.appendChild(msg)
        }
      }
      if (shouldDisable) {
        disableGDriveFeatures(forceDisable)
      }

      // Show Comments Toggle
      if (showCommentsToggle) {
        showCommentsToggle.checked = settings.showFreeloaderComments !== false // Default to true
      }
    })

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

      const cmOptions = {
        value: result.codeToEdit,
        lineNumbers: true,
        mode: modeToSet,
	

        theme: savedTheme === 'dark' ? storedDarkTheme : storedLightTheme,
        autofocus: true,
        lineWrapping: true,
        matchBrackets: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-lint-markers'],
        extraKeys: {
          'Ctrl-F': (cm) => { openSearch(cm) },
          'Cmd-F': (cm) => { openSearch(cm) },
          Esc: () => {
            if (searchBar.style.display !== 'none') {
              closeSearch()
            }
          }
        }
      }

      if (modeToSet === 'javascript' || modeToSet === 'htmlmixed') {
        const jshintOptions = {
          asi: true, esversion: 6, shadow: true, expr: true, eqnull: true, sub: true, evil: true, supernew: true
        }
        const validator = modeToSet === 'htmlmixed' ? htmlmixedValidator : CodeMirror.lint.javascript
        cmOptions.lint = { options: jshintOptions, getAnnotations: validator }
      }


chrome.storage.sync.get(['preferredLightTheme', 'preferredDarkTheme'], (themePrefs) => {
  const storedDarkTheme = themePrefs.preferredDarkTheme || 'quickbase-dark';
  const storedLightTheme = themePrefs.preferredLightTheme || 'quickbase-light';

  cmOptions.theme = savedTheme === 'dark' ? storedDarkTheme : storedLightTheme;
  cmEditor = CodeMirror(editorContainer, cmOptions);

  console.log('[Snippy Debug] CodeMirror instance created.');

      
      if (modeToSet === 'javascript' || modeToSet === 'htmlmixed') {
        setTimeout(() => { if (window.JSHINT && cmEditor) { cmEditor.performLint() } }, 50)
      }

      const wrapper = cmEditor.getWrapperElement()
      if (wrapper) wrapper.style.fontSize = savedFontSize

      // NEW: Set initial gutter width and display font size
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

      setupEventListeners()
	    loadAndRenderThemeSelectors()

      if (isFormula) {
chrome.runtime.sendMessage({ action: 'requestValidation', code: cmEditor.getValue() });
        const triggerValidation = () => {
          if (!cmEditor) return
          chrome.runtime.sendMessage({ action: 'requestValidation', code: cmEditor.getValue() })
        }
        cmEditor.on('change', debounce(triggerValidation, 500))

        console.log('[Snippy Debug] Requesting fields and functions for formula page.')
        chrome.runtime.sendMessage({ action: 'getFieldsFromPage' })
        chrome.runtime.sendMessage({ action: 'getFunctionsFromPage' })
      }

      if (returnTabId) {
        heartbeatInterval = setInterval(() => {
          chrome.tabs.sendMessage(returnTabId, { action: 'ping' }, (response) => {
            if (chrome.runtime.lastError || !response || response.status !== 'pong') {
              console.error('Snippy Heartbeat Failed. Parent tab is likely closed.', chrome.runtime.lastError?.message || 'No response.')
              enterOrphanedState()
            }
          })
        }, 5000)
      } else {
        console.error('[Snippy Debug] Could not find returnTabId for heartbeat. Orphan check disabled.')
      }

      if (!isEdge) {
        chrome.storage.sync.get('gdriveDisabled', (syncData) => {
          if (!syncData.gdriveDisabled) {
            console.log('[Snippy Debug] Performing initial backup save to Google Drive.')
            chrome.runtime.sendMessage({
              action: 'gdriveInitialSave',
              code: result.codeToEdit,
              metadata: pageMetadata
            })
          } else {
            console.log('[Snippy Debug] Initial GDrive save skipped: disabled by user setting.')
          }
        })
      } else {
        console.log('[Snippy Debug] Initial GDrive save skipped: unavailable on Edge.')
      }
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
        } else {
          console.warn('🚫 Stored Snippy unlock was invalid.')
        }
      } catch (err) {
        console.error('Server error verifying stored unlock on load.', err)
      }
    }
})
})
});