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
    text: '#12352b',
    tint: '#15966b',

    // Core surfaces
    background: '#f7fbf8',
    foreground: '#12352b',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#12352b',

    // Primary action color (buttons, links, active states)
    primary: '#15966b',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e8f5ee',
    secondaryForeground: '#175b42',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#edf5f0',
    mutedForeground: '#71847a',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#d5f1df',
    accentForeground: '#146d4b',

    // Destructive actions (delete, error states)
    destructive: '#d94d4d',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#dcebe2',
    input: '#dcebe2',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 20,
};

export default colors;
