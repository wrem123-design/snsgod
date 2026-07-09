// 1) Safe globals before any RN module graph loads.
import './src/bootstrapGlobals';

// 2) Expo/RN registration (initializes core polyfills).
import { registerRootComponent } from 'expo';

// 3) Extra polyfills after RN is available.
import './src/polyfills';

import App from './src/App';

registerRootComponent(App);
