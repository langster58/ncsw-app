import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { IconChevron, IconChevronUp } from './Icon'
import { colors, fonts, tracking } from './tokens'

// DataTable — generic sortable, sticky-left-column, infinite-scroll table.
// Data-driven via columns config + rows array. Caller controls sort state.
//
//   <DataTable
//     columns={[
//       { key: 'price', label: 'Price', width: 108, stickyLeft: true, sort: 'price', render: (r) => <Mono>{dollars(r.price)}</Mono> },
//       { key: 'tier',  label: 'Tier',  width: 104, sort: 'tier',  render: (r) => <Text>{r.tier}</Text> },
//       …
//     ]}
//     rows={filtered}
//     rowKey={(r) => r.id}
//     sortKey={sortKey}
//     sortDir={sortDir}
//     onSort={(key) => …}
//     rowHeight={52}
//     headerHeight={38}
//     maxVisible={10}
//     onRowPress={(r) => …}
//   />

export type DataColumn<T> = {
  key: string
  label: string
  width: number
  stickyLeft?: boolean
  sort?: string
  render: (row: T) => React.ReactNode
}

type Props<T> = {
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  sortKey?: string
  sortDir?: 1 | -1
  onSort?: (key: string) => void
  rowHeight?: number
  headerHeight?: number
  maxVisible?: number
  pageSize?: number
  onRowPress?: (row: T) => void
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDir = 1,
  onSort,
  rowHeight = 52,
  headerHeight = 38,
  maxVisible = 10,
  pageSize = 40,
  onRowPress,
}: Props<T>) {
  const totalWidth = columns.reduce((a, c) => a + c.width, 0)
  const regionH = headerHeight + maxVisible * rowHeight
  const regionRef = useRef<any>(null)
  const [visible, setVisible] = useState(pageSize)

  useEffect(() => setVisible(pageSize), [rows, pageSize])

  const onScroll = useCallback(() => {
    const el = regionRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
      setVisible((v) => Math.min(rows.length, v + pageSize))
    }
  }, [rows.length, pageSize])

  const body = rows.slice(0, visible)

  return React.createElement(
    'div',
    {
      ref: regionRef,
      onScroll,
      style: { height: regionH, overflow: 'auto', width: '100%' },
    },
    <View style={{ width: totalWidth } as any}>
      {/* sticky header */}
      <View
        style={
          {
            flexDirection: 'row',
            height: headerHeight,
            position: 'sticky',
            top: 0,
            zIndex: 30,
            backgroundColor: colors.white,
            borderBottomWidth: 1,
            borderBottomColor: colors.borderStrong,
          } as any
        }
      >
        {columns.map((c) => {
          const sortable = !!c.sort && !!onSort
          const sty = c.stickyLeft
            ? ({ position: 'sticky', left: 0, zIndex: 31, backgroundColor: colors.white } as any)
            : {}
          return (
            <Pressable
              key={c.key}
              onPress={sortable ? () => onSort!(c.sort!) : undefined}
              style={{ width: c.width, paddingHorizontal: 14, justifyContent: 'center', ...sty }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text
                  style={
                    {
                      fontFamily: fonts.mono,
                      fontSize: 11,
                      fontWeight: '500',
                      letterSpacing: tracking.wide,
                      textTransform: 'uppercase',
                      color: colors.inkFaint,
                    } as any
                  }
                >
                  {c.label}
                </Text>
                {sortable && sortKey === c.sort ? (
                  sortDir === 1 ? (
                    <IconChevron size={12} color={colors.accent} />
                  ) : (
                    <IconChevronUp size={12} color={colors.accent} />
                  )
                ) : null}
              </View>
            </Pressable>
          )
        })}
      </View>

      {/* body rows */}
      {body.map((r, ri) => {
        const zebra = ri % 2 === 1
        const press = onRowPress ? () => onRowPress(r) : undefined
        return (
          <Pressable
            key={rowKey(r)}
            onPress={press}
            style={{
              flexDirection: 'row',
              height: rowHeight,
              backgroundColor: zebra ? '#fafbfc' : colors.white,
            }}
          >
            {columns.map((c) => (
              <View
                key={c.key}
                style={{
                  width: c.width,
                  paddingHorizontal: 14,
                  justifyContent: 'center',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                  ...(c.stickyLeft
                    ? ({
                        position: 'sticky',
                        left: 0,
                        zIndex: 10,
                        backgroundColor: zebra ? '#fafbfc' : colors.white,
                        boxShadow: '1px 0 0 ' + colors.line,
                      } as any)
                    : {}),
                }}
              >
                {c.render(r)}
              </View>
            ))}
          </Pressable>
        )
      })}
    </View>,
  )
}
