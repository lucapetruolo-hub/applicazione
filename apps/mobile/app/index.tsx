import { FlatList, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { Button } from "@professionisti/ui";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "600" }}>Trova un professionista vicino a te</Text>
      <Text style={{ marginTop: 8, marginBottom: 16 }}>
        Idraulico, elettricista, imbianchino e altri servizi verificati nella tua città.
      </Text>
      <Button onPress={() => router.push("/cerca/idraulico")}>Cerca un idraulico</Button>
      <FlatList
        data={PROFESSIONAL_CATEGORIES}
        keyExtractor={(category) => category.slug}
        renderItem={({ item }) => (
          <Link href={`/cerca/${item.slug}`} style={{ paddingVertical: 12 }}>
            {item.label}
          </Link>
        )}
      />
    </View>
  );
}
