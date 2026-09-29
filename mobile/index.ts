import { registerRootComponent } from 'expo';

import App from './src/App';

// registerRootComponent llama a AppRegistry.registerComponent('main', () => App)
// y prepara el entorno tanto en un development build como en producción.
registerRootComponent(App);
