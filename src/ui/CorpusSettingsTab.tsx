import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { CatalogModel } from "../models/manifest";
import { CatalogItemCard, CatalogRowState } from "./CatalogItemCard";
import { PersonalDocumentsManager } from "./PersonalDocumentsManager";

interface Props {
  corpusItems: CatalogModel[];
  getRow: (item: CatalogModel) => CatalogRowState;
  download: (item: CatalogModel) => void;
  remove: (item: CatalogModel) => void;
}

/**
 * Knowledge Base settings content: the app's downloadable corpus packs
 * (unchanged, lifted out of ModelSetupScreen for readability) plus
 * PersonalDocumentsManager (also reachable on its own from the drawer as
 * KnowledgeBaseScreen — same component, not duplicated).
 */
export function CorpusSettingsTab({ corpusItems, getRow, download, remove }: Props) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.sectionHeading}>Downloadable knowledge packs</Text>
      <FlatList
        data={corpusItems}
        keyExtractor={(m) => m.id}
        scrollEnabled={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <CatalogItemCard
            item={item}
            row={getRow(item)}
            isActive={getRow(item).present}
            onDownload={download}
            onUse={() => {}}
            onRemove={remove}
          />
        )}
      />

      <Text style={styles.sectionHeading}>Your documents</Text>
      <PersonalDocumentsManager />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeading: { color: "#fff", fontSize: 13, fontWeight: "700", marginHorizontal: 12, marginTop: 10 },
  list: { padding: 12, gap: 10 },
});
