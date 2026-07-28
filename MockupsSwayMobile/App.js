import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { GamificationProvider } from './src/context/GamificationContext';
import CelebrationOverlay from './src/components/CelebrationOverlay';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <GamificationProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <AppNavigator />
          <CelebrationOverlay />
        </AuthProvider>
      </GamificationProvider>
    </SafeAreaProvider>
  );
}
