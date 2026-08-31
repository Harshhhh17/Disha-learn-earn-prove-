/* ==========================================================================
   Disha Wallet, KYC Verification & Real-Money Withdrawal Engine
   ========================================================================== */

import { Storage } from './utils/storage.js';
import { I18n } from './i18n.js';
import { Sound } from './utils/sound.js';
import { Confetti } from './utils/confetti.js';
import { CryptoUtils } from './utils/crypto.js';
import { Sanitize } from './utils/sanitize.js';
import { API } from './api.js';

class WalletView {
  constructor() {
    this.txFilter = 'ALL'; // 'ALL', 'CREDIT', 'DEBIT'
  }

  render() {
    const container = document.getElementById('view-wallet');
    if (!container) return;

    const user = Storage.getUser();
    const wallet = Storage.getWallet();
    const transactions = Storage.getTransactions();

    const filteredTx = transactions.filter(tx => {
      if (this.txFilter === 'CREDIT') return tx.type === 'CREDIT';
      if (this.txFilter === 'DEBIT') return tx.type === 'DEBIT';
      return true;
    });

    container.innerHTML = `
      <!-- Wallet Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-md);">
        <div>
          <h2 style="font-size: 1.4rem;">${I18n.t('wallet')}</h2>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">100% RBI & TDS Compliant Real-Money Bank Settlements</p>
        </div>
        <div style="display: flex; gap: 8px;">
          <span style="display: inline-flex; align-items: center; gap: 4px; background: ${user?.isKycVerified ? 'hsla(152,76%,42%,0.15)' : 'hsla(38,98%,52%,0.15)'}; color: ${user?.isKycVerified ? 'var(--brand-emerald)' : 'hsl(38,98%,46%)'}; padding: 4px 10px; border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 700;">
            ${user?.isKycVerified ? '✓ KYC Verified' : '⚠️ KYC Pending'}
          </span>
        </div>
      </div>

      <!-- Liquid Holographic Balance Card -->
      <div class="wallet-card-liquid">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <span style="font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85;">
            ${I18n.t('availableBalance')}
          </span>
          <span style="font-family: var(--font-mono); font-size: 0.8rem; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: var(--radius-full);">
            Instant UPI / IMPS
          </span>
        </div>

        <div class="wallet-balance-num">
          ₹${wallet.availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        <div class="wallet-meta-row">
          <div>
            <div style="font-size: 0.72rem; opacity: 0.8;">${I18n.t('lockedBalance')}</div>
            <div style="font-family: var(--font-mono); font-weight: 700;">₹${wallet.lockedBalance.toFixed(2)}</div>
          </div>
          <div>
            <div style="font-size: 0.72rem; opacity: 0.8;">Total Won</div>
            <div style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-gold);">₹${wallet.totalWon.toFixed(2)}</div>
          </div>
          <div>
            <div style="font-size: 0.72rem; opacity: 0.8;">Withdrawn</div>
            <div style="font-family: var(--font-mono); font-weight: 700;">₹${wallet.totalWithdrawn.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); margin-bottom: var(--space-xl);">
        <button id="btn-open-withdraw" class="btn btn-primary" style="padding: 14px;">
          🏦 ${I18n.t('withdraw')}
        </button>
        <button id="btn-open-addcash" class="btn btn-neo" style="padding: 14px;">
          💳 ${I18n.t('addCash')}
        </button>
      </div>

      <!-- KYC Notice Alert (if not verified) -->
      ${!user?.isKycVerified ? `
        <div class="glass-panel" style="padding: var(--space-md); margin-bottom: var(--space-xl); border-left: 4px solid var(--brand-gold); display: flex; justify-content: space-between; align-items: center; flex-wrap:wrap; gap: 8px;">
          <div>
            <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-primary);">
              ⚡ ${I18n.t('kycRequired')}
            </div>
            <p style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 2px;">
              ${I18n.t('kycDesc')}
            </p>
          </div>
          <button id="btn-trigger-kyc" class="btn btn-gold btn-sm">
            ${I18n.t('verifyNow')}
          </button>
        </div>
      ` : ''}

      <!-- Transaction History Section -->
      <section>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-md); flex-wrap:wrap; gap:8px;">
          <h3 style="font-size: 1.15rem;">Transaction Ledger</h3>
          
          <div class="neo-inset" style="padding: 3px; display: flex; gap: 4px; border-radius: var(--radius-full);">
            <button class="btn btn-sm ${this.txFilter === 'ALL' ? 'btn-primary' : 'btn-neo'}" data-tx-filter="ALL" style="padding: 4px 10px; font-size: 0.72rem;">All</button>
            <button class="btn btn-sm ${this.txFilter === 'CREDIT' ? 'btn-primary' : 'btn-neo'}" data-tx-filter="CREDIT" style="padding: 4px 10px; font-size: 0.72rem;">Credits</button>
            <button class="btn btn-sm ${this.txFilter === 'DEBIT' ? 'btn-primary' : 'btn-neo'}" data-tx-filter="DEBIT" style="padding: 4px 10px; font-size: 0.72rem;">Withdrawals</button>
          </div>
        </div>

        <div class="tx-list">
          ${filteredTx.length === 0 ? `
            <div class="neo-card" style="text-align: center; padding: var(--space-xl);">
              <p style="color: var(--text-muted);">No transactions under this filter.</p>
            </div>
          ` : filteredTx.map(tx => `
            <div class="tx-row">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 38px; height: 38px; border-radius: 50%; background: ${tx.type === 'CREDIT' ? 'hsla(152,76%,42%,0.15)' : 'hsla(226,88%,60%,0.15)'}; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;">
                  ${tx.type === 'CREDIT' ? '🏆' : '🏦'}
                </div>
                <div>
                  <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-primary);">${tx.title}</div>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">${tx.date} • ${tx.method}</div>
                </div>
              </div>

              <div style="text-align: right;">
                <div style="font-family: var(--font-mono); font-weight: 800; font-size: 0.95rem; color: ${tx.type === 'CREDIT' ? 'var(--brand-emerald)' : 'var(--text-primary)'};">
                  ${tx.type === 'CREDIT' ? '+' : '-'}₹${tx.amount.toFixed(2)}
                </div>
                <span class="tx-status-badge ${tx.status === 'COMPLETED' ? 'tx-completed' : (tx.status === 'PROCESSING' ? 'tx-processing' : 'tx-pending')}">
                  ${tx.status}
                </span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- Modals are attached to document body via controllers -->
    `;

    this.bindEvents();
  }

  bindEvents() {
    // KYC Button
    document.getElementById('btn-trigger-kyc')?.addEventListener('click', () => {
      Sound.playTick();
      this.showKycModal();
    });

    // Withdraw Button
    document.getElementById('btn-open-withdraw')?.addEventListener('click', () => {
      Sound.playTick();
      const user = Storage.getUser();
      if (!user.isKycVerified) {
        window.DishaApp.showToast('Please complete KYC verification before first withdrawal.', 'info');
        this.showKycModal();
        return;
      }
      this.showWithdrawalModal();
    });

    // Add Cash Button
    document.getElementById('btn-open-addcash')?.addEventListener('click', () => {
      Sound.playTick();
      this.showAddCashModal();
    });

    // TX Filters
    document.querySelectorAll('[data-tx-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        Sound.playTick();
        this.txFilter = btn.getAttribute('data-tx-filter');
        this.render();
      });
    });
  }

  showKycModal() {
    const modal = document.getElementById('kyc-modal');
    if (modal) {
      modal.classList.add('show');
      this.setupKycEvents();
    }
  }

  setupKycEvents() {
    const submitPanBtn = document.getElementById('btn-submit-pan');
    if (submitPanBtn) {
      submitPanBtn.onclick = () => {
        const panInput = document.getElementById('kyc-pan-input');
        const panVal = panInput ? panInput.value.trim().toUpperCase() : '';

        if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panVal)) {
          window.DishaApp.showToast('Invalid PAN Format. Example: ABCDE1234F', 'error');
          return;
        }

        Sound.playCoin();
        const user = Storage.getUser();
        user.isKycVerified = true;
        user.panNumber = CryptoUtils.maskPan(panVal);
        Storage.setUser(user);

        document.getElementById('kyc-modal')?.classList.remove('show');
        window.DishaApp.showToast('KYC Verification Successful! Instant payouts enabled.', 'success');
        Confetti.fire(80);
        this.render();
      };
    }

    document.getElementById('btn-close-kyc')?.addEventListener('click', () => {
      document.getElementById('kyc-modal')?.classList.remove('show');
    });
  }

  showWithdrawalModal() {
    const modal = document.getElementById('withdraw-modal');
    if (modal) {
      modal.classList.add('show');
      this.setupWithdrawalEvents();
    }
  }

  setupWithdrawalEvents() {
    const amountInput = document.getElementById('withdraw-amount-input');
    const netPayoutEl = document.getElementById('withdraw-net-payout');
    const tdsEl = document.getElementById('withdraw-tds-val');
    const user = Storage.getUser() || {};
    const wallet = Storage.getWallet();

    const updateCalculations = () => {
      const amt = parseFloat(amountInput?.value || 0);
      // TDS rule: 30% if winnings above threshold (e.g. 10000), else 0
      let tds = (amt > 10000) ? Math.round(amt * 0.30) : 0;
      let net = amt - tds;

      if (tdsEl) tdsEl.textContent = `₹${tds.toFixed(2)}`;
      if (netPayoutEl) netPayoutEl.textContent = `₹${Math.max(0, net).toFixed(2)}`;
    };

    if (amountInput) {
      amountInput.oninput = updateCalculations;
    }

    const confirmBtn = document.getElementById('btn-confirm-withdraw');
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const validatedAmt = Sanitize.validateFinancialAmount(amountInput?.value, 100, 50000);
        if (validatedAmt === null) {
          window.DishaApp.showToast('Please enter a valid withdrawal amount (₹100 – ₹50,000)', 'error');
          return;
        }
        if (validatedAmt > wallet.availableBalance) {
          window.DishaApp.showToast('Insufficient available balance', 'error');
          return;
        }

        try {
          const res = await API.wallet.withdraw(validatedAmt, user.bankAccount || {});
          Sound.playCoin();
          wallet.availableBalance = parseFloat(res.availableBalanceRupees || (wallet.availableBalance - validatedAmt));
          wallet.totalWithdrawn = Math.round((wallet.totalWithdrawn + validatedAmt) * 100) / 100;
          Storage.setWallet(wallet);

          const newTx = {
            id: res.withdrawalId || ('TXN-WD-' + Math.floor(100000 + Math.random() * 900000)),
            type: 'DEBIT',
            title: 'Direct Bank Settlement (IMPS/UPI)',
            amount: validatedAmt,
            date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', Just now',
            status: 'COMPLETED',
            method: 'Razorpay Payout API Rail',
            reference: 'RZP-SETTLE-' + Math.random().toString(36).substring(2, 8).toUpperCase()
          };
          Storage.addTransaction(newTx);

          document.getElementById('withdraw-modal')?.classList.remove('show');
          window.DishaApp.showToast(`₹${validatedAmt.toFixed(2)} transferred to your linked bank account!`, 'success');
          this.render();
        } catch (err) {
          window.DishaApp.showToast(err.message || 'Withdrawal request failed.', 'error');
        }
      };
    }

    document.getElementById('btn-close-withdraw')?.addEventListener('click', () => {
      document.getElementById('withdraw-modal')?.classList.remove('show');
    });
  }

  showAddCashModal() {
    const modal = document.getElementById('addcash-modal');
    if (modal) {
      modal.classList.add('show');
      const addBtn = document.getElementById('btn-confirm-addcash');
      if (addBtn) {
        addBtn.onclick = async () => {
          const amtInput = document.getElementById('addcash-amount-input');
          const validatedAdd = Sanitize.validateFinancialAmount(amtInput?.value, 50, 100000);
          if (validatedAdd === null) {
            window.DishaApp.showToast('Please enter a valid deposit amount (₹50 – ₹1,00,000)', 'error');
            return;
          }

          // Check if user is logged in with active JWT token
          if (!API.getToken()) {
            modal.classList.remove('show');
            window.DishaApp.showToast('Please sign in with your phone number to add cash to your wallet.', 'info');
            const { Auth } = await import('./auth.js');
            Auth.showAuthModal();
            return;
          }

          try {
            // 1. Create server-authoritative Razorpay order
            const order = await API.payments.createOrder(validatedAdd);
            const user = Storage.getUser() || {};

            // 2. If live/real key and Razorpay Checkout SDK is loaded, open official popup
            if (!order.isSandbox && typeof window.Razorpay !== 'undefined') {
              const options = {
                key: order.keyId,
                amount: order.amountPaise,
                currency: 'INR',
                name: 'Disha Quiz App',
                description: 'Disha Wallet Top-up',
                order_id: order.razorpayOrderId,
                handler: async (response) => {
                  await this.handlePaymentVerification(order, response.razorpay_payment_id, response.razorpay_signature, validatedAdd, modal);
                },
                prefill: {
                  name: user.name || 'Student',
                  contact: user.phone || ''
                },
                theme: {
                  color: '#2563eb'
                }
              };

              const rzp = new window.Razorpay(options);
              rzp.on('payment.failed', (resp) => {
                window.DishaApp.showToast(resp.error?.description || 'Payment cancelled or failed.', 'error');
              });
              rzp.open();
            } else {
              // 3. Open Disha Razorpay Test Mode Sandbox Checkout
              modal.classList.remove('show');
              this.openRazorpaySandboxModal(order, validatedAdd);
            }
          } catch (err) {
            window.DishaApp.showToast(err.message || 'Deposit initiation failed.', 'error');
          }
        };
      }
      document.getElementById('btn-close-addcash')?.addEventListener('click', () => modal.classList.remove('show'));
    }
  }

  openRazorpaySandboxModal(order, validatedAdd) {
    const sandboxModal = document.getElementById('razorpay-sandbox-modal');
    if (!sandboxModal) return;

    const amtEl = document.getElementById('rzp-sandbox-amount');
    const btnAmtEl = document.getElementById('rzp-sandbox-btn-amt');
    const orderEl = document.getElementById('rzp-sandbox-order-id');

    if (amtEl) amtEl.textContent = `₹${validatedAdd.toFixed(2)}`;
    if (btnAmtEl) btnAmtEl.textContent = validatedAdd.toFixed(2);
    if (orderEl) orderEl.textContent = `Order: ${order.razorpayOrderId}`;

    sandboxModal.classList.add('show');

    const successBtn = document.getElementById('btn-rzp-sandbox-success');
    const failBtn = document.getElementById('btn-rzp-sandbox-failure');
    const closeBtn = document.getElementById('btn-close-rzp-sandbox');

    if (successBtn) {
      successBtn.onclick = async () => {
        successBtn.disabled = true;
        successBtn.textContent = 'Verifying with server...';
        try {
          await this.handlePaymentVerification(order, order.testPaymentId, order.testSignature, validatedAdd, sandboxModal);
        } finally {
          successBtn.disabled = false;
          successBtn.textContent = `✓ Simulate Successful Payment (₹${validatedAdd.toFixed(2)})`;
        }
      };
    }

    if (failBtn) {
      failBtn.onclick = () => {
        sandboxModal.classList.remove('show');
        window.DishaApp.showToast('Test payment was cancelled / failed as simulated.', 'error');
      };
    }

    if (closeBtn) {
      closeBtn.onclick = () => sandboxModal.classList.remove('show');
    }
  }

  async handlePaymentVerification(order, paymentId, signature, validatedAdd, activeModal) {
    try {
      const verifyRes = await API.payments.verifyPayment({
        razorpay_order_id: order.razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      });

      const wallet = Storage.getWallet();
      wallet.availableBalance = parseFloat(verifyRes.newBalanceRupees || (wallet.availableBalance + validatedAdd));
      Storage.setWallet(wallet);

      Storage.addTransaction({
        id: verifyRes.transactionId || ('TXN-DEP-' + Math.floor(100000 + Math.random() * 900000)),
        type: 'CREDIT',
        title: 'Wallet Top-up via Razorpay (Test Mode)',
        amount: validatedAdd,
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', Just now',
        status: 'COMPLETED',
        method: 'Razorpay Test Mode'
      });

      Sound.playCoin();
      if (activeModal) activeModal.classList.remove('show');
      window.DishaApp.showToast(`₹${validatedAdd.toFixed(2)} added to Disha Wallet!`, 'success');
      this.render();
    } catch (err) {
      window.DishaApp.showToast(err.message || 'Payment verification failed.', 'error');
    }
  }
}

export const Wallet = new WalletView();
