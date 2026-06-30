import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { IconChevron, IconChevronUp } from './Icon'
import { colors, fonts, tracking } from './tokens'

// DataTable — generic sortable, sticky-left-column, optional infinite-scroll
// table. Data-driven via columns config + rows array. Caller controls sort
// state.
//
// Set `maxVisible` to cap the visible rows and enable an internal scroll
// region (sticky header against that scroll). Omit it to render all rows at
// natural height (sticky header against the page scroll).
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
  /** Cap visible rows and enable internal scroll. Omit to render all rows. */
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
  maxVisible,
  pageSize = 40,
  onRowPress,
}: Props<T>) {
  const totalWidth = columns.reduce((a, c) => a + c.width, 0)
  const scrollable = typeof maxVisible === 'number'
  const regionRef = useRef<any>(null)
  const [visible, setVisible] = useState(scrollable ? pageSize : rows.length)

  useEffect(() => {
    setVisible(scrollable ? pageSize : rows.length)
  }, [rows, pageSize, scrollable])

  const onScroll = useCallback(() => {
    if (!scrollable) return
    const el = regionRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
      setVisible((v) => Math.min(rows.length, v + pageSize))
    }
  }, [rows.length, pageSize, scrollable])

  const body = rows.slice(0, visible)

  const tableContent = (
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
      {body.map((r, ri) => (
        <DataRow
          key={rowKey(r)}
          row={r}
          columns={columns}
          rowHeight={rowHeight}
          zebra={ri % 2 === 1}
          onPress={onRowPress ? () => onRowPress(r) : undefined}
        />
      ))}
    </View>
  )

  if (!scrollable) return tableContent

  const regionH = headerHeight + maxVisible! * rowHeight
  return React.createElement(
    'div',
    {
      ref: regionRef,
      onScroll,
      style: { height: regionH, overflow: 'auto', width: '100%' },
    },
    tableContent,
  )
}

// One row + its hover-state plumbing. Hover bg has to be applied to the
// sticky-left cell too, otherwise it stays zebra/white while the rest of the
// row tints.
function DataRow<T>({
  row,
  columns,
  rowHeight,
  zebra,
  onPress,
}: {
  row: T
  columns: DataColumn<T>[]
  rowHeight: number
  zebra: boolean
  onPress?: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const baseBg = zebra ? '#fafbfc' : colors.white
  const bg = hovered ? colors.surfaceHoverNeutral : baseBg

  const hoverProps: any =
    Platform.OS === 'web'
      ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }
      : {}

  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      style={
        {
          flexDirection: 'row',
          height: rowHeight,
          backgroundColor: bg,
          cursor: onPress ? 'pointer' : 'default',
          transition: 'background-color 120ms ease',
        } as any
      }
    >
      {columns.map((c) => (
        <View
          key={c.key}
          style={
            {
              width: c.width,
              paddingHorizontal: 14,
              justifyContent: 'center',
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              ...(c.stickyLeft
                ? {
                    position: 'sticky',
                    left: 0,
                    zIndex: 10,
                    backgroundColor: bg,
                    boxShadow: '1px 0 0 ' + colors.line,
                    transition: 'background-color 120ms ease',
                  }
                : {}),
            } as any
          }
        >
          {c.render(row)}
        </View>
      ))}
    </Pressable>
  )
}
