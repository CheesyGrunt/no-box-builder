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
  passwordHash: '993b149becc003454368476b6e7f1aa897b46b68dd1c0a06fc32b3acaed89f2e',
  adminHash: '02db35715383f3b0982ee56b885bea24c579ffec4048d60aa7e802befa49eee8',
  hint: '',
  github: {
    owner: 'CheesyGrunt',
    repo:  'no-box-builder',
    branch:'main',
    path:  'data/latest.enc'
  }
};
