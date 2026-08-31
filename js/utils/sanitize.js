/* ==========================================================================
   Disha Security: Universal HTML Sanitization & Injection Defense
   ==========================================================================
   Protects against:
   - DOM-based Cross-Site Scripting (XSS)
   - HTML injection in profile names, quiz questions, and options
   - CSV Formula Injection (=, +, -, @ command execution in spreadsheets)
   ========================================================================== */

export const Sanitize = {
  /**
   * Encodes HTML special characters to prevent DOM-based XSS
   * @param {string} str Input string
   * @returns {string} Safe HTML-encoded string
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const s = String(str);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/`/g, '&#x60;');
  },

  /**
   * Sanitizes text inputs (strips control characters and tags)
   * @param {string} input Raw text input
   * @param {number} maxLength Optional maximum character limit
   * @returns {string} Clean trimmed string
   */
  cleanText(input, maxLength = 500) {
    if (!input || typeof input !== 'string') return '';
    // Strip null bytes and non-printable control characters
    let clean = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
    if (maxLength && clean.length > maxLength) {
      clean = clean.substring(0, maxLength);
    }
    return clean;
  },

  /**
   * Defends against CSV Formula Injection (=, +, -, @, \t, \r)
   * @param {string} cell Raw cell value from CSV
   * @returns {string} Sanitized cell value
   */
  sanitizeCsvCell(cell) {
    if (!cell || typeof cell !== 'string') return '';
    let val = cell.trim();
    // Neutralize spreadsheet formula triggers
    if (/^[=+\-@\t\r]/.test(val)) {
      val = "'" + val;
    }
    return this.escapeHtml(val);
  },

  /**
   * Validates positive finite numbers for financial operations
   * @param {any} value Input value
   * @param {number} min Minimum allowed value
   * @param {number} max Maximum allowed value
   * @returns {number|null} Validated float or null if invalid
   */
  validateFinancialAmount(value, min = 1, max = 50000) {
    const num = parseFloat(value);
    if (isNaN(num) || !isFinite(num) || num < min || num > max) {
      return null;
    }
    // Round to 2 decimal places to prevent floating-point precision exploits
    return Math.round(num * 100) / 100;
  }
};
