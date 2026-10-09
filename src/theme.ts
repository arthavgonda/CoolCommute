import { Appearance } from 'react-native';

export const isDarkTheme = Appearance.getColorScheme() === 'dark';
const lightColors = {
  bg: '#ffffff',
  glass: '#ffffff',
  glassBorder: 'rgba(139, 83, 101, 0.16)',
  button: '#e8bdca',
  buttonText: '#261b1f',
  text: '#211a1d',
  textDim: '#73666b',
  accent: '#a95f77',
  accentSoft: 'rgba(206, 144, 165, 0.16)',
  danger: '#bd594d',
};
const darkColors = {
  bg: '#141015',
  glass: 'rgba(239, 237, 222, 0.07)',
  glassBorder: 'rgba(239, 237, 222, 0.16)',
  button: '#c5d18a',
  buttonText: '#1a2018',
  text: '#f2f0e7',
  textDim: '#a6aca2',
  accent: '#c5d18a',
  accentSoft: 'rgba(197, 209, 138, 0.15)',
  danger: '#e58a72',
};
export const colors = isDarkTheme ? darkColors : lightColors;
export const radius = { card: 20, button: 40, input: 14 };
export const CARD_COUNT = 5;
export const CARD_SPRING = { damping: 12, stiffness: 110, mass: 1 };
