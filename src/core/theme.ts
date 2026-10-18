// NEXUS LUDO visual identity — shared palette for 3D + UI.
import type { PowerType, Seat } from '../game/types';

export interface SeatTheme {
  name: string;
  /** Primary neon hex. */
  color: string;
  /** Lighter glow / highlight. */
  glow: string;
  /** Deep shade for metal tint & gradients. */
  deep: string;
  /** Faction codename shown in UI. */
  faction: string;
}

export const SEAT_THEME: Record<Seat, SeatTheme> = {
  0: { name: 'CYAN', color: '#00f0ff', glow: '#8ffcff', deep: '#003a44', faction: 'NETRUNNERS' },
  1: { name: 'AMBER', color: '#ffb300', glow: '#ffe08a', deep: '#4a2c00', faction: 'SOLAR SYNDICATE' },
  2: { name: 'MAGENTA', color: '#ff2bd6', glow: '#ff9cf0', deep: '#4a0040', faction: 'NEON SAINTS' },
  3: { name: 'VIOLET', color: '#9d4dff', glow: '#cfa8ff', deep: '#24004a', faction: 'VOID COLLECTIVE' },
};

export const PALETTE = {
  bg: '#05030d',
  bgDeep: '#020108',
  metal: '#141826',
  metalLight: '#262c40',
  cyan: '#00f0ff',
  purple: '#9d4dff',
  magenta: '#ff2bd6',
  amber: '#ffb300',
  white: '#e8f6ff',
  danger: '#ff3355',
  safe: '#3dffa8',
} as const;

export const POWER_THEME: Record<PowerType, { label: string; color: string; icon: string; desc: string }> = {
  shield: { label: 'AEGIS SHIELD', color: '#3dffa8', icon: '⬡', desc: 'Collecting unit is immune to capture for 3 turns.' },
  boost: { label: 'OVERDRIVE', color: '#ffb300', icon: '⚡', desc: 'Add +2 to your current roll.' },
  reroll: { label: 'QUANTUM REROLL', color: '#00f0ff', icon: '↻', desc: 'Discard your roll and throw again.' },
  emp: { label: 'EMP PULSE', color: '#ff2bd6', icon: '✸', desc: 'Knock back enemies up to 4 cells ahead of your units by 4.' },
};
