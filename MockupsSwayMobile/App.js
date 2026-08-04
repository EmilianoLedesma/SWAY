import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { GamificationProvider } from './src/context/GamificationContext';
import { RealtimeProvider } from './src/context/RealtimeContext';
import CelebrationOverlay from './src/components/CelebrationOverlay';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RealtimeProvider>
          <GamificationProvider>
            <StatusBar style="dark" />
            <AppNavigator />
            <CelebrationOverlay />
          </GamificationProvider>
        </RealtimeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
