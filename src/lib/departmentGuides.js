// Per-department, phase-by-phase playbooks shown in the My Tasks "Guide" modal.
// Each phase has a title + how-to body, optionally a `where` link and a
// `countKey` that maps to the live My Tasks list so we can show how many are
// waiting on that phase and mark which phase the person is currently on.
export const DEPT_GUIDES = {
  sponsorship: {
    label: 'Sponsorship',
    phases: [
      { title: 'Add any missing sponsors', body: 'Make sure every sponsor exists in the app first. On the Sponsors page, add each sponsor and upload its logo (SVG). A sponsor with no logo shows a ⚠ until you fix it.', where: '/sponsors', whereLabel: 'Open Sponsors' },
      { title: 'Flag the menus that need sponsors', body: 'Go through the event’s menus and flag every one that should carry sponsors. On an event, open the Sponsors tab and use the bulk tool to flag them. A flag stays until you verify that menu.' },
      { title: 'Attach the right sponsors', body: 'Open each flagged menu, read its items, and attach the correct sponsors (multi-select, set 1–3 lines). Double-check the right logos land on the right menus.', countKey: 'attach' },
      { title: 'Verify & check off', body: 'Once a menu’s sponsors are correct, hit “Mark checked” on it. That clears the flag and tells Food & Beverage the menu is ready to approve.', countKey: 'verify' },
    ],
  },
  food_bev: {
    label: 'Food & Beverage',
    phases: [
      { title: 'Add your menus', body: 'Create each menu under the event and add its items. You get an instant preview before anything syncs to Figma.' },
      { title: 'Proof the content', body: 'Check spelling and copy on every item. Run the AI review on each menu to catch typos, and set preset rules to enforce house style.' },
      { title: 'Wait for sponsors', body: 'Sponsorship verifies which menus carry sponsors. When they check a menu off, it moves into “Ready to approve” for you.' },
      { title: 'Final sweep + approve', body: 'On each “ready to approve” menu, do a last read and Approve it. Approving locks edits and the Figma frame. If approvers are required, they each sign; otherwise any one approver is enough.', countKey: 'readyToApprove' },
      { title: 'Hand off to print', body: 'Once Design exports and marks menus Complete, you’re notified and can open the ready-to-print page with the Dropbox links.', where: '/ready', whereLabel: 'Ready-to-print page' },
    ],
  },
  design: {
    label: 'Design',
    phases: [
      { title: 'Sync to Figma early', body: 'As soon as a menu has content, sync it to Figma with the plugin — sooner is better. Auto-fit handles spacing and recommends the size; then make any per-menu adjustments.' },
      { title: 'Keep Figma + app in step', body: 'If you change text on the Figma canvas, pull edits back to the app. If content changes in the app, the menu flags “Sync needed” — re-sync and refresh the preview.', countKey: 'needsSync' },
      { title: 'Sync the approved version', body: 'When Food & Beverage approves a menu, make sure Figma matches the approved content. If it shows “Sync approved version”, re-sync it — then it flips to “Ready to export”.', countKey: 'needsSync' },
      { title: 'Export the print files', body: 'For each “Ready to export” menu, export the SVG + PDF, drop them in the event’s prep folder, then upload the final print files to the print folder.', countKey: 'readyToExport' },
      { title: 'Mark Complete', body: 'Set the menu to Complete and paste the print-folder link — that notifies Food & Beverage the print files are ready.' },
    ],
  },
}
