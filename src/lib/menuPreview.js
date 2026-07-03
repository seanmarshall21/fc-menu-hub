// The image to show for a menu preview anywhere in the app.
//
// Prefer the rendered print-PDF preview — the authoritative final artwork,
// generated (by the pdf-preview pipeline) for complete menus that have a print
// file — and fall back to the Figma-synced preview otherwise. This keeps tiles,
// the event gallery, exports, and public share links all showing what actually
// goes to print once a menu is finalized.
export function menuPreviewSrc(menu) {
  if (!menu) return null
  return menu.print_preview_url || menu.preview_image_url || null
}
