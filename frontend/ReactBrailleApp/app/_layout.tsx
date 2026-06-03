import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import TopNav from './includes/topNav';
import BottomTabs from './includes/bottomTabs';

export default function RootLayout() {
  return (
    <View style={{ flex: 1 }}>
      <TopNav />
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="camera" />
          <Stack.Screen name="files" />
        </Stack>
      </View>
      <BottomTabs />
      <StatusBar style="auto" />
    </View>
  );
}