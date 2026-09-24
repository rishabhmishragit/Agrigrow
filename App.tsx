import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CryoProvider } from "./src/state/CryoProvider";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <SafeAreaProvider>
      <CryoProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </CryoProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
