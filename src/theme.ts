/** UI design tokens from spec §10.2 — dark tabletop aesthetic. */
export const colors = {
  primaryDark: '#0B0F19',   // Obsidian night
  cardBackground: '#161F30', // Midnight vault
  border: 'rgba(255, 255, 255, 0.08)', // Frost glass
  roleOutlaw: '#FF4B5C',    // Neon crimson
  roleTown: '#00E676',      // Electric jade
  roleDetective: '#2979FF', // Azure blue
  roleDoctor: '#1DE9B6',    // Teal safeguard
  brandGold: '#FFD700',     // Aathichoodi text accent
  text: '#FFFFFF',
  textDim: 'rgba(255, 255, 255, 0.6)',
} as const;

export const roleColor: Record<string, string> = {
  OUTLAW: colors.roleOutlaw,
  DETECTIVE: colors.roleDetective,
  DOCTOR: colors.roleDoctor,
  TOWN: colors.roleTown,
  UNASSIGNED: colors.textDim,
};
