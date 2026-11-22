// ═══════════════════════════════════════════════════════
// supabase-config.js — 駄菓子屋システム Supabase接続設定
// ═══════════════════════════════════════════════════════

var SUPABASE_URL  = 'https://wkaijkredavfjvfzunte.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrYWlqa3JlZGF2Zmp2Znp1bnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTE0NDMsImV4cCI6MjA5NjQ4NzQ0M30.mYqINQgl7t6TtFdzcAdrX08qHZ8RPNjkKJc04QKKi3s';

(function (global) {
  'use strict';
  if (typeof global.fetch !== 'function') return;

  var STORAGE_KEY = 'dagashi_anon_auth_v1';
  var _origFetch = global.fetch.bind(global);
  var _tokenPromise = null;

  function loadStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveStored(sess) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        access_token: sess.access_token,
        refresh_token: sess.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (sess.expires_in || 3600) - 60
      }));
    } catch (e) { }
  }

  async function ensureDagashiToken() {
    var cur = loadStored();
    var now = Math.floor(Date.now() / 1000);
    if (cur && cur.access_token && cur.expires_at && cur.expires_at > now) {
      return cur.access_token;
    }
    if (_tokenPromise) return _tokenPromise;

    _tokenPromise = (async function () {
      try {
        if (cur && cur.refresh_token) {
          var rr = await _origFetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
            body: JSON.stringify({ refresh_token: cur.refresh_token })
          });
          if (rr.ok) {
            var rd = await rr.json();
            if (rd && rd.access_token) { saveStored(rd); return rd.access_token; }
          }
        }
        var sr = await _origFetch(SUPABASE_URL + '/auth/v1/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
          body: JSON.stringify({})
        });
        if (sr.ok) {
          var sd = await sr.json();
          if (sd && sd.access_token) { saveStored(sd); return sd.access_token; }
        }
      } catch (e) {
        console.warn('DagashiShop anonymous auth failed:', e);
      } finally {
        _tokenPromise = null;
      }
      return SUPABASE_ANON;
    })();
    return _tokenPromise;
  }

  global.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (url.indexOf(SUPABASE_URL + '/rest/v1/') === 0) {
      var tok = await ensureDagashiToken();
      if (tok && tok !== SUPABASE_ANON) {
        var nextInit = Object.assign({}, init || {});
        if (nextInit.headers instanceof Headers) {
          var h = new Headers(nextInit.headers);
          h.set('Authorization', 'Bearer ' + tok);
          nextInit.headers = h;
        } else {
          nextInit.headers = Object.assign({}, nextInit.headers || {}, {
            Authorization: 'Bearer ' + tok
          });
        }
        return _origFetch(input, nextInit);
      }
    }
    return _origFetch(input, init);
  };

  // バックグラウンドで先に匿名トークンを取得しておく
  ensureDagashiToken();
})(window);
