import { Platform } from 'react-native';

const implementation = Platform.OS === 'web' ? require('./Lottie.web') : require('./Lottie.native');

export const LOTTIE = implementation.LOTTIE;
export const LottieSlot = implementation.LottieSlot;
export const WelcomeLottie = implementation.WelcomeLottie;
