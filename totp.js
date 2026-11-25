/* ============================================================
   That Darkness — TOTP (RFC 6238), чистый JS, без зависимостей.
   Работает офлайн, в file://, без WebCrypto.
   Автор: NeWerMoRe
   ============================================================ */
(function (root) {
  "use strict";

  /* --- SHA-1 --- */
  function sha1(bytes) {
    var ml = bytes.length * 8;
    var withPad = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
    withPad.set(bytes);
    withPad[bytes.length] = 0x80;
    var dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 4, ml >>> 0, false);
    dv.setUint32(withPad.length - 8, Math.floor(ml / 4294967296) >>> 0, false);

    var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    var w = new Array(80);

    for (var i = 0; i < withPad.length; i += 64) {
      for (var j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
      for (j = 16; j < 80; j++) {
        var x = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
        w[j] = (x << 1) | (x >>> 31);
      }
      var a = h0, b = h1, c = h2, d = h3, e = h4;
      for (j = 0; j < 80; j++) {
        var f, k;
        if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        var t = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0;
        e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    var out = new Uint8Array(20), o = new DataView(out.buffer);
    o.setInt32(0, h0, false); o.setInt32(4, h1, false); o.setInt32(8, h2, false);
    o.setInt32(12, h3, false); o.setInt32(16, h4, false);
    return out;
  }

  /* --- HMAC-SHA1 --- */
  function hmac(keyBytes, msgBytes) {
    var block = 64;
    var k = keyBytes.length > block ? sha1(keyBytes) : keyBytes;
    var kp = new Uint8Array(block);
    kp.set(k);
    var ipad = new Uint8Array(block + msgBytes.length);
    var opad = new Uint8Array(block + 20);
    for (var i = 0; i < block; i++) { ipad[i] = kp[i] ^ 0x36; opad[i] = kp[i] ^ 0x5c; }
    ipad.set(msgBytes, block);
    var inner = sha1(ipad);
    opad.set(inner, block);
    return sha1(opad);
  }

  function b64ToBytes(b64) {
    var raw = atob(b64), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  /* --- TOTP --- */
  function hotp(key, counter, digits) {
    var msg = new Uint8Array(8), dv = new DataView(msg.buffer);
    dv.setUint32(0, Math.floor(counter / 4294967296), false);
    dv.setUint32(4, counter % 4294967296, false);
    var mac = hmac(key, msg);
    var off = mac[19] & 0x0f;
    var code = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
    var mod = Math.pow(10, digits);
    return String(code % mod).padStart(digits, "0");
  }

  /** Код на текущий момент. step — длина окна в секундах. */
  function totp(secretB64, opts) {
    opts = opts || {};
    var step = opts.step || 3600;                 // по умолчанию 1 час
    var digits = opts.digits || 8;
    var now = opts.now ? opts.now() : Date.now();
    var counter = Math.floor(now / 1000 / step);
    return hotp(b64ToBytes(secretB64), counter, digits);
  }

  /** Сколько секунд осталось до смены кода. */
  function remaining(step, now) {
    step = step || 3600;
    var t = Math.floor(((now || Date.now()) / 1000) % step);
    return step - t;
  }

  /** Сравнение без утечки по времени. */
  function same(a, b) {
    a = String(a); b = String(b);
    if (a.length !== b.length) return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  root.TOTP = { sha1: sha1, hmac: hmac, hotp: hotp, totp: totp, remaining: remaining, same: same, b64ToBytes: b64ToBytes };
})(typeof globalThis !== "undefined" ? globalThis : this);
