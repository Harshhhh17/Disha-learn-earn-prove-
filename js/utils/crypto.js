/* ==========================================================================
   Disha Cryptographic & Privacy Utilities (Web Crypto API)
   ==========================================================================
   Ensures passwords and security passcodes are NEVER stored in plaintext.
   Uses native browser crypto.subtle for secure SHA-256 hashing.
   ========================================================================== */

export const CryptoUtils = {
  /**
   * Generates a SHA-256 cryptographic hash of a string
   * @param {string} text Plaintext input
   * @param {string} salt Optional salt string
   * @returns {Promise<string>} Hexadecimal hash string
   */
  async hash(text, salt = 'disha_salt_2026') {
    if (!text) return '';
    try {
      const msgUint8 = new TextEncoder().encode(text + salt);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (err) {
      // Fallback simple bitwise hash if crypto.subtle is unavailable in legacy context
      let hash = 0;
      const salted = text + salt;
      for (let i = 0; i < salted.length; i++) {
        const char = salted.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      return 'fb_' + Math.abs(hash).toString(16);
    }
  },

  /**
   * Verifies if input text matches stored hash
   * @param {string} plainInput Plaintext password/passcode entered by user
   * @param {string} storedHash Stored cryptographic hash
   * @param {string} salt Optional salt string
   * @returns {Promise<boolean>} True if match
   */
  async verify(plainInput, storedHash, salt = 'disha_salt_2026') {
    if (!plainInput || !storedHash) return false;
    const computed = await this.hash(plainInput, salt);
    return computed === storedHash;
  },

  /**
   * Masks PAN number (e.g. ABCDE1234F -> ABCDE••••F)
   * @param {string} pan PAN string
   * @returns {string} Masked PAN
   */
  maskPan(pan) {
    if (!pan || pan.length < 10) return pan || '';
    return pan.substring(0, 5) + '••••' + pan.substring(9);
  },

  /**
   * Masks Phone number (e.g. +91 9876543210 -> +91 98••••••10)
   * @param {string} phone Phone string
   * @returns {string} Masked Phone
   */
  maskPhone(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      const start = digits.slice(-10, -8);
      const end = digits.slice(-2);
      return `+91 ${start}••••••${end}`;
    }
    return phone;
  },

  /**
   * Masks Email address (e.g. rohan.sharma@example.com -> r•••••a@example.com)
   * @param {string} email Email string
   * @returns {string} Masked Email
   */
  maskEmail(email) {
    if (!email || !email.includes('@')) return email || '';
    const [user, domain] = email.split('@');
    if (user.length <= 2) return `••@${domain}`;
    return `${user[0]}••••${user[user.length - 1]}@${domain}`;
  }
};
