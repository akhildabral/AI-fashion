import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { weatherFor } from '@zauq/shared/fitting'
import { temp } from '@zauq/shared/units'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Press } from '@/src/components/Press'
import { T } from '@/src/components/Text'
import * as haptics from '@/src/design/haptics'
import { fadeIn } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, hairline, height, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { type DraftWeather } from '@/src/features/fitting/draft'
import { useFitting } from '@/src/features/fitting/FittingProvider'
import { Frame } from '@/src/features/fitting/Frame'
import { hrefOf, TONES } from '@/src/features/fitting/steps'

function title(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Step 3, city and tone: where mornings happen, and the shades that
 * flatter. FittingPage.tsx: the forecast answers back in a brass-edged box
 * on the soft wash (16 / 10, the figure Bodoni 24); the tones are 44px
 * squares 10 apart, the chosen one ringed in brass.
 */
export default function City() {
  const router = useRouter()
  const { t } = useTheme()
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
        setNotFound(`Couldn’t find the weather for ${c} yet. The stylist keeps trying.`)
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
      actions={<Button label="Next" block onPress={next} testID="fitting-continue" />}
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
        placeholder="Your city"
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="addressCity"
        autoComplete="postal-address-locality"
        returnKeyType="done"
        helper={check.isPending ? 'Asking the sky…' : undefined}
        error={notFound}
      />
      {weather ? (
        <Animated.View entering={fadeIn} accessibilityLiveRegion="polite" style={[styles.answer, { borderColor: t.brass, backgroundColor: t.brassSoft, borderRadius: radius }]}>
          <T role="statSm" tone="brass">
            {temp(weather.temperatureC)}
          </T>
          <T role="bodySm" style={styles.answerLine}>
            {title(weather.description || 'clear')} in{' '}
            <T role="bodySm" style={styles.semi}>
              {weather.location}
            </T>
            . Good to know.
          </T>
        </Animated.View>
      ) : null}

      <View style={styles.group}>
        {/* The Label over a control: 11, .18em, 8 above its row. */}
        <T role="label" tone="faint">
          Skin tone
        </T>
        <View style={styles.swatches} accessibilityRole="radiogroup">
          {TONES.map(([k, colour]) => {
            const on = tone === k
            return (
              <Press
                key={k}
                accessibilityRole="radio"
                accessibilityLabel={title(k)}
                accessibilityState={{ selected: on, checked: on }}
                onPress={() => {
                  haptics.select()
                  const nextTone = on ? null : k
                  setTone(nextTone)
                  patch({ tone: nextTone })
                }}
              >
                <View style={[styles.ring, { borderRadius: radius, borderColor: on ? t.brass : 'transparent' }]}>
                  <View style={[styles.swatch, { backgroundColor: colour, borderColor: alpha(t.ink, 0.15), borderRadius: radius }]} />
                </View>
              </Press>
            )
          })}
        </View>
        <T role="bodySm" tone="muted">
          Helps the stylist pick shades that flatter. Skip it if you would rather.
        </T>
      </View>
    </Frame>
  )
}

const SWATCH = height.action

const styles = StyleSheet.create({
  // `inline-flex items-center gap-3 px-4 py-2.5`.
  answer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: space.md, borderWidth: hairline, paddingHorizontal: space.lg, paddingVertical: 10 },
  answerLine: { flexShrink: 1 },
  semi: { fontFamily: fonts.sansSemi },
  // The label, its swatches 8 beneath, the note 8 beneath that.
  group: { gap: space.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // `ring-2 ring-offset-2`: a 2px brass ring 2 outside the swatch.
  ring: { borderWidth: 2, padding: 2, margin: -4 },
  swatch: { width: SWATCH, height: SWATCH, borderWidth: hairline },
})
