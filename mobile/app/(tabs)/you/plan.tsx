// Plan & usage, read-only on the phone: the plan's name and the meters. The
// plan itself is managed from the web account (store policy, plan §1). The
// web's BillingPage top half: the h1, the card 24 below, meters 24 below
// the plan line and 16 apart.
import { useQuery } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { LoadError } from '@/src/components/Bits'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { T } from '@/src/components/Text'
import { useTheme } from '@/src/design/theme'
import { gutter, space } from '@/src/design/tokens'
import { apiFetch } from '@/src/lib/api'
import { qk } from '@/src/lib/query'
import { Card } from '@/src/features/you/Furniture'
import { Meter, type MeterValue } from '@/src/features/you/Meter'

interface BillingSummary {
  plan: string
  label: string
  lifetime: boolean
  usage: { looks: MeterValue; tryons: MeterValue; catalog: MeterValue; items: MeterValue }
  planStatus: string
  currentPeriodEnd: string | null
  billingConfigured: boolean
}

export default function Plan() {
  const { t } = useTheme()
  const q = useQuery({ queryKey: qk.billing, queryFn: () => apiFetch<BillingSummary>('/billing/summary') })
  const summary = q.data
  const periodEnd = summary?.currentPeriodEnd ? new Date(summary.currentPeriodEnd).toLocaleDateString() : null
  const per = summary?.lifetime ? 'free allowance' : 'this month'

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Plan & usage' }} />
      <Screen>
        <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl tintColor={t.brass} refreshing={q.isFetching && !!summary} onRefresh={() => void q.refetch()} />}>
          <T role="h1" accessibilityRole="header">
            Plan & usage
          </T>
          {q.isError && !summary ? (
            <LoadError message="Could not load your plan." onRetry={() => void q.refetch()} />
          ) : !summary ? (
            <Card padding="form" style={styles.card}>
              <SkeletonBlock width={96} height={16} />
              <SkeletonBlock width={160} height={28} style={styles.mt2} />
              <View style={styles.meters}>
                {[0, 1, 2].map((i) => (
                  <View key={i}>
                    <SkeletonBlock height={16} />
                    <SkeletonBlock height={8} style={styles.mt2} />
                  </View>
                ))}
              </View>
            </Card>
          ) : (
            <>
              <Card padding="form" style={styles.card}>
                <T role="micro" tone="faint">
                  Current plan
                </T>
                <T role="h2" style={styles.mt2}>
                  {summary.label}
                </T>
                {summary.planStatus === 'grace' ? (
                  <T role="bodySm" style={[styles.mt1, { color: t.warning }]}>
                    A payment failed. Update your payment method, or your plan will lapse.
                  </T>
                ) : summary.planStatus === 'cancelled' && periodEnd ? (
                  <T role="bodySm" tone="muted" style={styles.mt1}>
                    Cancelled. Active until {periodEnd}.
                  </T>
                ) : summary.planStatus === 'active' && periodEnd ? (
                  <T role="bodySm" tone="muted" style={styles.mt1}>
                    Renews {periodEnd}.
                  </T>
                ) : null}
                {summary.plan === 'founder' ? (
                  <T role="bodySm" tone="muted" style={styles.mt1}>
                    Founder access. Pro-level limits, on the house. Thank you for being early.
                  </T>
                ) : null}
                <View style={styles.meters}>
                  <Meter label="Wardrobe items" meter={summary.usage.items} />
                  <Meter label="Generated looks" meter={summary.usage.looks} per={per} />
                  <Meter label="Virtual try-ons" meter={summary.usage.tryons} per={per} />
                </View>
              </Card>
              <T role="bodySm" tone="muted" style={styles.note}>
                Your plan is managed from your web account. Changes made there show here within a moment.
              </T>
            </>
          )}
        </ScrollView>
      </Screen>
    </>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxxxl },
  card: { marginTop: space.xl },
  mt1: { marginTop: space.xs },
  mt2: { marginTop: space.sm },
  meters: { marginTop: space.xl, gap: space.lg },
  note: { marginTop: space.lg },
})
