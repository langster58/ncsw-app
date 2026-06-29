import { Text, View } from 'react-native'

// Base / native variant. The dense web table lives in PackageTable.web.tsx and is
// selected automatically by Metro on web. Native shows a deferred placeholder so
// the shared import resolves on all platforms.

export function PackageTable() {
  return (
    <View style={{ paddingVertical: 48, paddingHorizontal: 24, alignItems: 'center' }}>
      <Text style={{ fontFamily: 'Inter', fontSize: 14, color: '#333333', textAlign: 'center' }}>
        Package table is available on web. The native layout is planned for a later session.
      </Text>
    </View>
  )
}
