/* Shared admin helpers: data file paths, the admin keyring, the saved GitHub token, and publishing. */
(function () {
  'use strict';
  var VAULT = 'cspn.tokenVault';
  var PATHS = { hall: 'data/hall.enc.json', keys: 'data/keys.enc.json' };
  var LEGACY = ['data/summary.json', 'data/roster.enc.json'];   // old unencrypted layout, removed on publish

  function getJSON(path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function loadVault() { try { return JSON.parse(localStorage.getItem(VAULT) || 'null'); } catch (e) { return null; } }
  function saveVault(box) { try { localStorage.setItem(VAULT, JSON.stringify(box)); return true; } catch (e) { return false; } }
  function forgetVault() { try { localStorage.removeItem(VAULT); } catch (e) {} }

  // Use the typed token, or unlock the saved one with the admin password. Optionally save a typed token.
  function resolveToken(typed, adminPass, remember) {
    if (typed) {
      var p = remember ? GreatHall.seal({ token: typed }, adminPass).then(saveVault) : Promise.resolve();
      return p.then(function () { return typed; });
    }
    var v = loadVault();
    if (!v) return Promise.reject(new Error('Paste a GitHub token (the README shows how to make one).'));
    return GreatHall.unseal(v, adminPass).then(function (o) { return o.token; })
      .catch(function () { throw new Error('The saved token did not unlock with the admin password. Paste the token again.'); });
  }

  function b64utf8(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function api(token, url, opts) {
    opts = opts || {};
    opts.headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    return fetch('https://api.github.com' + url, opts);
  }
  function fail(path, r) { return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(path + ': ' + (j.message || ('GitHub said ' + r.status))); }); }
  function sha(token, repo, branch, path) {
    return api(token, '/repos/' + repo + '/contents/' + path + '?ref=' + encodeURIComponent(branch))
      .then(function (r) { return r.status === 404 ? null : r.ok ? r.json().then(function (j) { return j.sha; }) : fail(path, r); });
  }
  function putFile(token, repo, branch, path, content, message) {
    return sha(token, repo, branch, path).then(function (s) {
      var body = { message: message, content: b64utf8(content), branch: branch };
      if (s) body.sha = s;
      return api(token, '/repos/' + repo + '/contents/' + path, { method: 'PUT', body: JSON.stringify(body) });
    }).then(function (r) { if (!r.ok) return fail(path, r); });
  }
  function deleteFile(token, repo, branch, path, message) {
    return sha(token, repo, branch, path).then(function (s) {
      if (!s) return;
      return api(token, '/repos/' + repo + '/contents/' + path, { method: 'DELETE', body: JSON.stringify({ message: message, sha: s, branch: branch }) })
        .then(function (r) { if (!r.ok) return fail(path, r); });
    });
  }

  // files: { path: string content }. Also clears out the old unencrypted files.
  function publish(token, repo, branch, files, message, onStep) {
    var paths = Object.keys(files);
    return paths.reduce(function (p, path) {
      return p.then(function () { onStep && onStep('Sending ' + path + '...'); return putFile(token, repo, branch, path, files[path], message); });
    }, Promise.resolve()).then(function () {
      return LEGACY.reduce(function (p, path) { return p.then(function () { return deleteFile(token, repo, branch, path, 'Remove old unencrypted data file'); }); }, Promise.resolve());
    });
  }

  function download(files) {
    Object.keys(files).forEach(function (p) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([files[p]], { type: 'application/json' }));
      a.download = p.split('/').pop(); document.body.appendChild(a); a.click(); a.remove();
    });
  }

  function checkPair(a, b, label) {
    if (!a) throw new Error('Enter the ' + label + '.');
    if (a !== b) throw new Error('The two ' + label + ' boxes do not match.');
    return a;
  }

  window.HallAdmin = { PATHS: PATHS, getJSON: getJSON, loadVault: loadVault, saveVault: saveVault, forgetVault: forgetVault, resolveToken: resolveToken, publish: publish, download: download, checkPair: checkPair };
})();
