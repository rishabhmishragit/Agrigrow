import { View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useCryo } from "../state/CryoProvider";
import { Banner } from "../components/ui";
import { LoginScreen } from "../features/auth/LoginScreen";
import {
  FarmerHome,
  FarmerParamList,
  ListingDetail,
  NewListing,
  NotificationsScreen,
  ProfileScreen,
  SettlementDetail,
  UssdScreen,
} from "../features/farmer/FarmerScreens";
import {
  LotDetailScreen,
  MarketScreen,
  OfftakerParamList,
  OfftakerProfile,
  OrderDetailScreen,
  OrdersScreen,
  RequirementsScreen,
} from "../features/offtaker/OfftakerScreens";
import {
  AgentJobs,
  AgentParamList,
  AgentProfile,
  InspectionScreen,
  RegisterFarmerScreen,
  SyncScreen,
} from "../features/agent/AgentScreens";
import { DriverParamList, DriverProfile, ManifestScreen, StopScreen } from "../features/driver/DriverScreens";
import { OpsConsole } from "../features/ops/OpsScreens";
import { colors } from "../theme";

const FarmerStack = createNativeStackNavigator<FarmerParamList>();
const OfftakerStack = createNativeStackNavigator<OfftakerParamList>();
const AgentStack = createNativeStackNavigator<AgentParamList>();
const DriverStack = createNativeStackNavigator<DriverParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.ink,
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: "700" as const, fontSize: 17, color: colors.ink },
  contentStyle: { backgroundColor: colors.bg },
};

export function RootNavigator() {
  const cryo = useCryo();
  if (!cryo.ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  return (
    <View style={{ flex: 1 }}>
      {cryo.offline ? (
        <Banner
          tone="offline"
          text="You are offline. Your changes have been saved and will sync automatically when connectivity returns."
        />
      ) : null}
      {cryo.error ? <Banner tone="danger" text={cryo.error} /> : null}
      {cryo.notice ? <Banner text={cryo.notice} /> : null}
      {!cryo.user ? <LoginScreen /> : null}
      {cryo.user?.role === "farmer" ? (
        <FarmerStack.Navigator screenOptions={screenOptions}>
          <FarmerStack.Screen name="FarmerHome" component={FarmerHome} options={{ title: "CryoChain" }} />
          <FarmerStack.Screen name="NewListing" component={NewListing} options={{ title: "List produce" }} />
          <FarmerStack.Screen name="ListingDetail" component={ListingDetail} options={{ title: "Listing" }} />
          <FarmerStack.Screen name="SettlementDetail" component={SettlementDetail} options={{ title: "Payment" }} />
          <FarmerStack.Screen name="Ussd" component={UssdScreen} options={{ title: "USSD" }} />
          <FarmerStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Messages" }} />
          <FarmerStack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
        </FarmerStack.Navigator>
      ) : null}
      {cryo.user?.role === "offtaker" ? (
        <OfftakerStack.Navigator screenOptions={screenOptions}>
          <OfftakerStack.Screen name="Market" component={MarketScreen} options={{ title: "Lots" }} />
          <OfftakerStack.Screen name="LotDetail" component={LotDetailScreen} options={{ title: "Lot" }} />
          <OfftakerStack.Screen name="Orders" component={OrdersScreen} options={{ title: "Orders" }} />
          <OfftakerStack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: "Order" }} />
          <OfftakerStack.Screen name="Requirements" component={RequirementsScreen} options={{ title: "Requirements" }} />
          <OfftakerStack.Screen name="Profile" component={OfftakerProfile} options={{ title: "Account" }} />
        </OfftakerStack.Navigator>
      ) : null}
      {cryo.user?.role === "field_agent" ? (
        <AgentStack.Navigator screenOptions={screenOptions}>
          <AgentStack.Screen name="Jobs" component={AgentJobs} options={{ title: "Jobs" }} />
          <AgentStack.Screen name="Inspection" component={InspectionScreen} options={{ title: "Grade and weigh" }} />
          <AgentStack.Screen name="Sync" component={SyncScreen} options={{ title: "Sync" }} />
          <AgentStack.Screen name="Register" component={RegisterFarmerScreen} options={{ title: "Register farmer" }} />
          <AgentStack.Screen name="Profile" component={AgentProfile} options={{ title: "Profile" }} />
        </AgentStack.Navigator>
      ) : null}
      {cryo.user?.role === "driver" ? (
        <DriverStack.Navigator screenOptions={screenOptions}>
          <DriverStack.Screen name="Manifest" component={ManifestScreen} options={{ title: "Manifest" }} />
          <DriverStack.Screen name="Stop" component={StopScreen} options={{ title: "Stop" }} />
          <DriverStack.Screen name="Profile" component={DriverProfile} options={{ title: "Profile" }} />
        </DriverStack.Navigator>
      ) : null}
      {cryo.user?.role === "ops" ? <OpsConsole /> : null}
    </View>
  );
}
