// page_world_script.js - REVERTED to simple, live version

console.log("Snippy (page_world_script.js): Initializing event-driven model.");

const aceEditor = ace.edit("fexpr_aceEditor");
const aceSession = aceEditor.session;

if (!aceEditor || !aceSession) {
    console.error("Snippy: FAILED to find ACE editor instance.");
}

// --- Listen for commands from the content script ---
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
            const fieldOptions = document.querySelectorAll('#formulaHelper option');
            const fields = Array.from(fieldOptions).filter(o => !o.disabled && o.value !== 'Select a function...').map(o => ({ name: o.textContent, value: o.value, type: o.dataset.fieldType }));
            window.postMessage({ source: 'snippy-page-world', command: 'fieldsList', payload: fields }, '*');
            break;
        case 'getFunctions':
            const functionSelect = document.querySelector('#formulaFunctions #Select1');
            const functionInfoEl = document.getElementById('FuncInfo');
            if (functionSelect && functionInfoEl) {
                const functionOptions = Array.from(functionSelect.options);
                const functions = await Promise.all(functionOptions.map(option => getFunctionInfo(option, functionSelect, functionInfoEl)));
                window.postMessage({ source: 'snippy-page-world', command: 'functionsList', payload: functions }, '*');
            }
            break;
    }
});

function getFunctionInfo(option, selectElement, infoElement) {
    return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
            observer.disconnect();
            const infoHTML = infoElement.innerHTML;
            const parts = infoHTML.split('<br><br>');
            const signature = parts[0] ? parts[0].replace(/<b>|<\/b>/g, '') : '';
            const description = parts[1] ? parts[1].replace('<b>Description:</b> ', '') : '';
            const example = parts[2] ? parts[2].replace('<b>Example:</b> ', '').replace(/<br>/g, '\n') : '';
            resolve({ id: option.value, name: option.textContent, signature, description, example });
        });
        observer.observe(infoElement, { childList: true, characterData: true, subtree: true });
        option.selected = true;
        selectElement.dispatchEvent(new Event('change'));
    });
}

// This is the simple, fast listener. It only sends annotations.
aceSession.on('changeAnnotation', () => {
    const annotations = aceSession.getAnnotations();
    // NOTE: We are intentionally NOT sending highlight data from here anymore.
    window.postMessage({ 
        source: 'snippy-page-world', 
        command: 'editorAnnotations', 
        payload: { annotations: annotations }
    }, '*');
});