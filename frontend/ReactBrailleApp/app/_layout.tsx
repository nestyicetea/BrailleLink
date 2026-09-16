import { Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import TopNav from './includes/topNav';
import BottomTabs from './includes/bottomTabs';
import { DisplayProvider } from '../context/DisplayContext';

export default function RootLayout() {
  const pathname = usePathname();
  const hideNavigationChrome =
    pathname === '/camera' ||
    pathname === '/translationPage' ||
    pathname.startsWith('/view-folder') ||
    pathname === '/settings' ||
    pathname === '/recents' ||
    pathname === '/recently-deleted' ||
    pathname === '/display';

  return (
    <DisplayProvider>
    <View style={{ flex: 1 }}>
      {!hideNavigationChrome && <TopNav />}
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      {!hideNavigationChrome && <BottomTabs />}
      <StatusBar style="auto" />
    </View>
    </DisplayProvider>
  );
}
