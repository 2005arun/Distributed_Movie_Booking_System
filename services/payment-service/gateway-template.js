/**
 * Payment Gateway Template
 * Renders a realistic payment checkout page (simulating Razorpay/Stripe)
 * The gateway collects card/UPI info, then calls the webhook endpoint to confirm payment.
 */

function renderGatewayPage({ orderId, amount, movieTitle, bookingId, callbackUrl }) {
    const configJson = JSON.stringify({ orderId, amount, bookingId, callbackUrl });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Secure Payment | CineBook</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #06081a;
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
      background-image:
        radial-gradient(circle at 20% 30%, rgba(233,69,96,0.08), transparent 50%),
        radial-gradient(circle at 80% 70%, rgba(15,52,96,0.15), transparent 50%);
    }
    .gateway {
      width: 100%; max-width: 440px;
      background: #111827;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 25px 80px rgba(0,0,0,0.6);
      overflow: hidden;
    }
    .gw-header {
      background: linear-gradient(135deg, #e94560 0%, #c23152 50%, #0f3460 100%);
      padding: 1.5rem 2rem;
      display: flex; justify-content: space-between; align-items: center;
    }
    .merchant { display: flex; align-items: center; gap: 0.5rem; color: #fff; font-weight: 700; font-size: 1.1rem; }
    .merchant-logo { font-size: 1.4rem; }
    .gw-amount { color: #fff; font-size: 2rem; font-weight: 800; letter-spacing: -0.5px; }
    .gw-body { padding: 1.75rem 2rem 2rem; }
    .order-info {
      color: rgba(255,255,255,0.5); font-size: 0.82rem;
      margin-bottom: 1.5rem; padding-bottom: 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex; justify-content: space-between;
    }
    .tabs { display: flex; gap: 0.5rem; margin-bottom: 1.75rem; }
    .tab {
      flex: 1; padding: 0.7rem 0.5rem; border: 1px solid rgba(255,255,255,0.12);
      background: transparent; color: rgba(255,255,255,0.5);
      border-radius: 10px; cursor: pointer; font-size: 0.85rem;
      font-family: inherit; transition: all 0.2s;
    }
    .tab.active, .tab:hover {
      background: rgba(233,69,96,0.12); border-color: #e94560; color: #fff;
    }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .fg { margin-bottom: 1.15rem; }
    .fg label {
      display: block; color: rgba(255,255,255,0.5); font-size: 0.75rem;
      font-weight: 600; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.8px;
    }
    .fg input {
      width: 100%; padding: 0.8rem 1rem;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px; color: #fff; font-size: 0.95rem;
      font-family: inherit; outline: none; transition: border-color 0.2s;
    }
    .fg input:focus { border-color: #e94560; background: rgba(233,69,96,0.04); }
    .fg input::placeholder { color: rgba(255,255,255,0.25); }
    .form-row { display: flex; gap: 1rem; }
    .form-row .fg { flex: 1; }
    .banks { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
    .bank {
      padding: 0.8rem; text-align: center; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.6);
      cursor: pointer; font-size: 0.85rem; transition: all 0.2s;
    }
    .bank.selected, .bank:hover {
      border-color: #e94560; color: #fff; background: rgba(233,69,96,0.1);
    }
    .pay-btn {
      width: 100%; padding: 1.05rem; margin-top: 0.75rem;
      background: linear-gradient(135deg, #4ecca3, #38b28a);
      border: none; border-radius: 12px; color: #fff;
      font-size: 1.12rem; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: all 0.25s; letter-spacing: 0.3px;
    }
    .pay-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(78,204,163,0.35); }
    .pay-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
    .cancel-link {
      display: block; width: 100%; margin-top: 1rem;
      background: none; border: none; color: rgba(255,255,255,0.35);
      font-size: 0.8rem; cursor: pointer; font-family: inherit;
      text-decoration: underline; transition: color 0.2s;
    }
    .cancel-link:hover { color: rgba(255,255,255,0.6); }
    .demo-hint {
      text-align: center; color: rgba(255,255,255,0.3); font-size: 0.72rem;
      margin-top: 1rem; padding: 0.6rem; background: rgba(255,255,255,0.02);
      border-radius: 8px; border: 1px dashed rgba(255,255,255,0.08);
    }
    .gw-footer {
      text-align: center; padding: 1rem 2rem;
      color: rgba(255,255,255,0.2); font-size: 0.72rem;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .overlay {
      position: fixed; inset: 0; background: rgba(6,8,26,0.92);
      backdrop-filter: blur(10px); display: flex;
      align-items: center; justify-content: center; z-index: 1000;
    }
    .overlay-box {
      text-align: center; color: #fff; padding: 2.5rem;
      background: #111827; border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      max-width: 380px; width: 90%;
    }
    .spinner {
      width: 50px; height: 50px;
      border: 4px solid rgba(255,255,255,0.1);
      border-top-color: #e94560; border-radius: 50%;
      margin: 0 auto 1.5rem; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .overlay-box h3 { font-size: 1.3rem; margin-bottom: 0.5rem; }
    .overlay-box p { color: rgba(255,255,255,0.5); font-size: 0.9rem; }
    .result-icon { font-size: 3.5rem; margin-bottom: 1rem; }
    .retry-btn, .back-btn {
      padding: 0.7rem 1.5rem; border: none; border-radius: 10px;
      font-size: 0.95rem; font-weight: 600; cursor: pointer;
      font-family: inherit; margin: 0.4rem; transition: all 0.2s;
    }
    .retry-btn { background: #e94560; color: #fff; }
    .retry-btn:hover { background: #d63a54; }
    .back-btn { background: rgba(255,255,255,0.1); color: #fff; }
    .back-btn:hover { background: rgba(255,255,255,0.18); }
    .actions { margin-top: 1.5rem; display: flex; justify-content: center; gap: 0.5rem; }
    .processing-steps { text-align: left; max-width: 260px; margin: 1.5rem auto 0; }
    .p-step {
      display: flex; align-items: center; gap: 0.6rem;
      padding: 0.4rem 0; font-size: 0.85rem; transition: all 0.3s;
    }
    .p-step.done { color: #4ade80; }
    .p-step.active { color: #fff; font-weight: 600; }
    .p-step.pending { color: rgba(255,255,255,0.25); }

    /* UPI styles */
    .upi-section { text-align: center; }
    .upi-apps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; margin-bottom: 1rem; }
    .upi-app {
      display: flex; flex-direction: column; align-items: center; gap: 0.35rem;
      padding: 0.75rem 0.3rem; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; cursor: pointer; transition: all 0.2s;
      color: rgba(255,255,255,0.5); font-size: 0.72rem; font-weight: 500;
    }
    .upi-app:hover, .upi-app.selected {
      border-color: #e94560; color: #fff; background: rgba(233,69,96,0.1);
    }
    .upi-app-icon {
      width: 38px; height: 38px; border-radius: 10px; display: flex;
      align-items: center; justify-content: center; font-size: 1.1rem;
      font-weight: 800; color: #fff;
    }
    .upi-divider {
      display: flex; align-items: center; gap: 0.75rem; margin: 0.85rem 0;
      color: rgba(255,255,255,0.25); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.8px;
    }
    .upi-divider::before, .upi-divider::after {
      content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.08);
    }
    .qr-container {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px; padding: 1.25rem; margin-top: 0.25rem;
    }
    .qr-code {
      background: #fff; border-radius: 10px; padding: 0.75rem;
      display: inline-block; line-height: 0;
    }
    .qr-label {
      color: rgba(255,255,255,0.4); font-size: 0.78rem; margin-top: 0.75rem;
    }
  </style>
</head>
<body>
  <div class="gateway">
    <div class="gw-header">
      <div class="merchant">
        <span class="merchant-logo">&#127916;</span>
        <span>CineBook</span>
      </div>
      <div class="gw-amount">&#8377;${amount}</div>
    </div>

    <div class="gw-body">
      <div class="order-info">
        <span>${movieTitle}</span>
        <span>Order #${orderId.substring(0, 15)}</span>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="card">&#128179; Card</button>
        <button class="tab" data-tab="upi">&#128241; UPI</button>
        <button class="tab" data-tab="nb">&#127974; Net Banking</button>
      </div>

      <div id="tab-card" class="tab-panel active">
        <div class="fg">
          <label>Card Number</label>
          <input id="cardNum" placeholder="4111 1111 1111 1111" maxlength="19" autocomplete="cc-number">
        </div>
        <div class="fg">
          <label>Cardholder Name</label>
          <input id="cardName" placeholder="JOHN DOE" autocomplete="cc-name">
        </div>
        <div class="form-row">
          <div class="fg">
            <label>Expiry</label>
            <input id="expiry" placeholder="12/28" maxlength="5" autocomplete="cc-exp">
          </div>
          <div class="fg">
            <label>CVV</label>
            <input id="cvv" type="password" placeholder="&bull;&bull;&bull;" maxlength="4" autocomplete="cc-csc">
          </div>
        </div>
      </div>

      <div id="tab-upi" class="tab-panel">
        <div class="upi-section">
          <div class="upi-apps">
            <div class="upi-app selected" data-app="gpay">
              <div class="upi-app-icon" style="background:#4285f4">G</div>
              <span>GPay</span>
            </div>
            <div class="upi-app" data-app="phonepe">
              <div class="upi-app-icon" style="background:#5f259f">P</div>
              <span>PhonePe</span>
            </div>
            <div class="upi-app" data-app="paytm">
              <div class="upi-app-icon" style="background:#00baf2">&#8377;</div>
              <span>Paytm</span>
            </div>
            <div class="upi-app" data-app="bhim">
              <div class="upi-app-icon" style="background:#e8581e">B</div>
              <span>BHIM</span>
            </div>
          </div>
          <div class="upi-divider"><span>or enter UPI ID</span></div>
          <div class="fg" style="margin-bottom:0.75rem">
            <input id="upiId" placeholder="yourname@okaxis" style="text-align:center;font-size:1rem">
          </div>
          <div class="upi-divider"><span>or scan QR code</span></div>
          <div class="qr-container" id="qrContainer">
            <div class="qr-code">
              <svg viewBox="0 0 200 200" width="160" height="160">
                <rect width="200" height="200" fill="#fff"/>
                <g fill="#000">
                  <rect x="10" y="10" width="60" height="60" rx="4"/>
                  <rect x="18" y="18" width="44" height="44" rx="2" fill="#fff"/>
                  <rect x="26" y="26" width="28" height="28" rx="2"/>
                  <rect x="130" y="10" width="60" height="60" rx="4"/>
                  <rect x="138" y="18" width="44" height="44" rx="2" fill="#fff"/>
                  <rect x="146" y="26" width="28" height="28" rx="2"/>
                  <rect x="10" y="130" width="60" height="60" rx="4"/>
                  <rect x="18" y="138" width="44" height="44" rx="2" fill="#fff"/>
                  <rect x="26" y="146" width="28" height="28" rx="2"/>
                  <rect x="80" y="10" width="12" height="12"/><rect x="100" y="10" width="12" height="12"/>
                  <rect x="80" y="30" width="12" height="12"/><rect x="108" y="30" width="12" height="12"/>
                  <rect x="80" y="50" width="12" height="12"/><rect x="100" y="50" width="12" height="12"/>
                  <rect x="80" y="80" width="12" height="12"/><rect x="100" y="80" width="12" height="12"/><rect x="120" y="80" width="12" height="12"/>
                  <rect x="140" y="80" width="12" height="12"/><rect x="160" y="80" width="12" height="12"/><rect x="180" y="80" width="12" height="12"/>
                  <rect x="80" y="100" width="12" height="12"/><rect x="120" y="100" width="12" height="12"/><rect x="160" y="100" width="12" height="12"/>
                  <rect x="80" y="120" width="12" height="12"/><rect x="100" y="120" width="12" height="12"/><rect x="140" y="120" width="12" height="12"/>
                  <rect x="80" y="140" width="12" height="12"/><rect x="120" y="140" width="12" height="12"/><rect x="160" y="140" width="12" height="12"/>
                  <rect x="80" y="160" width="12" height="12"/><rect x="100" y="160" width="12" height="12"/><rect x="140" y="160" width="12" height="12"/><rect x="180" y="160" width="12" height="12"/>
                  <rect x="80" y="180" width="12" height="12"/><rect x="120" y="180" width="12" height="12"/><rect x="160" y="180" width="12" height="12"/>
                  <rect x="130" y="130" width="60" height="60" rx="4" fill="none" stroke="#000" stroke-width="4"/>
                  <rect x="148" y="148" width="24" height="24" rx="2"/>
                </g>
              </svg>
            </div>
            <p class="qr-label">Scan with any UPI app to pay &#8377;${amount}</p>
          </div>
        </div>
      </div>

      <div id="tab-nb" class="tab-panel">
        <div class="banks">
          <div class="bank selected">&#127974; SBI</div>
          <div class="bank">&#127974; HDFC</div>
          <div class="bank">&#127974; ICICI</div>
          <div class="bank">&#127974; Axis</div>
        </div>
      </div>

      <button id="payBtn" class="pay-btn">&#128274; Pay &#8377;${amount}</button>
      <button class="cancel-link" id="cancelBtn">Cancel and return to CineBook</button>
      <div class="demo-hint">&#129514; Demo Mode &mdash; Enter any details and click Pay</div>
    </div>

    <div class="gw-footer">&#128274; Secured by CineBook Payment Gateway &bull; 256-bit SSL Encryption</div>
  </div>

  <div id="overlay" class="overlay" style="display:none">
    <div class="overlay-box">
      <div id="oSpinner" class="spinner"></div>
      <div id="oIcon" class="result-icon" style="display:none"></div>
      <h3 id="oTitle">Processing Payment...</h3>
      <p id="oMsg">Connecting to your bank securely</p>
      <div id="oSteps" class="processing-steps" style="display:none">
        <div class="p-step active" id="step-1">&#9679; Connecting...</div>
        <div class="p-step pending" id="step-2">&#9679; Verifying payment</div>
        <div class="p-step pending" id="step-3">&#9679; Confirming transaction</div>
      </div>
      <div id="oActions" class="actions" style="display:none"></div>
    </div>
  </div>

  <script>
    var C = ${configJson};

    /* Tab switching */
    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
        this.classList.add('active');
        document.getElementById('tab-' + this.dataset.tab).classList.add('active');
        /* Update Pay button text */
        var btn = document.getElementById('payBtn');
        if (this.dataset.tab === 'upi') {
          btn.innerHTML = '&#128274; Pay via UPI &#8377;${amount}';
        } else if (this.dataset.tab === 'nb') {
          btn.innerHTML = '&#128274; Pay via Net Banking &#8377;${amount}';
        } else {
          btn.innerHTML = '&#128274; Pay &#8377;${amount}';
        }
      });
    });

    /* Card number formatting */
    document.getElementById('cardNum').addEventListener('input', function(e) {
      var v = e.target.value.replace(/\\D/g, '').substring(0, 16);
      e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
    });

    /* Expiry formatting */
    document.getElementById('expiry').addEventListener('input', function(e) {
      var v = e.target.value.replace(/\\D/g, '').substring(0, 4);
      if (v.length >= 3) v = v.substring(0,2) + '/' + v.substring(2);
      e.target.value = v;
    });

    /* Bank selection */
    document.querySelectorAll('.bank').forEach(function(b) {
      b.addEventListener('click', function() {
        document.querySelectorAll('.bank').forEach(function(x) { x.classList.remove('selected'); });
        this.classList.add('selected');
      });
    });

    /* UPI app selection */
    document.querySelectorAll('.upi-app').forEach(function(app) {
      app.addEventListener('click', function() {
        document.querySelectorAll('.upi-app').forEach(function(x) { x.classList.remove('selected'); });
        this.classList.add('selected');
        document.getElementById('upiId').value = '';
      });
    });

    /* UPI ID input - deselects app when typing */
    var upiInput = document.getElementById('upiId');
    if (upiInput) {
      upiInput.addEventListener('input', function() {
        if (this.value.length > 0) {
          document.querySelectorAll('.upi-app').forEach(function(x) { x.classList.remove('selected'); });
        }
      });
    }

    /* Helper: get active tab name */
    function getActiveTab() {
      var active = document.querySelector('.tab.active');
      return active ? active.dataset.tab : 'card';
    }

    /* Cancel */
    document.getElementById('cancelBtn').addEventListener('click', function() {
      if (C.callbackUrl) {
        window.location.href = C.callbackUrl + '?status=failed';
      } else {
        window.history.back();
      }
    });

    /* Pay button */
    document.getElementById('payBtn').addEventListener('click', processPayment);

    function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    async function processPayment() {
      var btn = document.getElementById('payBtn');
      var tab = getActiveTab();

      /* UPI validation: must select an app or enter UPI ID */
      if (tab === 'upi') {
        var selectedApp = document.querySelector('.upi-app.selected');
        var upiVal = document.getElementById('upiId').value.trim();
        if (!selectedApp && !upiVal) {
          alert('Please select a UPI app or enter your UPI ID');
          return;
        }
        if (upiVal && !upiVal.includes('@')) {
          alert('Please enter a valid UPI ID (e.g. yourname@okaxis)');
          return;
        }
      }

      btn.disabled = true;
      showProcessing(tab);

      try {
        /* Step 1: Connect / Send request */
        await delay(tab === 'upi' ? 1500 : 1200);
        setStep('step-1', 'done');
        setStep('step-2', 'active');

        /* UPI: extra wait to simulate approval */
        if (tab === 'upi') {
          await delay(1800);
        }

        /* Step 2: Send webhook to confirm payment */
        var paymentMethod = tab === 'upi' ? 'UPI' : (tab === 'nb' ? 'Net Banking' : 'Card');
        var res = await fetch('/api/payments/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gateway_order_id: C.orderId,
            gateway_payment_id: 'PAY-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8),
            status: 'SUCCESS',
            amount: C.amount,
            method: paymentMethod
          })
        });

        if (!res.ok) {
          var err = await res.json().catch(function() { return { error: 'Payment failed' }; });
          throw new Error(err.error || 'Payment verification failed');
        }

        setStep('step-2', 'done');
        setStep('step-3', 'active');
        await delay(800);
        setStep('step-3', 'done');
        await delay(600);

        /* Show success */
        showSuccess(tab);
        await delay(2500);

        /* Redirect back */
        if (C.callbackUrl) {
          window.location.href = C.callbackUrl + '?status=success';
        }
      } catch (err) {
        showError(err.message || 'Payment failed');
      }
    }

    function showProcessing(tab) {
      var ov = document.getElementById('overlay');
      ov.style.display = 'flex';
      document.getElementById('oSpinner').style.display = 'block';
      document.getElementById('oIcon').style.display = 'none';
      document.getElementById('oTitle').style.color = '#fff';
      document.getElementById('oMsg').style.display = 'block';
      document.getElementById('oSteps').style.display = 'block';
      document.getElementById('oActions').style.display = 'none';

      if (tab === 'upi') {
        var selectedApp = document.querySelector('.upi-app.selected');
        var appName = selectedApp ? selectedApp.querySelector('span').textContent : 'UPI';
        document.getElementById('oTitle').textContent = 'Processing UPI Payment...';
        document.getElementById('oMsg').textContent = 'Sending collect request to ' + appName;
        document.getElementById('step-1').innerHTML = '\u25cf Sending collect request to ' + appName + '...';
        document.getElementById('step-2').innerHTML = '\u25cf Waiting for approval...';
        document.getElementById('step-3').innerHTML = '\u25cf Confirming payment';
      } else if (tab === 'nb') {
        document.getElementById('oTitle').textContent = 'Processing Payment...';
        document.getElementById('oMsg').textContent = 'Connecting to your bank securely';
        document.getElementById('step-1').innerHTML = '\u25cf Connecting to bank...';
        document.getElementById('step-2').innerHTML = '\u25cf Verifying payment';
        document.getElementById('step-3').innerHTML = '\u25cf Confirming transaction';
      } else {
        document.getElementById('oTitle').textContent = 'Processing Payment...';
        document.getElementById('oMsg').textContent = 'Connecting to your bank securely';
        document.getElementById('step-1').innerHTML = '\u25cf Connecting to bank...';
        document.getElementById('step-2').innerHTML = '\u25cf Verifying payment';
        document.getElementById('step-3').innerHTML = '\u25cf Confirming transaction';
      }

      /* Reset steps */
      setStep('step-1', 'active');
      setStep('step-2', 'pending');
      setStep('step-3', 'pending');
    }

    function showSuccess(tab) {
      document.getElementById('oSpinner').style.display = 'none';
      var icon = document.getElementById('oIcon');
      icon.style.display = 'block';
      icon.textContent = '\u2705';
      document.getElementById('oTitle').textContent = 'Payment Successful!';
      document.getElementById('oTitle').style.color = '#4ade80';
      var methodLabel = tab === 'upi' ? 'via UPI' : (tab === 'nb' ? 'via Net Banking' : 'via Card');
      document.getElementById('oMsg').innerHTML = '\u20b9' + C.amount + ' paid ' + methodLabel + '<br><small style="opacity:0.5;margin-top:4px;display:inline-block">Redirecting to your ticket...</small>';
      document.getElementById('oSteps').style.display = 'none';
    }

    function showError(msg) {
      document.getElementById('oSpinner').style.display = 'none';
      var icon = document.getElementById('oIcon');
      icon.style.display = 'block';
      icon.textContent = '\\u274c';
      document.getElementById('oTitle').textContent = 'Payment Failed';
      document.getElementById('oTitle').style.color = '#ef4444';
      document.getElementById('oMsg').textContent = msg || 'Something went wrong';
      document.getElementById('oSteps').style.display = 'none';
      var actions = document.getElementById('oActions');
      actions.style.display = 'flex';
      actions.innerHTML = '<button class="retry-btn" onclick="retryPayment()">Try Again</button>'
        + '<button class="back-btn" onclick="cancelPayment()">Cancel</button>';
    }

    function setStep(id, state) {
      var el = document.getElementById(id);
      el.className = 'p-step ' + state;
      if (state === 'done') el.innerHTML = '\\u2713 ' + el.textContent.substring(2);
      if (state === 'active') el.innerHTML = '\\u25cf ' + el.textContent.substring(2);
    }

    function retryPayment() {
      document.getElementById('overlay').style.display = 'none';
      document.getElementById('payBtn').disabled = false;
    }

    function cancelPayment() {
      if (C.callbackUrl) {
        window.location.href = C.callbackUrl + '?status=failed';
      } else {
        window.history.back();
      }
    }
  </script>
</body>
</html>`;
}

module.exports = { renderGatewayPage };
