import { Redirect } from "expo-router";

// This is the entry point route "/".
export default function Index(): React.JSX.Element {
  return <Redirect href="/(auth)/login" />;
}
