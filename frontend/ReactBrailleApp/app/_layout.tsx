import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { usePathname } from 'expo-router';
import TopNav from './includes/topNav';
import BottomTabs from './includes/bottomTabs';

export default function RootLayout() {
  const pathname = usePathname();
  const hideNavigationChrome = pathname === '/camera' || pathname === '/translationPage' || pathname.startsWith('/view-folder');

  return (
    <View style={{ flex: 1 }}>
      {!hideNavigationChrome && <TopNav />}
      <View style={{ flex: 1 }}>
        <Stack>
          <Stack.Screen name="dashboard" options={{ headerShown: false }} />
          <Stack.Screen name="files" options={{ headerShown: false }} />
          <Stack.Screen name="camera" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="translationPage" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="view-folder" options={{ headerShown: false, presentation: 'card' }} />
        </Stack>
      </View>
      {!hideNavigationChrome && <BottomTabs />}
      <StatusBar style="auto" />
    </View>
  );
}