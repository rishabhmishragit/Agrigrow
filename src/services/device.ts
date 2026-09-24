import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

export async function captureEvidence(): Promise<string | undefined> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  const launcher = permission.granted ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
  if (!permission.granted) {
    const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!library.granted) return undefined;
  }
  const result = await launcher({ mediaTypes: ["images"], quality: 0.4 });
  if (result.canceled || !result.assets?.[0]) return undefined;
  return result.assets[0].uri;
}

export async function readPosition(): Promise<{ latitude: number; longitude: number } | undefined> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") return undefined;
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
