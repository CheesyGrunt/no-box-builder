/* ============================================================
   Site settings. Edit this file, commit it, done.

   passwordHash  Leave as an empty string for no password.
                 To set one, open set-password.html, type the
                 password you want, and paste the generated line here.
   hint          Optional. Shown on the lock screen. Never put the
                 password itself here.
   ============================================================ */

window.NOBOX_CONFIG = {
  passwordHash: '',       // team password: everyone. Opens the list.
  adminHash: '',          // admin password: you. Unlocks Run new report.
  hint: '',

  /* Where the published list gets committed. Safe to put here, it is not a
     secret. Your access token is NEVER stored in this file. You type it into
     the builder page once and it stays in that browser. */
  github: {
    owner: '',                    // e.g. 'CheesyGrunt'
    repo:  '',                    // e.g. 'no-box-builder'
    branch:'main',
    path:  'data/latest.enc'
  }
};
