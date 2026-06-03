import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, TextInput } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 3;

interface FileItem {
  id: string;
  name: string;
  count?: number;
}

export default function FilesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [files, setFiles] = useState<FileItem[]>([
    { id: '1', name: 'Documents', count: 12 },
    { id: '2', name: 'Images', count: 8 },
    { id: '3', name: 'Scans', count: 5 },
    { id: '4', name: 'Lessons', count: 15 },
    { id: '5', name: 'Reference', count: 3 },
    { id: '6', name: 'Archive', count: 7 },
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  const handleAddFolder = () => {
    const newFolder: FileItem = {
      id: Date.now().toString(),
      name: 'New Folder',
      count: 0,
    };
    setFiles([newFolder, ...files]);
  };

  const getFilteredAndSortedFiles = () => {
    let filtered = [...files];
    
    if (searchQuery) {
      filtered = filtered.filter(file =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    filtered.sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.name.localeCompare(b.name);
      } else {
        return b.name.localeCompare(a.name);
      }
    });
    
    return filtered;
  };

  const renderItem = (item: FileItem) => (
    <TouchableOpacity
      key={item.id}
      style={styles.gridItem}
      onPress={() => console.log('Open:', item.name)}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>📁</Text>
      </View>
      <Text style={styles.itemName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.itemCount}>{item.count} items</Text>
    </TouchableOpacity>
  );

  const renderAddFolderCard = () => (
    <TouchableOpacity
      key="add-folder"
      style={styles.gridItem}
      onPress={handleAddFolder}
      activeOpacity={0.7}
    >
      <View style={styles.addIconContainer}>
        <Text style={styles.addIcon}>+</Text>
      </View>
      <Text style={styles.addItemName}>New Folder</Text>
      <Text style={styles.addItemSubtext}>tap to create</Text>
    </TouchableOpacity>
  );

  const renderGrid = () => {
    const filteredFiles = getFilteredAndSortedFiles();
    const rows = [];
    const allItems = [{ isAddButton: true } as any, ...filteredFiles];
    
    for (let i = 0; i < allItems.length; i += 3) {
      const rowItems = allItems.slice(i, i + 3);
      rows.push(
        <View key={i} style={styles.row}>
          {rowItems.map((item) => {
            if (item.isAddButton) {
              return renderAddFolderCard();
            }
            return renderItem(item);
          })}
          {rowItems.length < 3 && 
            Array(3 - rowItems.length).fill(null).map((_, idx) => (
              <View key={`empty-${idx}`} style={styles.gridItem} />
            ))
          }
        </View>
      );
    }
    return rows;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#666666']}
            tintColor="#666666"
          />
        }
      >
        {/* Search & Filter Row */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color="#8E8E93" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="#C7C7CC"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>
          
          <TouchableOpacity 
            style={styles.filterButton} 
            onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            <View style={styles.filterButtonInner}>
              <Text style={styles.filterIcon}>
                A⇅Z
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Grid */}
        <View style={styles.gridContainer}>
          {renderGrid()}
        </View>

        {/* Empty State */}
        {getFilteredAndSortedFiles().length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyText}>No folders</Text>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingBottom: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    paddingVertical: 0,
  },
  filterButton: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonInner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
  },
  filterIcon: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    letterSpacing: 0.5,
  },
  gridContainer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  gridItem: {
    width: COLUMN_WIDTH,
    alignItems: 'center',
  },
  iconContainer: {
    width: COLUMN_WIDTH - 8,
    height: COLUMN_WIDTH - 8,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 34,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  itemCount: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 2,
  },
  addIconContainer: {
    width: COLUMN_WIDTH - 8,
    height: COLUMN_WIDTH - 8,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
  },
  addIcon: {
    fontSize: 32,
    color: '#8E8E93',
    fontWeight: '300',
  },
  addItemName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
    textAlign: 'center',
  },
  addItemSubtext: {
    fontSize: 10,
    color: '#C7C7CC',
    textAlign: 'center',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyIcon: {
    fontSize: 60,
    opacity: 0.3,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#C7C7CC',
  },
  bottomSpacing: {
    height: 30,
  },
});