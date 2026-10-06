import { Platform } from 'react-native';

const GlassSurface = Platform.OS === 'web'
  ? require('./GlassSurface.web').GlassSurface
  : require('./GlassSurface.native').GlassSurface;

export default GlassSurface;
