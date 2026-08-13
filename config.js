/* ============================================================
   Site settings.

   TESTING MODE. Both passwords are empty on purpose, so the site
   opens for anyone with the link while you get it working.

   Turn passwords on before staff or real member data:
     1. open set-password.html
     2. type a team password and an admin password
     3. paste the generated block over this whole file
     4. run the report again and publish, so the file is re-encrypted
        with the real password
   ============================================================ */

window.NOBOX_CONFIG = {
  passwordHash: '',       // team password. Empty = no sign in, list opens to anyone.
  adminHash: '',          // admin password. Empty = anyone who reaches the page can run a report.
  hint: '',

  /* Where the published list gets committed. Not secret.
     owner must be your GitHub USERNAME, not your display name. */
  github: {
    owner: 'CheesyGrunt',
    repo:  'no-box-builder',
    branch:'main',
    path:  'data/latest.enc'
  }
};
