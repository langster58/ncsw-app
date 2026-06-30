// Design-system review page — one route, every primitive, all variants.
// Navigate to /components on the deployed site.
//
// Organized as Atoms → Molecules → Components, mirroring src/ui/.

import React, { useState } from 'react'
import { Image as RNImage, Platform, ScrollView, Text, View } from 'react-native'
import {
  Accordion,
  Button,
  Card,
  Chip,
  Container,
  DataColumn,
  DataTable,
  Dropdown,
  Eyebrow,
  FilterChipGroup,
  FilterTriggerButton,
  Footer,
  Heading,
  IconArrow,
  IconCheck,
  IconChevron,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconClose,
  Image,
  Lead,
  Link,
  Modal,
  NavBar,
  PriceRangeSlider,
  ScoreMeter,
  Section,
  SectionIntro,
  Tag,
  colors,
  fonts,
  space,
} from '@/ui'

// Mono is a font spec, not a primitive — render inline with the mono token.
const MONO_SIZES = { sm: 11, md: 14, lg: 17 } as const
function Mono({
  children,
  size = 'md',
  tone = 'ink',
}: {
  children: React.ReactNode
  size?: keyof typeof MONO_SIZES
  tone?: 'ink' | 'gray' | 'accent'
}) {
  const color = tone === 'gray' ? colors.gray : tone === 'accent' ? colors.accent : colors.ink
  return (
    <Text style={{ fontFamily: fonts.mono, fontSize: MONO_SIZES[size], fontWeight: '500', color }}>
      {children}
    </Text>
  )
}

// ── Page chrome (just for this review page) ───────────────────────────────
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 56 }}>
      <Text
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 0.88,
          textTransform: 'uppercase',
          color: colors.inkFaint,
          marginBottom: 12,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 12,
          padding: 28,
          backgroundColor: colors.white,
          gap: 20,
        }}
      >
        {children}
      </View>
    </View>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
      {children}
    </View>
  )
}

// Small label/value spec strip used in the build-log card demo. Not a
// general primitive — kept inline so the demo can show what a real
// build-log card body looks like alongside the headline + lede.
function BuildSpecs({ items }: { items: [string, string][] }) {
  return (
    <View
      style={
        (Platform.OS === 'web'
          ? {
              display: 'grid',
              gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
              gap: 16,
              paddingTop: 4,
            }
          : { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 4 }) as any
      }
    >
      {items.map(([label, value]) => (
        <View key={label} style={{ gap: 6 }}>
          <Text
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: '600',
              letterSpacing: 1.2, // .12em @ 10
              textTransform: 'uppercase',
              color: colors.inkFaint,
            }}
          >
            {label}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.ink }}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

// One ScoreMeter wired to a live slider — proves the bar+value track the
// `value` prop. There aren't multiple meter variants; just one component.
function ScoreMeterDemo() {
  const [value, setValue] = useState(57)
  return (
    <View style={{ gap: 16 }}>
      <ScoreMeter value={value} />
      {Platform.OS === 'web'
        ? React.createElement('input', {
            type: 'range',
            min: 0,
            max: 100,
            value,
            onChange: (e: any) => setValue(Number(e.target.value)),
            style: { width: 220, accentColor: colors.accent },
          })
        : (
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.inkFaint }}>
              Slider available on web
            </Text>
          )}
    </View>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: fonts.display,
        fontSize: 36,
        fontWeight: '800',
        letterSpacing: -0.72,
        color: colors.ink,
        marginTop: 64,
        marginBottom: 24,
        paddingTop: 24,
        borderTopWidth: 1,
        borderTopColor: colors.ink,
      }}
    >
      {children}
    </Text>
  )
}

