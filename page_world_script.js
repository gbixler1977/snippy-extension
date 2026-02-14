if (!window.SNIPPY_DEBUG_MODE) {
  console.log = console.info = console.debug = console.warn = () => {};
}



console.log("Snippy (page_world_script.js): Initializing event-driven model.");

const aceHostId =
  document.getElementById('fexpr_aceEditor') ? 'fexpr_aceEditor' :
  document.getElementById('tlvFormula_aceEditor') ? 'tlvFormula_aceEditor' :
  null;

if (!aceHostId) {
  console.error('Snippy: No ACE host found (neither #fexpr_aceEditor nor #tlvFormula_aceEditor).');
  // Bail early so we don’t throw
  throw new Error('Snippy: ACE host missing on this page.');
}


const aceEditor = ace.edit(aceHostId);

const aceSession = aceEditor.session;
// Tell the content script we're ready to accept messages (getFormula, etc.)
window.postMessage({ source: 'snippy-page-world', command: 'ready', payload: { aceHostId } }, '*');


if (!aceEditor || !aceSession) {
    console.error("Snippy: FAILED to find ACE editor instance.");
}


window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || !event.data.source || event.data.source !== 'snippy-content-script') return;
    const command = event.data.command;
    switch (command) {
        case 'setFormula':
            aceEditor.setValue(event.data.payload, -1);
            aceEditor.session._emit('change', {});
            break;
        case 'getFormula':
            window.postMessage({ source: 'snippy-page-world', command: 'formulaCode', payload: aceEditor.getValue() }, '*');
            break;
        case 'getFields':
            const fieldOptions = document.querySelectorAll('#formulaHelper option, #colFormulaHelper option');
            const fields = Array.from(fieldOptions)
  .filter(o => !o.disabled && o.value && !/select a function/i.test(o.textContent))
  .map(o => ({
    name: o.textContent,
    value: o.value,
    type: o.dataset.fieldType || o.getAttribute('data-field-type') || 'unknown'
  }));

            window.postMessage({ source: 'snippy-page-world', command: 'fieldsList', payload: fields }, '*');
            break;
        
		        case 'getFunctions':
            const functionSelect = document.querySelector('#formulaFunctions #Select1');
            const functionInfoEl = document.getElementById('FuncInfo');
            if (functionSelect && functionInfoEl) {
                const functionOptions = Array.from(functionSelect.options);

                const functionsLite = functionOptions.map(option => ({
                    id: option.value,
                    name: option.textContent,
                    signature: '[Loading...]',
                    description: '[Click a function to load its info]',
                    example: ''
                }));

                window.postMessage({
                    source: 'snippy-page-world',
                    command: 'functionsList',
                    payload: functionsLite
                }, '*');
            }
            break;

        case 'getFullFunctionInfo': {
			            console.log('[Snippy Debug] PAGE WORLD received getFullFunctionInfo.'); 
            const { id } = event.data.payload;

            const functionSelect = document.querySelector('#formulaFunctions #Select1');
            const functionInfoEl = document.getElementById('FuncInfo');
			console.log('[Snippy Debug] Attempting to find dropdown. Result:', functionSelect);
            console.log('[Snippy Debug] Attempting to find info panel. Result:', functionInfoEl);
            if (!functionSelect || !functionInfoEl) return;

            const option = Array.from(functionSelect.options).find(opt => opt.value === id);
            if (!option) {
                console.warn('[Snippy Debug] Could not find option with id:', id);
                return;
            }

            const details = await getFunctionInfo(option, functionSelect, functionInfoEl);
        console.log('[Snippy Debug] PAGE WORLD sending back details:', details);
            window.postMessage({
                source: 'snippy-page-world',
                command: 'forwardFunctionDetails',
                payload: details
            }, '*');

            break;
        }


    }
});







function getFunctionInfo(option, selectElement, infoElement) {
  return new Promise((resolve) => {
   
    selectElement.value = option.value;
    
   
    RefreshFormulaInfo(selectElement);

   
    const maxWaitTime = 5000;
    const pollInterval = 50;
    let waited = 0;

    const checkUpdated = () => {
      const infoHTML = infoElement.innerHTML;

      if (infoHTML.includes(option.textContent)) {
        const parts = infoHTML.split('<br><br>');
        const signature = parts[0] ? 
  parts[0].replace(/<b>|<\/b>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
        const description = parts[1] ? parts[1].replace('<b>Description:</b> ', '') : '';
        const example = parts[2] ? parts[2].replace('<b>Example:</b> ', '').replace(/<br>/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
        return resolve({
          id: option.value,
          name: option.textContent,
          signature,
          description,
          example
        });
      }

      if (waited >= maxWaitTime) {
       
        return resolve({
          id: option.value,
          name: option.textContent,
          signature: '[Unknown]',
          description: '[Could not load description in time]',
          example: ''
        });
      }

      waited += pollInterval;
      setTimeout(checkUpdated, pollInterval);
    };

    setTimeout(checkUpdated, pollInterval);
  });
}








aceSession.on('changeAnnotation', () => {
    const annotations = aceSession.getAnnotations();
    
    window.postMessage({ 
        source: 'snippy-page-world', 
        command: 'editorAnnotations', 
        payload: { annotations: annotations }
    }, '*');
});