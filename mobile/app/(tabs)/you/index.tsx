// The You room: who the stylist is dressing, what the fitting still lacks,
// and the doors to the record, the trips, the profile and the settings.
import { useRouter } from 'expo-router'
import { ScrollView, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Wordmark } from '@/src/components/Brand'
import { Button } from '@/src/components/Button'
import { Screen } from '@/src/components/Screen'
import { T } from '@/src/components/Text'
import { useAuth } from '@/src/context/AuthProvider'
import { rise } from '@/src/design/motion'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, radius, space } from '@/src/design/tokens'
import { APP_VERSION } from '@/src/lib/config'
import { Avatar, Card, NavRow, TextLink } from '@/src/features/you/Furniture'
import { routes } from '@/src/features/you/nav'
import { useFittingProgress, type FittingSection } from '@/src/features/you/useFittingProgress'

export default function YouRoom() {
  const router = useRouter()
  const { t } = useTheme()
  const { user } = useAuth()
  const progress = useFittingProgress()
  const name = user?.name ?? [user?.firstName, user?.lastName].filter(Boolean).join(' ') ?? ''
  const shown = name.trim() || user?.email || 'You'
  const share = progress.total ? progress.done / progress.total : 0

  const go = (section: FittingSection) => {
    if (section === 'mirror') router.push(routes.mirror)
    else router.push(routes.profile(section))
  }

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* The arch, the name and the handle share the header's baseline. */}
        <Animated.View entering={rise(0)} style={styles.identity}>
          <Avatar name={shown} />
          <View style={styles.who}>
            <T role="micro" tone="brass" style={styles.eyebrow}>
              You
            </T>
            <T role="h1" accessibilityRole="header" numberOfLines={2}>
              {shown}
            </T>
            {user?.handle ? (
              <T role="bodySm" tone="muted">
                @{user.handle}
              </T>
            ) : (
              <TextLink label="Claim your address on the circle" onPress={() => router.push(routes.profile('account'))} />
            )}
          </View>
        </Animated.View>

        {!progress.complete ? (
          // A card, not a plaque: it carries the links to what is still open.
          <Animated.View entering={rise(1)}>
            <Card padding="form">
              <View style={styles.progressHead}>
                <T role="micro" tone="faint">
                  Complete your fitting
                </T>
                <T role="statSm">
                  {progress.done} of {progress.total}
                </T>
              </View>
              <View style={[styles.track, { backgroundColor: alpha(t.ink, 0.1) }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}>
                <View style={[styles.fill, { backgroundColor: t.brass, width: `${Math.round(share * 100)}%` }]} />
              </View>
              <T role="bodySm" tone="muted" style={styles.progressLine}>
                The more the stylist knows, the better the brief. Each takes a moment.
              </T>
              <View style={styles.missing}>
                {progress.steps
                  .filter((s) => !s.done)
                  .map((s) => (
                    <TextLink key={s.key} label={`${s.label} →`} onPress={() => go(s.section)} />
                  ))}
              </View>
            </Card>
          </Animated.View>
        ) : null}

        <Animated.View entering={rise(2)}>
          <Card>
            <NavRow first label="Wear history" value="The record" onPress={() => router.push(routes.journal())} />
            <NavRow label="Trips" onPress={() => router.push(routes.trips)} />
            <NavRow label="Profile" value="The facts you are dressed by" onPress={() => router.push(routes.profile())} />
            <NavRow label="Plan & usage" onPress={() => router.push(routes.plan)} />
            <NavRow label="Notifications" onPress={() => router.push(routes.notifications)} />
            <NavRow label="Settings" onPress={() => router.push(routes.settings)} />
            {user?.role === 'admin' ? <NavRow label="Admin" onPress={() => router.push(routes.admin)} /> : null}
          </Card>
        </Animated.View>

        <Animated.View entering={rise(3)} style={styles.foot}>
          <Button label="Sign out" variant="ghost" block onPress={() => router.push(routes.signOut)} />
          <View style={styles.version} accessible accessibilityLabel={`ZAUQ ${APP_VERSION}`}>
            <View style={styles.faintMark}>
              <Wordmark size={10} />
            </View>
            <T role="micro" tone="faint" accessible={false}>
              {APP_VERSION}
            </T>
          </View>
        </Animated.View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  // Blocks 32 apart: the identity, the fitting, the doors, the foot.
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxxxl, gap: space.xxl },
  identity: { flexDirection: 'row', alignItems: 'flex-end', gap: space.lg, paddingTop: space.sm },
  who: { flex: 1, gap: space.xs },
  // The eyebrow's .28em, as RoomHeader sets it.
  eyebrow: { letterSpacing: 2.8 },
  progressHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
  // The label, its bar 8 beneath, the line 8 beneath that, the links 16 on.
  track: { height: 6, borderRadius: radius, overflow: 'hidden', marginTop: space.sm },
  fill: { height: '100%', borderRadius: radius },
  progressLine: { marginTop: space.sm },
  missing: { marginTop: space.lg, gap: space.md },
  foot: { gap: space.md },
  version: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  // The mark at the faint wash the version beside it uses (ink/45).
  faintMark: { opacity: 0.45 },
})