export default function ComponentsPage() {
  // Interactive states
  const [chipSize, setChipSize] = useState('all')
  const [price, setPrice] = useState(3000)
  const [priceHi, setPriceHi] = useState(5000)
  const [dropdownValue, setDropdownValue] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [filterCount, setFilterCount] = useState(2)

  // Sample table data
  type Row = { id: number; price: number; tier: string; vscore: number; sub: string }
  const tableRows: Row[] = [
    { id: 1, price: 1690, tier: 'Entry', vscore: 40, sub: 'Crescendo Forte v2 10' },
    { id: 2, price: 1740, tier: 'Entry', vscore: 57, sub: 'NVX VCW v3 10' },
    { id: 3, price: 1950, tier: 'Entry', vscore: 55, sub: 'Crescendo Forte v2 12' },
    { id: 4, price: 1990, tier: 'Mid', vscore: 56, sub: 'Sundown SA Classic 10' },
    { id: 5, price: 2350, tier: 'Mid', vscore: 52, sub: 'Skar EVL 12' },
  ]
  const tableCols: DataColumn<Row>[] = [
    { key: 'price', label: 'Price', width: 108, stickyLeft: true, sort: 'price', render: (r) => <Mono>{'$' + r.price.toLocaleString()}</Mono> },
    { key: 'tier', label: 'Tier', width: 104, sort: 'tier', render: (r) => <Mono tone="gray">{r.tier}</Mono> },
    { key: 'vscore', label: 'Value Score', width: 140, sort: 'vscore', render: (r) => <ScoreMeter value={r.vscore} /> },
    { key: 'sub', label: 'Subwoofer', width: 220, render: (r) => <Mono tone="gray">{r.sub}</Mono> },
  ]
  const [tableSortKey, setTableSortKey] = useState('price')
  const [tableSortDir, setTableSortDir] = useState<1 | -1>(1)
  const sortedRows = [...tableRows].sort((a, b) => {
    const av = (a as any)[tableSortKey]
    const bv = (b as any)[tableSortKey]
    if (av < bv) return -1 * tableSortDir
    if (av > bv) return 1 * tableSortDir
    return 0
  })

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fafafa' }} contentContainerStyle={{ flexGrow: 1 }}>
      <Section>
        <Container>
          <Text
            style={{
              fontFamily: fonts.display,
              fontSize: 56,
              fontWeight: '800',
              letterSpacing: -1.12,
              color: colors.ink,
            }}
          >
            Design system
          </Text>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 17,
              lineHeight: 27,
              color: colors.body,
              marginTop: 12,
              maxWidth: 640,
            }}
          >
            Every primitive in <Mono>src/ui</Mono>, organized as atoms, molecules, and components.
            Each section shows every variant + state. Edit a token in <Mono>tokens.ts</Mono> and
            everything below cascades.
          </Text>

          {/* ============ ATOMS ============ */}
          <GroupHeading>Atoms</GroupHeading>

          <Block title="Icon">
            <Row>
              <IconCell label="arrow"><IconArrow size={20} /></IconCell>
              <IconCell label="chevron"><IconChevron size={20} /></IconCell>
              <IconCell label="chevronUp"><IconChevronUp size={20} /></IconCell>
              <IconCell label="chevronLeft"><IconChevronLeft size={20} /></IconCell>
              <IconCell label="chevronRight"><IconChevronRight size={20} /></IconCell>
              <IconCell label="close"><IconClose size={20} /></IconCell>
              <IconCell label="check"><IconCheck size={20} /></IconCell>
            </Row>
          </Block>

          <Block title="Image">
            <Row>
              <View style={{ width: 220, height: 124, overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: colors.line }}>
                <Image src="/images/pattern-reference.png" fill objectFit="cover" alt="pattern-reference" />
              </View>
              <View style={{ width: 220, height: 124, overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: colors.line }}>
                <Image src="/images/pattern-floor.png" fill objectFit="cover" alt="pattern-floor" />
              </View>
              <View style={{ width: 220, height: 124, overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: colors.line }}>
                <Image src="/images/pattern-frontstage.png" fill objectFit="cover" alt="pattern-frontstage" />
              </View>
            </Row>
          </Block>

          <Block title="Heading">
            <Heading level="h2">H2 — section large</Heading>
            <Heading level="h2sm">H2sm — section small</Heading>
            <Heading level="h3">H3 — sub-heading</Heading>
            <Heading level="h4">H4 — card title</Heading>
          </Block>

          <Block title="Lead (paragraph)">
            <Lead size="heroLead">Hero lede — 22px reference. Used in the hero block to introduce the brand statement.</Lead>
            <Lead size="lead">Section lede — 17px reference. Used under section headings to introduce content.</Lead>
            <Lead size="body">Body — 15px reference, 14px floor (WCAG). Used inside cards and dense copy.</Lead>
          </Block>

          <Block title="Eyebrow">
            <Row>
              <Eyebrow tone="gray">Section label</Eyebrow>
              <Eyebrow tone="accent">Accent kicker</Eyebrow>
              <Eyebrow tone="ink">Ink label</Eyebrow>
            </Row>
          </Block>

          <Block title="Button">
            <Row>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
            </Row>
            <Row>
              <Button variant="primary" disabled>Disabled primary</Button>
              <Button variant="secondary" disabled>Disabled secondary</Button>
            </Row>
          </Block>

          <Block title="Chip">
            <Row>
              <Chip>Default</Chip>
              <Chip selected>Selected</Chip>
              <Chip variant="pick">NCSW Pick</Chip>
              <Chip disabled>Disabled</Chip>
            </Row>
          </Block>

          <Block title="Link">
            <Row>
              <Link variant="nav" href="#">Nav link</Link>
              <Link variant="text" href="#">Text link</Link>
              <Link variant="door" href="#" icon={<IconArrow size={15} />}>Door link</Link>
              <Link variant="cta" href="#">CTA link</Link>
            </Row>
          </Block>

          {/* ============ MOLECULES ============ */}
          <GroupHeading>Molecules</GroupHeading>

          <Block title="SectionIntro">
            <SectionIntro
              index="06"
              label="Editorial"
              heading="We publish the reasoning."
              body="Every engineering call we make, from which subwoofer to how much amplifier to why a DSP, comes from measurement, not opinion."
            />
          </Block>

          <Block title="SectionIntro — with action">
            <SectionIntro
              index="04"
              label="Sub-stage"
              heading="Sub-stage fabrication & alignment"
              body="The sub-stage is defined as much by where the driver lives as by the driver itself."
              actionLabel="All alignments"
              actionHref="#"
            />
          </Block>

          <Block title="Tag">
            <Row>
              <Tag tone="dark">SUV · HATCH · WAGON</Tag>
              <Tag tone="light">SUV · HATCH · WAGON</Tag>
            </Row>
          </Block>

          <Block title="FilterChipGroup">
            <FilterChipGroup
              label="Size"
              value={chipSize}
              options={['all', '8', '10', '12', '15', '18']}
              onChange={setChipSize}
              renderOption={(o) => (o === 'all' ? 'All' : o + '"')}
            />
          </Block>

          <Block title="PriceRangeSlider">
            <PriceRangeSlider
              min={1500}
              max={6000}
              lo={price}
              hi={priceHi}
              onChange={(a, b) => {
                setPrice(a)
                setPriceHi(b)
              }}
            />
          </Block>

          <Block title="FilterTriggerButton">
            <Row>
              <FilterTriggerButton onPress={() => setFilterCount(filterCount + 1)} />
              <FilterTriggerButton activeCount={filterCount} onPress={() => setFilterCount(0)} />
            </Row>
          </Block>

          <Block title="ScoreMeter">
            <ScoreMeterDemo />
          </Block>

          <Block title="Dropdown">
            <Row>
              <View style={{ width: 220 }}>
                <Dropdown
                  label="Year"
                  value={dropdownValue}
                  options={['2024', '2023', '2022', '2021', '2020']}
                  onChange={setDropdownValue}
                  placeholder="Select year"
                />
              </View>
              <View style={{ width: 220 }}>
                <Dropdown
                  label="Make"
                  value=""
                  options={['Acura', 'BMW', 'Volkswagen']}
                  onChange={() => {}}
                  placeholder="Select make"
                  disabled
                />
              </View>
            </Row>
          </Block>

          {/* ============ COMPONENTS ============ */}
          <GroupHeading>Components</GroupHeading>

          <Block title="Container + Section">
            <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkFaint, marginBottom: 12 }}>
              Layout primitives — this entire review page uses them.
            </Text>
            <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 16, backgroundColor: colors.surface }}>
              <Mono size="sm" tone="gray">
                Full-bleed (no max-width) · gutters clamp(22, 2.083vw, 56) · section padding-top clamp(56, 5vw, 128) — all anchored at 1920px
              </Mono>
            </View>
          </Block>

          <Block title="Card — stack layout (image top)">
            <View
              style={
                (Platform.OS === 'web'
                  ? {
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: 24,
                    }
                  : { flexDirection: 'column', gap: 24 }) as any
              }
            >
              {[0, 1, 2].map((i) => (
                <Card key={i}>
                  <Card.Media aspectRatio={16 / 11}>
                    <Image src="/images/pattern-reference.png" fill objectFit="cover" alt="" />
                    <Card.MediaTag>SUV · HATCH · WAGON</Card.MediaTag>
                  </Card.Media>
                  <Card.Body>
                    <Heading level="h4">Cargo Infinite Baffle</Heading>
                    <Lead size="body">
                      The driver mounts to a baffle in the cargo floor and fires through it, using the
                      space behind the seats as a free-air enclosure.
                    </Lead>
                  </Card.Body>
                  <Card.Footer>
                    <Link variant="door" href="#" icon={<IconArrow size={15} />}>See the alignment</Link>
                  </Card.Footer>
                </Card>
              ))}
            </View>
            <Mono size="sm" tone="gray">Card is a single component; shown three-up here so the grid behavior is visible.</Mono>
          </Block>

          <Block title="Card — split layout (build log)">
            <Card layout="split">
              <Card.Media aspectRatio={4 / 3}>
                <Image src="/images/build-golf-alltrack.jpg" fill objectFit="cover" alt="" />
                <Card.MediaTag>IN THE BAY · 2018 GOLF ALLTRACK</Card.MediaTag>
              </Card.Media>
              <Card.Body gap={20}>
                <Eyebrow>2018 VW Golf Alltrack · Infinite-baffle build</Eyebrow>
                <Heading level="h3">Reference-tier bass that keeps the cargo floor flat.</Heading>
                <Lead size="body">
                  No enclosure: a single Adire Kali 18 mounts infinite-baffle, using the cargo area
                  as its back chamber for effortless, low-distortion extension.
                </Lead>
                <BuildSpecs
                  items={[
                    ['Vehicle', '2018 Alltrack'],
                    ['Driver', 'Adire Kali 18'],
                    ['Topology', 'Infinite-baffle'],
                  ]}
                />
              </Card.Body>
              <Card.Footer>
                <Link variant="door" href="#" icon={<IconArrow size={15} />}>Read the build</Link>
              </Card.Footer>
            </Card>
          </Block>

          <Block title="Modal">
            <Button variant="primary" onPress={() => setModalOpen(true)}>
              Open modal
            </Button>
            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Modal preview">
              <Modal.Body>
                <Heading level="h4">This is the Modal primitive.</Heading>
                <Lead size="body">
                  Full-screen overlay portaled to document.body. Backdrop click closes, ESC closes,
                  body scroll locks while open. Slots: Modal.Body (scrollable), Modal.Footer
                  (sticky).
                </Lead>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onPress={() => setModalOpen(false)}>Done</Button>
              </Modal.Footer>
            </Modal>
          </Block>

          <Block title="Accordion">
            <Accordion mode="single" defaultOpen={0}>
              <Accordion.Item
                index="01"
                title="Expert Installation Technician"
              >
                MECP's installation track runs Skilled, Advanced, Expert, Master. The Expert tier
                tests advanced wiring and fabrication, OEM interface work, and diagnosing the faults
                other installs leave behind.
              </Accordion.Item>
              <Accordion.Item index="02" title="Autosound Specialist">
                Coverage of car audio fundamentals, frequency response, system tuning, and the
                listening-test methodology behind matching components.
              </Accordion.Item>
              <Accordion.Item index="03" title="Product Technology Specialist">
                Deeper-tier exam on components — driver design, amplifier classes, DSP topologies,
                source signal integrity.
              </Accordion.Item>
            </Accordion>
          </Block>

          <Block title="NavBar">
            <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, overflow: 'hidden' }}>
              <View style={{ height: 56, backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: '800', color: colors.ink }}>NCSW</Text>
                <View style={{ flexDirection: 'row', gap: 24 }}>
                  <Link variant="nav" href="#">Packages</Link>
                  <Link variant="nav" href="#">Editorial</Link>
                  <Link variant="nav" href="#">Location</Link>
                </View>
                <NavBar.Phone number="(216) 555-0114" />
              </View>
            </View>
            <Mono size="sm" tone="gray">
              Slots: Brand · Menu · Phone. On web the Phone slot renders as plain styled text (tel: anchor — no button chrome). On native it renders a Button that opens the system dialer via Linking.
            </Mono>
          </Block>

          <Block title="Footer">
            <View style={{ borderRadius: 8, overflow: 'hidden' }}>
              <View style={{ backgroundColor: colors.ink, padding: 32 }}>
                <View style={{ flexDirection: 'row', gap: 32, marginBottom: 32 }}>
                  <View style={{ flex: 1.4 }}>
                    <Text style={{ color: colors.white, fontFamily: fonts.display, fontWeight: '800', fontSize: 22 }}>NCSW</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.78)', marginTop: 12, fontSize: 14, lineHeight: 22 }}>
                      Cleveland's MECP-certified car-audio installation specialist.
                    </Text>
                  </View>
                  {['Systems', 'Read', 'Shop'].map((h) => (
                    <View key={h} style={{ flex: 1, gap: 12 }}>
                      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1.32 }}>{h}</Text>
                      {['Packages', 'Subwoofers', 'Editorial'].map((l) => (
                        <Text key={l} style={{ color: 'rgba(255,255,255,0.78)', fontSize: 14 }}>{l}</Text>
                      ))}
                    </View>
                  ))}
                </View>
                <View style={{ paddingTop: 24, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1.32 }}>© 2026 NCSW</Text>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1.32 }}>MECP Certified · Cleveland OH</Text>
                </View>
              </View>
            </View>
            <Mono size="sm" tone="gray">Slots: Top (Brand + Columns), Bottom (Meta).</Mono>
          </Block>

          <Block title="DataTable">
            <DataTable
              columns={tableCols}
              rows={sortedRows}
              rowKey={(r) => r.id}
              sortKey={tableSortKey}
              sortDir={tableSortDir}
              onSort={(k) => {
                if (k === tableSortKey) setTableSortDir((d) => (d === 1 ? -1 : 1))
                else {
                  setTableSortKey(k)
                  setTableSortDir(1)
                }
              }}
              rowHeight={48}
            />
            <Mono size="sm" tone="gray">
              Sortable header · sticky left column ("Price") · per-row hover state. Pass <Text style={{ fontFamily: fonts.mono }}>maxVisible</Text> to cap height and enable lazy-load scrolling for thousands of rows.
            </Mono>
          </Block>

          <View style={{ height: 96 }} />
        </Container>
      </Section>
    </ScrollView>
  )
}

function IconCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, width: 80 }}>
      <View style={{ width: 44, height: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
      <Mono size="sm" tone="gray">{label}</Mono>
    </View>
  )
}
