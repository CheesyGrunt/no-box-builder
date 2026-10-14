// Community Support Program Numbers - settings. Edit these in GitHub's web editor; Render redeploys on save.
window.GREAT_HALL_CONFIG = {
  year: 'auto',               // 'auto' = the year of the newest session in the reports. Put a number (like 2026) to pin a year.
  householdCap: 20,           // household sizes above this are treated as data-entry errors and left out of people totals

  // Salesforce reports, shown in the Kitchens with an "Open all reports" button.
  // Keys match the upload slots. Paste a new link here if a report moves.
  reports: [
    { slot: 'mvfdValue',      name: '2026 - MVFD Value/Pounds',          url: 'https://soldiersangels.lightning.force.com/lightning/r/Report/00OTR000008eSH72AM/view?queryScope=userFolders' },
    { slot: 'community',      name: '2026 Community Support',            url: 'https://soldiersangels.lightning.force.com/lightning/r/Report/00OTR000009K9Er2AK/view?queryScope=userFolders' },
    { slot: 'pantryValue',    name: '2026 - Pantry Total Value/Pounds',  url: 'https://soldiersangels.lightning.force.com/lightning/r/Report/00OTR000008Ot8P2AS/view?queryScope=userFolders' },
    { slot: 'pantryAttended', name: '2026 Pantry Attended Clients',      url: 'https://soldiersangels.lightning.force.com/lightning/r/Report/00OTR000008TbVp2AK/view?queryScope=userFolders' },
    { slot: 'stats',          name: '2026- MVFD Stats',                  url: 'https://soldiersangels.lightning.force.com/lightning/r/Report/00OTR000009dckz2AA/view?queryScope=userFolders' },
    { slot: 'mvfdAttended',   name: '2026 MVFD Attended Clients',        url: 'https://soldiersangels.lightning.force.com/lightning/r/Report/00OTR000008OsM12AK/view?queryScope=userFolders' },
    { slot: 'pantryStats',    name: '2026 Pantry Attended Client Stats', url: 'https://soldiersangels.lightning.force.com/lightning/r/Report/00OTR000009ddHF2AY/view?queryScope=userFolders' }
  ],

  // "Did you put in a ticket?" in the Kitchens emails all of these addresses
  recommendTo: ['cmackall@soldiersangels.org', 'cody.a.mackall@gmail.com'],

  // Where the Kitchens page publishes updates (your GitHub repo)
  github: {
    owner: 'CheesyGrunt',
    repo: 'sa-food-impact',
    branch: 'main'
  }
};
