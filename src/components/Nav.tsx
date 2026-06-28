import { Platform, Pressable, Text, View, Linking } from 'react-native'

// Ported from /tmp/ncsw-real-source/apps/web/src/components/site.tsx (SiteHeader).
// Web DOM -> RN primitives: header/div -> View, span/a text -> Text, a/button -> Pressable.
// Style values are taken verbatim from the source; em letter-spacing is converted to
// RN points (em * fontSize), since RN letterSpacing is in points, not em.
// Note: this source's SiteHeader is static — it has no scroll listener or backdropFilter,
// so there is nothing of that kind to Platform-guard here. Its only translucency is the
// rgba(255,255,255,.9) header background, kept as-is.

const navItems: [string, string][] = [
  ['Packages', '/#packages'],
  ['Subwoofers', '/methodology/subwoofers'],
  ['Install Types', '/#install-types'],
  ['Editorial', '/#editorial'],
  ['Location', '/#location'],
]

function openHref(href: string) {
  // On web, navigate; on native, hand off to the OS (tel:, etc.).
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.href = href
  } else {
    Linking.openURL(href).catch(() => {})
  }
}

export function Nav() {
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: '#ececec', // var(--ncsw-line)
        backgroundColor: 'rgba(255,255,255,0.9)',
        ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 0, zIndex: 100 } as object) : null),
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 1410, // var(--ncsw-container-max)
          marginHorizontal: 'auto',
          paddingHorizontal: 24,
          minHeight: 72,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        {/* Logo */}
        <Pressable onPress={() => openHref('/')}>
          <Text
            style={{
              fontWeight: '900',
              letterSpacing: -1.1, // -.04em * 28
              fontSize: 28,
              color: '#09080e', // var(--ncsw-ink)
            }}
          >
            ncsw
          </Text>
        </Pressable>

        {/* Primary nav */}
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'center' }}>
          {navItems.map(([label, href]) => (
            <Pressable key={label} onPress={() => openHref(href)}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 1.3, // .12em * 11
                  textTransform: 'uppercase',
                  color: '#09080e',
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Call now — secondary pill button (.ncsw-button.secondary) */}
        <Pressable
          onPress={() => openHref('tel:+12165550114')}
          style={{
            minHeight: 38,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: '#09080e',
            borderRadius: 100, // var(--ncsw-radius-pill)
            paddingVertical: 9,
            paddingHorizontal: 18,
            backgroundColor: '#ffffff',
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.3, // .12em * 11
              textTransform: 'uppercase',
              color: '#09080e',
            }}
          >
            Call now
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
