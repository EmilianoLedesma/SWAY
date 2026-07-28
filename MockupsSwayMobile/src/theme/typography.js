import { Platform } from 'react-native';

const sfDisplay = Platform.select({
  ios: 'SF Pro Display',
  android: 'Poppins',
  default: 'Poppins',
});

const sfText = Platform.select({
  ios: 'SF Pro Text',
  android: 'Open Sans',
  default: 'Open Sans',
});

export const typography = {
  display: sfDisplay,
  body: sfText,
  mono: Platform.select({ ios: 'SF Mono', android: 'Menlo', default: 'Monaco' }),

  size: {
    xs: 11,
    sm: 12,
    md: 14,
    lg: 15,
    xl: 17,
    xxl: 22,
    hero: 32,
  },

  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
};
