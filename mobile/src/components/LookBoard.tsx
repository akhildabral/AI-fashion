import { Image } from 'expo-image'
import { useState } from 'react'
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import { composeLook, type LayoutItem } from '@zauq/shared/flatlay'
import { resolveImageUrl } from '@/src/lib/api'
import { Arch } from './Arch'

export type FlatLayItem = LayoutItem & { id: string; imageUrl: string }

/**
 * The flat-lay: garments placed on the board by the shared engine
 * (fractions of the frame), each learning its real aspect as it loads.
 */
export function FlatLay({ items, frameRatio = 1.25 }: { items: FlatLayItem[]; frameRatio?: number }) {
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const placed = composeLook(
    items.map((it) => ({ ...it, aspect: aspects[it.id] })),
    frameRatio,
  )
  return (
    <View style={StyleSheet.absoluteFill}>
      {placed.map((p) => {
        const it = items[p.index]
        return (
          <View
            key={it.id}
            style={{
              position: 'absolute',
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.w}%`,
              height: `${p.h}%`,
              zIndex: p.z,
              transform: [{ rotate: `${p.rot}deg` }],
              ...shadow,
            }}
          >
            <Image
              source={{ uri: resolveImageUrl(it.imageUrl) }}
              contentFit="contain"
              cachePolicy="disk"
              transition={200}
              accessible={false}
              onLoad={(e) => {
                const { width, height } = e.source
                if (width > 0) {
                  const a = height / width
                  setAspects((prev) => (prev[it.id] === a ? prev : { ...prev, [it.id]: a }))
                }
              }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )
      })}
    </View>
  )
}

// A soft drop shadow so cut-outs sit on the board. `filter` is supported on
// both platforms under the New Architecture.
const shadow: ViewStyle =
  Platform.OS === 'web'
    ? {}
    : {
        filter: [{ dropShadow: { offsetX: 0, offsetY: 10, standardDeviation: 7, color: 'rgba(60, 40, 12, 0.22)' } }],
      }

/** A look on its board: the flat-lay inside the arch every outfit is shown in. */
export function LookBoard({ items, width, aspect = 5 / 4, selected, sweep }: { items: FlatLayItem[]; width: number; aspect?: number; selected?: boolean; sweep?: boolean }) {
  return (
    <Arch width={width} aspect={aspect} selected={selected} sweep={sweep}>
      <FlatLay items={items} frameRatio={aspect} />
    </Arch>
  )
}
