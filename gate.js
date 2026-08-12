/* Lock screen. Loads before the app and hides the page until unlocked.
   The password itself is never stored anywhere, only a SHA-256 hash of it. */
(function(){

  /* --- SHA-256, pure JS so it works over file:// too --- */
  function sha256(msg){
    const K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

    const bytes = [];
    for (const ch of unescape(encodeURIComponent(msg))) bytes.push(ch.charCodeAt(0));
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);

    const rr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < bytes.length; i += 64){
      const w = new Array(64);
      for (let j = 0; j < 16; j++)
        w[j] = (bytes[i+j*4] << 24) | (bytes[i+j*4+1] << 16) | (bytes[i+j*4+2] << 8) | bytes[i+j*4+3];
      for (let j = 16; j < 64; j++){
        const s0 = rr(w[j-15],7) ^ rr(w[j-15],18) ^ (w[j-15] >>> 3);
        const s1 = rr(w[j-2],17) ^ rr(w[j-2],19) ^ (w[j-2] >>> 10);
        w[j] = (w[j-16] + s0 + w[j-7] + s1) | 0;
      }
      let [a,b,c,d,e,f,g,h] = H;
      for (let j = 0; j < 64; j++){
        const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[j] + w[j]) | 0;
        const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) | 0;
        h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
      }
      H = H.map((v, k) => (v + [a,b,c,d,e,f,g,h][k]) | 0);
    }
    return H.map(v => ('00000000' + (v >>> 0).toString(16)).slice(-8)).join('');
  }

  window.noboxHash = pw => sha256('no-box-builder::' + pw);

  const cfg = window.NOBOX_CONFIG || {};
  const which = window.NOBOX_GATE || 'team';           // 'team' | 'admin' | 'none'
  if (which === 'none') return;
  const need = which === 'admin' ? cfg.adminHash : cfg.passwordHash;
  if (!need) return;                                   // no password set, carry on

  try {
    if (sessionStorage.getItem('nobox-unlocked') === need) return;
    if (which === 'admin' && sessionStorage.getItem('nobox-admin') === need) return;
  } catch(e){}

  const style = document.createElement('style');
  style.textContent = `
    body.locked > *:not(#lock){display:none !important}
    #lock{position:fixed;inset:0;z-index:9999;background:#42101C;color:#fff;
      display:flex;align-items:center;justify-content:center;padding:24px;
      font-family:'IBM Plex Sans',-apple-system,'Segoe UI',sans-serif}
    #lock .box{width:100%;max-width:380px}
    #lock .eb{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.2em;
      text-transform:uppercase;color:#FFC72C;margin-bottom:12px}
    #lock h2{font-family:'Barlow Condensed','Arial Narrow',sans-serif;text-transform:uppercase;
      font-size:38px;line-height:.95;margin:0 0 8px;font-weight:700}
    #lock p{color:#E0CBCF;font-size:14px;margin:0 0 20px}
    #lock input{width:100%;padding:12px 14px;font-size:16px;border:1px solid rgba(255,255,255,.3);
      background:rgba(255,255,255,.08);color:#fff;margin-bottom:10px}
    #lock input:focus{outline:2px solid #FFC72C;border-color:#FFC72C}
    #lock button{width:100%;padding:12px;font-family:'Barlow Condensed','Arial Narrow',sans-serif;
      text-transform:uppercase;letter-spacing:.1em;font-size:17px;background:#FFC72C;
      color:#42101C;border:none;cursor:pointer;font-weight:600}
    #lock .err{color:#FFC72C;font-size:13px;min-height:20px;margin-top:10px}`;
  document.head.appendChild(style);

  function draw(){
    document.body.classList.add('locked');
    const lock = document.createElement('div');
    lock.id = 'lock';
    lock.innerHTML = `<div class="box">
      <div class="eb">Soldiers' Angels &nbsp;·&nbsp; Virtual Services</div>
      <h2>No Box Builder</h2>
      <p>${which === 'admin' ? 'Admin password required to run a new report.' : (cfg.hint ? String(cfg.hint).replace(/</g,'&lt;') : 'Enter the team password to continue.')}</p>
      <input type="password" id="lockPw" autocomplete="current-password" placeholder="Password" autofocus>
      <button id="lockGo">Unlock</button>
      <div class="err" id="lockErr"></div></div>`;
    document.body.appendChild(lock);

    const go = () => {
      const v = document.getElementById('lockPw').value;
      if (window.noboxHash(v) === need){
        try { sessionStorage.setItem('nobox-unlocked', need); } catch(e){}
        lock.remove();
        document.body.classList.remove('locked');
      } else {
        document.getElementById('lockErr').textContent = 'That password did not work.';
        document.getElementById('lockPw').select();
      }
    };
    document.getElementById('lockGo').addEventListener('click', go);
    document.getElementById('lockPw').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    document.getElementById('lockPw').focus();
  }

  if (document.body) draw();
  else document.addEventListener('DOMContentLoaded', draw);
})();
