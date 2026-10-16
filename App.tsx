/**
 * Budget — a local-first, Mint-style budgeting app.
 *
 * @format
 */

import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootTabs } from './src/navigation/RootTabs';
import { AppDataProvider } from './src/context/AppDataContext';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppDataProvider>
        <NavigationContainer>
          <RootTabs />
        </NavigationContainer>
      </AppDataProvider>
    </SafeAreaProvider>
  );
}

export default App;
