import { registerRootComponent } from 'expo';
import { registerGlobals } from '@livekit/react-native';

import App from './App';

registerGlobals();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
