/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#29153f',
    tint: '#603085',

    // Core surfaces
    background: '#fcfaff',
    foreground: '#29153f',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#29153f',

    // Primary action color (buttons, links, active states)
    primary: '#603085',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#f0e8f7',
    secondaryForeground: '#603085',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#f3eef7',
    mutedForeground: '#7d7085',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#fff0b8',
    accentForeground: '#603085',

    // Destructive actions (delete, error states)
    destructive: '#d94d4d',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#e5d9ed',
    input: '#e5d9ed',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 20,
};

export default colors;
