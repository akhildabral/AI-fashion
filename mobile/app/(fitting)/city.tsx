import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { weatherFor } from '@zauq/shared/fitting'
import { temp } from '@zauq/shared/units'
import { Arch } from '@/src/components/Arch'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { fadeIn } from '@/src/design/motion'
import { space } from '@/src/design/tokens'
import { type DraftWeather } from '@/src/features/fitting/draft'
import { useFitting } from '@/src/features/fitting/FittingProvider'
import { Frame } from '@/src/features/fitting/Frame'
import { hrefOf, TONES } from '@/src/features/fitting/steps'

const SWATCH = 52

function title(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Step 3, city and tone: where mornings happen, and the shades that flatter. */
export default function City() {
  const router = useRouter()
  const { draft, patch } = useFitting()
  const [city, setCity] = useState(draft.city)
  const [weather, setWeather] = useState<DraftWeather | null>(draft.weather)
  const [tone, setTone] = useState<string | null>(draft.tone)
  const [notFound, setNotFound] = useState<string | null>(null)

  const check = useMutation({
    mutationFn: (c: string) => weatherFor(c),
    onSuccess: (w, c) => {
      if (w.ok && w.temperatureC != null) {
        const found = { location: w.location, temperatureC: w.temperatureC, description: w.description ?? '' }
        setWeather(found)
        setNotFound(null)
        patch({ weather: found })
      } else {
        setWeather(null)
        setNotFound(`Could not find the weather for ${c} yet. The stylist keeps trying.`)
        patch({ weather: null })
      }
    },
    onError: () => {
      setWeather(null)
      setNotFound('Could not reach the weather just now. Your city is kept.')
    },
  })

  const askWeather = () => {
    const c = city.trim()
    if (!c || c === weather?.location) return
    check.mutate(c)
  }

  const next = () => {
    patch({ city: city.trim(), tone, weather, step: 'pieces' })
    router.push(hrefOf('pieces'))
  }

  return (
    <Frame
      step="city"
      who="Where"
      ask={
        <>
          Where do mornings <T role="h1" tone="brass" italic>happen?</T>
        </>
      }
      lead="The weather in your city is the first thing the stylist checks each day."
      actions={<Button label="Continue" block onPress={next} testID="fitting-continue" />}
    >
      <Field
        label="Your city"
        testID="fitting-city"
        value={city}
        onChangeText={(v) => {
          setCity(v)
          patch({ city: v })
        }}
        onBlur={askWeather}
        onSubmitEditing={askWeather}
        placeholder="Dubai, Lahore, London"
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="addressCity"
        autoComplete="postal-address-locality"
        returnKeyType="done"
        helper={check.isPending ? 'Asking the sky…' : undefined}
        error={notFound}
      />
      {weather ? (
        <Animated.View entering={fadeIn} accessibilityLiveRegion="polite">
          <T role="body">
            <T role="stat" tone="brass">
              {temp(weather.temperatureC)}
            </T>
            {` and ${weather.description ? weather.description.toLowerCase() : 'clear'} in ${weather.location}. Good to know.`}
          </T>
        </Animated.View>
      ) : null}

      <View style={styles.group}>
        <T role="label" tone="faint">
          Skin tone
        </T>
        <T role="bodySm" tone="muted">
          Helps the stylist pick shades that flatter. Skip it if you would rather.
        </T>
        <View style={styles.swatches} accessibilityRole="radiogroup">
          {TONES.map(([k, colour]) => {
            const on = tone === k
            return (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityLabel={title(k)}
                accessibilityState={{ selected: on, checked: on }}
                pressRetentionOffset={12}
                onPress={() => {
                  haptics.select()
                  const nextTone = on ? null : k
                  setTone(nextTone)
                  patch({ tone: nextTone })
                }}
              >
                <Arch width={SWATCH} variant="plain" selected={on}>
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: colour }]} />
                </Arch>
              </Pressable>
            )
          })}
        </View>
      </View>
    </Frame>
  )
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingTop: space.xs },
})
