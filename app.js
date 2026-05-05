(() => {
  // --- Constants ---
  const POLL_INTERVAL = 500;
  const POLL_RETRIES_BEFORE_FAIL = 3; 
  const COIN_START_DELAY_MS = 1500; 

  // --- State ---
  let state = {
    selectedDoc: null,
    price: 5, 
    coins: 0,
    capturedFile: null,
    ocrData: {}, 
    formData: {},
    pollTimer: null,
    payTimer: null,
    pollFailCount: 0,
    payDelayTimer: null,
    idleTimer: null 
  };

  const screens = {
    idle: document.getElementById('screen-idle'),
    home: document.getElementById('screen-home'),
    capture: document.getElementById('screen-capture'),
    form: document.getElementById('screen-form'),
    payment: document.getElementById('screen-payment'),
    result: document.getElementById('screen-result')
  };

  const els = {
    mainArea: document.getElementById('main'),
    previewImg: document.getElementById('preview-img'),
    previewStatus: document.getElementById('preview-status'),
    captureBtn: document.getElementById('btn-capture'),
    captureBackBtn: document.getElementById('btn-capture-back'),
    docTypeLabel: document.getElementById('doc-type-label'),
    priceVal: document.getElementById('price-value'),
    insertedVal: document.getElementById('inserted-input'),
    formFields: document.getElementById('form-fields'),
    keypad: document.getElementById('static-keypad'),
    warningModal: document.getElementById('warning-modal'),
    printModal: document.getElementById('print-modal'),
    miniDocPreview: document.getElementById('mini-doc-preview'),
    payDocName: document.getElementById('pay-doc-name'),
    priceDisplay: document.getElementById('price-display'),
    insertedDisplay: document.getElementById('inserted-display'),
    btnEditDetails: document.getElementById('btn-edit-details'),
    btnPrintDoc: document.getElementById('btn-print-document'),
    btnFormBack: document.getElementById('btn-form-back'),
    step1: document.getElementById('step-1'),
    step2: document.getElementById('step-2'),
    step3: document.getElementById('step-3'),
    modalDocPreview: document.getElementById('modal-doc-preview')
  };

  window._kiosk = { 
    showScreen: showScreen,
    closeModal: () => { els.warningModal.style.display = 'none'; },
    start: () => { showScreen('home'); }
  };

  function init() {
    setupEventListeners();
    fetch('/coin/reset', { method: 'POST' }).catch(() => {});
    showScreen('idle');
  }

  function showScreen(name) {
    if (name === 'idle') {
      screens.idle.style.display = 'flex';
      els.mainArea.style.display = 'none';
      fetch('/coin/reset', { method: 'POST' }).catch(() => {});
      state.selectedDoc = null;
      state.formData = {};
    } else {
      screens.idle.style.display = 'none';
      els.mainArea.style.display = 'flex';
      Object.keys(screens).forEach(key => {
        if (key !== 'idle' && screens[key]) screens[key].style.display = 'none';
      });
      if(screens[name]) screens[name].style.display = 'flex'; 
      
      if (name === 'capture') {
        startCamera();
        if(els.docTypeLabel) els.docTypeLabel.textContent = state.selectedDoc || "SELECTED DOCUMENT";
      }
      
      if (name === 'payment') {
          startPaymentPolling();
      } else {
          stopPaymentPolling();
      }

      if (name === 'result') {
          setTimeout(() => {
              location.reload(); 
          }, 6000); 
      }
    }
  }

  function setupEventListeners() {
    screens.idle.addEventListener('click', () => showScreen('home'));
    
    const adminBtn = document.getElementById('btn-admin');
    if(adminBtn) {
        adminBtn.addEventListener('click', () => {
            window.location.href = '/admin';
        });
    }

    const iconClearance = `<svg viewBox="0 0 24 24" fill="none" stroke="#2E86C1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%; height:100%;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    const iconResidency = `<svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%; height:100%;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
    const iconIndigency = `<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%; height:100%;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

    const docs = [
      { title: "Barangay Clearance", price: 5, icon: iconClearance },
      { title: "Certificate of Residency", price: 5, icon: iconResidency },
      { title: "Barangay Indigency", price: 5, icon: iconIndigency }
    ];
    
    const docList = document.getElementById('doc-list');
    docList.innerHTML = '';
    docs.forEach(d => {
      const item = document.createElement('div');
      item.className = 'doc-item';
      item.innerHTML = `
        <div class="doc-content-group">
            <div class="doc-icon">${d.icon}</div>
            <div class="title">${d.title}</div>
        </div>
        <div class="price-tag">₱${d.price}</div>
      `;
      item.onclick = () => {
        state.selectedDoc = d.title;
        state.price = d.price;
        showScreen('capture');
      };
      docList.appendChild(item);
    });

    els.captureBtn.addEventListener('click', handleCaptureClick);
    document.getElementById('btn-save-and-continue').addEventListener('click', submitForm);
    
    if(els.captureBackBtn) els.captureBackBtn.addEventListener('click', () => showScreen('home'));
    if(els.btnFormBack) els.btnFormBack.addEventListener('click', () => showScreen('home'));

    if(els.btnEditDetails) els.btnEditDetails.addEventListener('click', () => showScreen('form'));
    if(els.btnPrintDoc) els.btnPrintDoc.addEventListener('click', processPaymentAndPrint);
  }

  function startCamera() {
    els.previewImg.src = "/mjpeg?" + Date.now();
    els.previewStatus.textContent = "Hold ID Steady";
    els.previewStatus.style.color = "#aaa";
    els.captureBtn.textContent = "Capture ID";
    els.captureBtn.className = "btn primary large";
    els.captureBtn.disabled = false;
    els.captureBtn.dataset.mode = "capture";
    if(els.captureBackBtn) els.captureBackBtn.disabled = false;
    resetChecklist();
  }

  function resetChecklist() {
    [els.step1, els.step2, els.step3].forEach(el => {
      if(el) { el.className = "step-item"; el.querySelector('.icon').textContent = "○"; }
    });
  }

  function updateChecklist(step, status) {
    const el = els[`step${step}`];
    if(!el) return;
    el.className = "step-item";
    if (status === 'process') {
      el.className = "step-item processing"; el.querySelector('.icon').textContent = "↻";
    } else if (status === 'done') {
      el.className = "step-item success"; el.querySelector('.icon').textContent = "✓";
    } else if (status === 'error') {
      el.className = "step-item error"; el.querySelector('.icon').textContent = "✕";
    }
  }

  async function handleCaptureClick() {
    const mode = els.captureBtn.dataset.mode;
    if (mode === 'proceed') { setupForm(); return; }
    if (mode === 'retry') return startCamera();

    try {
      els.captureBtn.disabled = true;
      if(els.captureBackBtn) els.captureBackBtn.disabled = true;
      els.previewStatus.textContent = "Capturing...";
      updateChecklist(1, 'process');
      const capReq = await fetch('/capture', { method: 'POST' });
      const capJson = await capReq.json();
      if (!capJson.ok) throw new Error("Capture failed");
      
      state.capturedFile = capJson.file;
      els.previewImg.src = state.capturedFile;
      updateChecklist(1, 'done');

      els.previewStatus.textContent = "Processing Image...";
      updateChecklist(2, 'process');
      await new Promise(r => setTimeout(r, 2000));
      updateChecklist(2, 'done');

      els.previewStatus.textContent = "Verifying Address...";
      updateChecklist(3, 'process');
      
      const startReq = await fetch('/ocr_start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: state.capturedFile })
      });
      const startJson = await startReq.json();
      if (!startJson.ok) throw new Error("Verification failed to start");
      pollResult(startJson.job);
    } catch (e) {
      els.previewStatus.textContent = "Error: " + e.message;
      els.captureBtn.disabled = false;
      if(els.captureBackBtn) els.captureBackBtn.disabled = false;
      updateChecklist(3, 'error'); 
    }
  }

  function pollResult(jobId) {
    state.pollTimer = setInterval(async () => {
      try {
        const r = await fetch(`/ocr_status?job=${jobId}`);
        const j = await r.json();
        if (j.ok && j.result && j.result.status === 'done') {
          clearInterval(state.pollTimer);
          handleVerificationResult(j.result);
        } else if (j.ok && j.result && j.result.status === 'error') {
          clearInterval(state.pollTimer);
          updateChecklist(3, 'error');
          els.previewStatus.textContent = "Processing Error";
          els.captureBtn.textContent = "Retry";
          els.captureBtn.dataset.mode = "retry";
          els.captureBtn.disabled = false;
          if(els.captureBackBtn) els.captureBackBtn.disabled = false;
        }
      } catch (e) { }
    }, POLL_INTERVAL);
  }

  function handleVerificationResult(res) {
    els.captureBtn.disabled = false;
    if(els.captureBackBtn) els.captureBackBtn.disabled = false;
    if (res.valid) {
      updateChecklist(3, 'done');
      els.previewStatus.textContent = "✅ " + res.reason;
      els.previewStatus.style.color = "#16A34A";
      els.captureBtn.textContent = "Proceed to Form →";
      els.captureBtn.className = "btn primary large success";
      els.captureBtn.dataset.mode = "proceed";
      state.ocrData = {}; 
    } else {
      updateChecklist(3, 'error');
      els.previewStatus.textContent = "❌ " + (res.reason || "Address Invalid");
      els.previewStatus.style.color = "#ff6b6b";
      els.captureBtn.textContent = "Retry";
      els.captureBtn.dataset.mode = "retry";
    }
  }

  const FORMS = {
    "Barangay Clearance": ["Last Name", "First Name", "Middle Name", "Address", "Purpose"],
    "Certificate of Residency": ["Last Name", "First Name", "Middle Name", "Address", "Years of Residency"],
    "Barangay Indigency": ["Last Name", "First Name", "Middle Name", "Address", "Purpose"]
  };
  
  let activeInput = null;

  function setupForm() {
    const docDisplay = document.getElementById('selected-doc-display');
    if(docDisplay) docDisplay.textContent = state.selectedDoc;
    const fields = FORMS[state.selectedDoc] || ["Last Name", "First Name", "Address"];
    els.formFields.innerHTML = '';
    fields.forEach((label, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'form-field';
      const lbl = document.createElement('label');
      lbl.className = 'field-label';
      lbl.innerHTML = `${label} <span style="color:#ff6b6b">*</span>`; 
      const input = document.createElement('input');
      input.type = "text";
      input.className = "input";
      input.id = "f_" + label.replace(/\s/g, '');
      input.setAttribute('autocomplete', 'off'); 
      if (state.formData[label]) { input.value = state.formData[label]; }
      input.addEventListener('focus', () => { setActiveInput(input); input.classList.remove('error'); });
      if (index === 0) setActiveInput(input);
      wrap.appendChild(lbl); wrap.appendChild(input); els.formFields.appendChild(wrap);
    });
    showScreen('form');
  }

  function setActiveInput(inputElement) {
    activeInput = inputElement;
    const allInputs = els.formFields.querySelectorAll('input');
    allInputs.forEach(i => i.style.borderColor = "rgba(255,255,255,0.15)");
    if(activeInput) { activeInput.focus(); activeInput.style.borderColor = "var(--accent)"; }
  }

  const keypad = document.getElementById('static-keypad');
  if(keypad) {
    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.keypad-btn');
      if (!btn) return;
      if (!activeInput) {
        const first = els.formFields.querySelector('input');
        if(first) { setActiveInput(first); } else return;
      }
      const key = btn.dataset.key;
      if (key === 'BACKSPACE') { activeInput.value = activeInput.value.slice(0, -1); } 
      else if (key === 'SPACE') { activeInput.value += " "; } 
      else if (key === 'ENTER') {
        const allInputs = Array.from(els.formFields.querySelectorAll('input'));
        const idx = allInputs.indexOf(activeInput);
        if (idx > -1 && idx < allInputs.length - 1) { setActiveInput(allInputs[idx + 1]); }
      } else { activeInput.value += key; }
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.focus();
    });
  }

  function submitForm() {
    const inputs = els.formFields.querySelectorAll('input');
    let isValid = true;
    state.formData = {};
    inputs.forEach(i => {
      if (!i.value.trim()) { isValid = false; i.classList.add('error'); } 
      else { i.classList.remove('error'); state.formData[i.previousSibling.textContent.replace(' *', '')] = i.value; }
    });
    if (!isValid) { els.warningModal.style.display = 'flex'; return; }
    generatePreview();
    showScreen('payment');
  }

  function generatePreview() {
    const previewContainer = document.getElementById('paper-doc-preview');
    if(els.payDocName) els.payDocName.textContent = state.selectedDoc;

    const name = `${state.formData["First Name"] || ""} ${state.formData["Middle Name"] || ""} ${state.formData["Last Name"] || ""}`.toUpperCase();
    const address = (state.formData["Address"] || "").toUpperCase();
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    let contentBody = "";

    if (state.selectedDoc === "Barangay Clearance") {
        contentBody = `
            <p class="salutation"><strong>TO WHOM IT MAY CONCERN:</strong></p>
            <p class="content-p">This is to certify that <strong>${name}</strong>, of legal age, Filipino, is a resident of <strong>${address}</strong>.</p>
            <p class="content-p">This certifies that the above-named individual is a person of good moral character and has no derogatory record on file in this Barangay.</p>
            <p class="content-p">This clearance is issued upon request for the purpose of: <strong>${(state.formData["Purpose"] || "General Requirement").toUpperCase()}</strong>.</p>
        `;
    } else if (state.selectedDoc === "Certificate of Residency") {
        contentBody = `
            <p class="salutation"><strong>TO WHOM IT MAY CONCERN:</strong></p>
            <p class="content-p">This is to certify that <strong>${name}</strong>, of legal age, Filipino, is a bona fide resident of <strong>${address}</strong>.</p>
            <p class="content-p">This certification verifies that the subject has been residing at the said address for <strong>${state.formData["Years of Residency"] || "N/A"}</strong> years.</p>
            <p class="content-p">This certificate is issued upon request for legal purposes.</p>
        `;
    } else { 
        contentBody = `
            <p class="salutation"><strong>TO WHOM IT MAY CONCERN:</strong></p>
            <p class="content-p">This is to certify that <strong>${name}</strong>, of legal age, Filipino, is a resident of <strong>${address}</strong>.</p>
            <p class="content-p">This further certifies that the above-named individual belongs to an indigent family in this Barangay and is in need of financial/medical assistance.</p>
            <p class="content-p">This certification is issued for the purpose of: <strong>${(state.formData["Purpose"] || "Financial Assistance").toUpperCase()}</strong>.</p>
        `;
    }

    const html = `
      <div class="doc-header-group">
          <div class="header-text">
              <h1>Republic of the Philippines</h1>
              <h2>City of Valenzuela</h2>
              <h3>BARANGAY KARUHATAN</h3>
              <br>
              <h4>OFFICE OF THE PUNONG BARANGAY</h4>
          </div>
      </div>
      
      <img src="logo-karuhatan.png" class="watermark-img" />
      
      <br><br>
      <div class="doc-title">${state.selectedDoc.toUpperCase()}</div>
      <br>
      
      <div class="doc-body">
          ${contentBody}
          <br>
          <p class="doc-footer">Given this <strong>${date}</strong> at Barangay Karuhatan, Valenzuela City.</p>
      </div>
      
      <div class="signature">
        <div class="sig-block">
            <span class="sig-line">HON. FERNANDO VALENZUELA</span>
            <br>
            <span class="sig-label">Punong Barangay</span>
        </div>
      </div>
    `;
    
    previewContainer.innerHTML = html;
    if(els.miniDocPreview) els.miniDocPreview.innerHTML = html;
  }

  function startPaymentPolling() {
    if(els.priceDisplay) els.priceDisplay.textContent = `₱${state.price}`;
    if(els.insertedDisplay) els.insertedDisplay.textContent = `₱${state.coins}`; 
    if(els.btnPrintDoc) els.btnPrintDoc.disabled = true;

    if (state.payDelayTimer) clearTimeout(state.payDelayTimer);
    state.payDelayTimer = setTimeout(() => {
        fetch('/coin/start', { method: 'POST' }).catch(() => {});
        runCoinPolling();
    }, COIN_START_DELAY_MS);
  }

  function runCoinPolling() {
      state.pollFailCount = 0; 
      payTimer = setInterval(async () => {
        try {
          const res = await fetch('/coin/status');
          const data = await res.json();
          state.pollFailCount = 0; 
          if (data.ok) {
            if (data.total < state.coins && data.total === 0) return; 
            state.coins = data.total;
            els.insertedDisplay.textContent = `₱${state.coins}`;
            if (state.coins >= state.price) {
              enablePrint();
              fetch('/coin/stop', { method: 'POST' }).catch(() => {});
            } else {
              if(els.btnPrintDoc) els.btnPrintDoc.disabled = true;
            }
          }
        } catch (e) { 
            state.pollFailCount++;
            if(state.pollFailCount > POLL_RETRIES_BEFORE_FAIL) {
               console.error("Connection lost to coin hardware");
            }
        }
      }, POLL_INTERVAL); 
  }

  function enablePrint() {
    if(els.btnPrintDoc) {
        els.btnPrintDoc.disabled = false;
        els.btnPrintDoc.removeAttribute('disabled');
    }
  }

  function stopPaymentPolling() {
    if (state.payDelayTimer) clearTimeout(state.payDelayTimer);
    if (payTimer) clearInterval(payTimer);
    fetch('/coin/stop', { method: 'POST' }).catch(() => {});
  }

  async function processPaymentAndPrint() {
    await fetch('/payment/confirm', { method: 'POST' }).catch(e => console.log("Pay confirm ignored"));
    stopPaymentPolling();
    
    // --- COPY PREVIEW TO MODAL ---
    const sourcePreview = document.getElementById('paper-doc-preview');
    if(els.modalDocPreview && sourcePreview) {
        els.modalDocPreview.innerHTML = sourcePreview.innerHTML;
    }
    
    els.printModal.style.display = 'flex';
    els.printModal.style.opacity = '1'; 
    
    try {
        const res = await doPrint();
        
        if(res.job_id) {
            // WAIT PERSISTENTLY UNTIL PRINTER IS DONE
            await waitForPrintJob(res.job_id);
        } else {
            // Fallback for simulation
            await new Promise(r => setTimeout(r, 5000));
        }

    } catch (e) {
        console.error("Print Error:", e);
        alert("Printer is busy or offline. Please check the device.");
    } finally {
        // ALWAYS EXECUTES AFTER PRINT JOB IS 'COMPLETED'
        els.printModal.style.opacity = '0';
        setTimeout(() => {
            els.printModal.style.display = 'none';
            showScreen('result');
        }, 500); 
    }
  }

  async function doPrint() {
    const previewContainer = document.getElementById('paper-doc-preview');
    let exactHtml = previewContainer.innerHTML;

    exactHtml = exactHtml.replace(/src="logo-karuhatan\.png"/g, 'src="__LOGO_DATA_URI__"');

    // PREPARE METADATA FOR LOGGING
    const fullName = `${state.formData["First Name"] || ""} ${state.formData["Middle Name"] || ""} ${state.formData["Last Name"] || ""}`.trim().toUpperCase();
    const metaPayload = {
        docType: state.selectedDoc,
        fullName: fullName,
        address: state.formData["Address"] || "",
        purpose: state.formData["Purpose"] || state.formData["Years of Residency"] || "N/A",
        price: state.price
    };

    const styleBlock = `
        <style>
            @page { margin: 0; }
            body { margin: 0; padding: 0; font-family: "Times New Roman", serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .paper-doc { width: 100%; text-align: center; color: #000; background: transparent; padding: 0; position: relative; }
            
            .doc-header-group { text-align: center; margin-bottom: 5px; position: relative; z-index: 10; }
            h1 { font-size: 16px; margin: 0; font-weight: normal; text-transform: uppercase; }
            h2 { font-size: 16px; margin: 2px 0; font-weight: normal; text-transform: uppercase; }
            h3 { font-size: 18px; margin: 2px 0; font-weight: bold; text-transform: uppercase; }
            h4 { font-size: 18px; font-weight: bold; margin-top: 15px; text-transform: uppercase; }
            
            .doc-title { font-size: 24px; font-weight: bold; text-transform: uppercase; margin: 10px 0; text-decoration: underline; position: relative; z-index: 10; }
            .doc-body { margin: 0 130px; text-align: justify; font-size: 18px; line-height: 1.6; position: relative; z-index: 10; }
            .salutation { font-size: 18px; margin-bottom: 15px; text-transform: uppercase; text-align: left; font-weight: bold; }
            .content-p { font-size: 18px; margin-bottom: 15px; text-align: justify; margin-left: 0; }
            .doc-footer { margin-top: 25px; font-size: 18px; text-align: left; }
            .signature { margin-top: 80px; width: 100%; text-align: right; position: relative; z-index: 10; margin-right: 130px; }
            .sig-block { display: inline-block; text-align: center; position: relative; }
            .sig-line { display: block; border-top: 1px solid #000; width: 250px; padding-top: 5px; font-weight: bold; font-size: 14px; text-transform: uppercase; }
            .sig-label { font-size: 12px; font-weight: normal; }
            
            .watermark-img { 
                position: absolute; 
                top: 350px; 
                left: 50%; 
                transform: translateX(-50%); 
                width: 60%; 
                opacity: 0.2; 
                z-index: -1; 
                display: block;
            }
        </style>
    `;

    const fullHtml = `<html><head>${styleBlock}</head><body><div class="paper-doc">${exactHtml}</div></body></html>`;

    // SEND BOTH HTML AND METADATA
    const r = await fetch('/print', { 
      method: 'POST', 
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ 
          html: fullHtml,
          meta: metaPayload 
      }) 
    });
    return await r.json();
  }

  async function waitForPrintJob(jobId) {
      return new Promise((resolve, reject) => {
          let attempts = 0;
          // Check constantly until status is 'completed'
          const check = setInterval(async () => {
              try {
                  const r = await fetch(`/print/status?job_id=${jobId}`);
                  const d = await r.json();
                  if(d.status === 'completed') {
                      clearInterval(check);
                      // Add small safety buffer (2s) so modal doesn't flash if printer reports done instantly
                      setTimeout(resolve, 2000); 
                  }
              } catch(e) {
                  attempts++;
                  // Only fail after huge number of retries, otherwise keep checking
                  if(attempts > 30) {
                      clearInterval(check);
                      resolve(); 
                  }
              }
          }, 1000); 
      });
  }

  init();
})();