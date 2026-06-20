// FILE: /apps/mobile/app/(app)/documents/upload.tsx

import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useAuthStore } from "@docchat/stores";
import { useDocumentStore } from "@docchat/stores";

export default function UploadScreen() {
  const session = useAuthStore((s) => s.session);
  const uploadDocument = useDocumentStore((s) => s.uploadDocument);

  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handlePick() {
    console.log(
      "[Upload] session:",
      session?.access_token ? "present" : "MISSING",
    ); // 👈
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/plain", "text/markdown"],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      if (!file) return;

      setFileName(file.name);
      setUploading(true);

      await uploadDocument(
        {
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType ?? "application/octet-stream",
        },
        session?.access_token,
      );

      Alert.alert("Success", `${file.name} uploaded successfully.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
        >
          <Text style={s.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Upload Document</Text>
      </View>

      <View style={s.content}>
        <Text style={s.emoji}>📄</Text>
        <Text style={s.title}>Choose a file</Text>
        <Text style={s.sub}>Supported formats: PDF, plain text, Markdown</Text>

        {fileName && !uploading && (
          <View style={s.fileChip}>
            <Text style={s.fileChipText} numberOfLines={1}>
              📎 {fileName}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.btn, uploading && s.btnDisabled]}
          onPress={handlePick}
          disabled={uploading}
        >
          {uploading ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <ActivityIndicator color="#FFFFFF" />
              <Text style={s.btnText}>Uploading…</Text>
            </View>
          ) : (
            <Text style={s.btnText}>Browse Files</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  backBtn: { color: "#818CF8", fontSize: 22, lineHeight: 28 },
  headerTitle: { color: "#F1F5F9", fontSize: 16, fontWeight: "600" },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: {
    color: "#F1F5F9",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  sub: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 32,
  },
  fileChip: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
    maxWidth: "100%",
  },
  fileChipText: { color: "#94A3B8", fontSize: 13 },
  btn: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
