import { FlatList, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { PROFESSIONAL_CATEGORIES, isProfessionalCategorySlug } from "@professionisti/shared";

export default function CategoryScreen() {
  const { categoria } = useLocalSearchParams<{ categoria: string }>();

  if (!categoria || !isProfessionalCategorySlug(categoria)) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text>Categoria non trovata.</Text>
      </View>
    );
  }

  const category = PROFESSIONAL_CATEGORIES.find((c) => c.slug === categoria)!;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>{category.label} vicino a te</Text>
      <Text style={{ marginTop: 8, marginBottom: 16 }}>
        Elenco professionisti in arrivo — ricerca per città e disponibilità.
      </Text>
      <FlatList
        data={category.subTags}
        keyExtractor={(tag) => tag}
        renderItem={({ item }) => <Text style={{ paddingVertical: 6 }}>{item}</Text>}
      />
    </View>
  );
}
