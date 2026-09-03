// The admin desk: who is waiting, who is in, and what has been reported.
// Only for admins; anyone else is sent back to the room. The web's tables
// become cards: each `px-4 py-3` cell block is a card of the same padding.
import { useMutation, useQuery } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { RefreshControl, StyleSheet, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { EmptyState, LoadError } from '@/src/components/Bits'
import { Button } from '@/src/components/Button'
import { Field } from '@/src/components/Field'
import { Screen } from '@/src/components/Screen'
import { SkeletonBlock } from '@/src/components/Skeleton'
import { Filter, Tabs } from '@/src/components/Tabs'
import { T } from '@/src/components/Text'
import { useFlash } from '@/src/components/Toast'
import { useAuth } from '@/src/context/AuthProvider'
import { useTheme } from '@/src/design/theme'
import { alpha, gutter, hairline, radius, space } from '@/src/design/tokens'
import { fonts } from '@/src/design/type'
import { apiFetch } from '@/src/lib/api'
import { queryClient } from '@/src/lib/query'
import { displayName, PLAN_IDS, REASON_LABEL, WAITING, type AdminReport, type AdminUser } from '@/src/features/you/admin'
import { Card, TextLink } from '@/src/features/you/Furniture'
import { youKeys } from '@/src/features/you/keys'
import { routes } from '@/src/features/you/nav'

type Tab = 'waitlist' | 'members' | 'reports'

/** The web's `px-2.5 py-1 text-xs` status: a tinted pill in the status's colour. */
function StatusPill({ status }: { status: string }) {
  const { t } = useTheme()
  const tone = status === 'approved' ? t.success : status === 'suspended' ? t.danger : status === 'invited' ? t.brass : t.warning
  return (
    <View style={[styles.pill, { backgroundColor: alpha(tone, 0.12), borderRadius: radius }]}>
      <T role="caption" style={{ color: tone, fontFamily: fonts.sansMedium }}>
        {status}
      </T>
    </View>
  )
}

/** The web's small `bg-ink/10 text-[10px] uppercase` tag: google, admin. */
function Tag({ label }: { label: string }) {
  const { t } = useTheme()
  return (
    <View style={[styles.tag, { backgroundColor: alpha(t.ink, 0.1), borderRadius: radius }]}>
      <T role="micro" tone="muted">
        {label}
      </T>
    </View>
  )
}

export default function Admin() {
  const router = useRouter()
  const flash = useFlash()
  const { t } = useTheme()
  const { user: me } = useAuth()
  const isAdmin = me?.role === 'admin'
  const [tab, setTab] = useState<Tab>('waitlist')
  const [inviteEmail, setInviteEmail] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (me && !isAdmin) router.replace(routes.you)
  }, [me, isAdmin, router])

  const usersQ = useQuery({ queryKey: youKeys.adminUsers, queryFn: () => apiFetch<{ users: AdminUser[] }>('/admin/users'), enabled: isAdmin })
  const reportsQ = useQuery({ queryKey: youKeys.adminReports, queryFn: () => apiFetch<{ reports: AdminReport[] }>('/admin/reports'), enabled: isAdmin })
  const reloadUsers = () => queryClient.invalidateQueries({ queryKey: youKeys.adminUsers })

  const act = useMutation({
    mutationFn: ({ id, path, body }: { id: string; path: string; body?: unknown }) => {
      setBusyId(id)
      return apiFetch(path, { method: 'POST', body })
    },
    onSuccess: () => void reloadUsers(),
    onError: (err) => flash(err instanceof Error ? err.message : 'Update failed.'),
    onSettled: () => setBusyId(null),
  })

  const approve = useMutation({
    mutationFn: (u: AdminUser) => {
      setBusyId(u.id)
      return apiFetch<{ inviteUrl: string | null; viaGoogle: boolean; emailed?: boolean }>(`/admin/users/${u.id}/invite`, { method: 'POST' }).then((r) => ({ ...r, email: u.email }))
    },
    onSuccess: (r) => {
      void reloadUsers()
      router.push(routes.adminInvite({ email: r.email, url: r.inviteUrl, viaGoogle: r.viaGoogle, emailed: r.emailed }))
    },
    onError: (err) => flash(err instanceof Error ? err.message : 'Could not create the invite.'),
    onSettled: () => setBusyId(null),
  })

  const invite = useMutation({
    mutationFn: (email: string) => apiFetch<{ inviteUrl: string; email: string; emailed?: boolean }>('/admin/invite', { method: 'POST', body: { email } }),
    onSuccess: (r) => {
      setInviteEmail('')
      void reloadUsers()
      router.push(routes.adminInvite({ email: r.email, url: r.inviteUrl, emailed: r.emailed }))
    },
    onError: (err) => flash(err instanceof Error ? err.message : 'Could not create the invite.'),
  })

  const resolve = useMutation({
    mutationFn: (id: string) => {
      setBusyId(id)
      return apiFetch(`/admin/reports/${id}/resolve`, { method: 'POST' })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: youKeys.adminReports }),
    onError: (err) => flash(err instanceof Error ? err.message : 'Could not resolve that.'),
    onSettled: () => setBusyId(null),
  })

  if (!isAdmin) return null

  const users = usersQ.data?.users ?? null
  const reports = reportsQ.data?.reports ?? null
  const waiting = (users ?? []).filter((u) => WAITING.includes(u.status))
  const members = (users ?? []).filter((u) => !WAITING.includes(u.status))
  const openReports = reports?.filter((r) => !r.resolvedAt).length ?? 0

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Admin' }} />
      <Screen>
        <KeyboardAwareScrollView
          bottomOffset={40}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              tintColor={t.brass}
              refreshing={(usersQ.isFetching || reportsQ.isFetching) && !!users}
              onRefresh={() => {
                void usersQ.refetch()
                void reportsQ.refetch()
              }}
            />
          }
        >
          <View>
            <T role="h1" accessibilityRole="header">
              Admin
            </T>
            <T role="bodySm" tone="muted" style={styles.mt1}>
              {members.length} members · {waiting.length} waiting
            </T>
          </View>
          <View style={styles.mt6}>
            <Tabs<Tab>
              items={[
                { key: 'waitlist', label: 'Waitlist', count: waiting.length },
                { key: 'members', label: 'Members', count: members.length },
                { key: 'reports', label: 'Reports', count: openReports },
              ]}
              value={tab}
              onChange={setTab}
            />
          </View>

          {usersQ.isError && !users ? <LoadError message="Could not load the members." onRetry={() => void usersQ.refetch()} /> : null}

          {tab === 'waitlist' ? (
            <View style={styles.mt6}>
              <View style={styles.inviteRow}>
                <View style={styles.grow}>
                  <Field compact value={inviteEmail} onChangeText={setInviteEmail} placeholder="Invite someone by email…" accessibilityLabel="Invite someone by email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" returnKeyType="send" onSubmitEditing={() => inviteEmail.trim() && invite.mutate(inviteEmail.trim())} />
                </View>
                <Button label="Invite" size="sm" loading={invite.isPending} disabled={!inviteEmail.trim()} onPress={() => invite.mutate(inviteEmail.trim())} />
              </View>
              {!users ? (
                <View style={styles.mt6}>
                  <Skeletons />
                </View>
              ) : waiting.length === 0 ? (
                <View style={styles.mt8}>
                  <EmptyState title="Nobody is waiting right now." />
                </View>
              ) : (
                <View style={[styles.list, styles.mt6]}>
                  {waiting.map((u) => (
                    <Card key={u.id} padding="none" style={styles.cell}>
                      <T role="bodySm" style={styles.strong}>
                        {displayName(u)}
                      </T>
                      <T role="caption" tone="muted">
                        {u.email}
                      </T>
                      <View style={styles.tags}>
                        <StatusPill status={u.status} />
                        {u.viaGoogle ? <Tag label="google" /> : null}
                        <T role="caption" tone="muted">
                          Joined {new Date(u.createdAt).toLocaleDateString()}
                        </T>
                      </View>
                      <View style={styles.rowActions}>
                        <Button size="sm" label={u.status === 'invited' ? 'New invite link' : u.viaGoogle ? 'Approve' : 'Approve & invite'} loading={busyId === u.id} disabled={busyId !== null} onPress={() => approve.mutate(u)} />
                      </View>
                    </Card>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {tab === 'members' ? (
            <View style={[styles.list, styles.mt6]}>
              {!users ? (
                <Skeletons />
              ) : (
                members.map((u) => {
                  const busy = busyId === u.id
                  const canReset = (u.role !== 'admin' || u.id === me?.id) && !u.viaGoogle
                  const canSuspend = u.status === 'approved' && u.role !== 'admin' && u.id !== me?.id
                  return (
                    <Card key={u.id} padding="none" style={styles.cell}>
                      <T role="bodySm" style={styles.strong}>
                        {displayName(u)}
                      </T>
                      <T role="caption" tone="muted">
                        {u.email}
                        {u.handle ? ` · @${u.handle}` : ''}
                      </T>
                      <View style={styles.tags}>
                        <StatusPill status={u.status} />
                        {u.role === 'admin' ? <Tag label="admin" /> : null}
                        {u.viaGoogle ? <Tag label="google" /> : null}
                      </View>
                      <View style={[styles.plans, { borderTopColor: alpha(t.ink, 0.1) }]}>
                        {PLAN_IDS.map((p) => (
                          <Filter key={p} label={p} on={u.plan === p} onPress={() => u.plan !== p && !busy && act.mutate({ id: u.id, path: `/admin/users/${u.id}/plan`, body: { plan: p } })} />
                        ))}
                      </View>
                      <T role="caption" tone="muted" style={styles.mt3}>
                        {u.items} items · {u.wears} wears · {u.aiCalls7d} AI calls / 7d
                      </T>
                      <View style={styles.invites}>
                        <T role="caption" tone="faint" style={styles.shrink}>
                          {u.role === 'admin' ? 'Invites: unlimited' : `Invites: ${u.invitesLeft} left`} · brought in {u.invited}
                          {u.invitedBy ? ` · came in via ${u.invitedBy}` : ''}
                        </T>
                        {u.role !== 'admin' ? <TextLink label="+5" disabled={busy} onPress={() => act.mutate({ id: u.id, path: `/admin/users/${u.id}/invites`, body: { invitesLeft: u.invitesLeft + 5 } })} /> : null}
                      </View>
                      {canReset || canSuspend || u.status === 'suspended' ? (
                        <View style={styles.rowActions}>
                          {canReset ? <Button size="sm" variant="ghost" label="Reset password" disabled={busy} onPress={() => router.push(routes.adminReset(u.id, u.email))} /> : null}
                          {canSuspend ? <Button size="sm" variant="danger" label="Suspend" loading={busy} disabled={busyId !== null} onPress={() => act.mutate({ id: u.id, path: `/admin/users/${u.id}/suspend` })} /> : null}
                          {u.status === 'suspended' ? <Button size="sm" label="Reinstate" loading={busy} disabled={busyId !== null} onPress={() => act.mutate({ id: u.id, path: `/admin/users/${u.id}/approve` })} /> : null}
                        </View>
                      ) : null}
                    </Card>
                  )
                })
              )}
            </View>
          ) : null}

          {tab === 'reports' ? (
            <View style={[styles.list, styles.mt6]}>
              {reportsQ.isError && !reports ? (
                <LoadError message="Couldn’t load reports." onRetry={() => void reportsQ.refetch()} />
              ) : !reports ? (
                <Skeletons />
              ) : reports.length === 0 ? (
                <EmptyState title="Nothing reported." line="Good." />
              ) : (
                reports.map((r) => (
                  <Card key={r.id} padding="none" style={[styles.cell, r.resolvedAt ? styles.resolved : null]}>
                    <T role="bodySm" style={styles.strong}>
                      {r.targetType === 'user' ? `@${r.target}` : `${r.targetType} ${r.target.slice(0, 8)}…`}
                    </T>
                    {r.detail ? (
                      <T role="caption" tone="muted" style={styles.detail}>
                        {r.detail}
                      </T>
                    ) : null}
                    <T role="caption" tone="muted" style={styles.mt1}>
                      {REASON_LABEL[r.reason] ?? r.reason} · from {r.reporter} · {new Date(r.createdAt).toLocaleDateString()}
                    </T>
                    <View style={styles.rowActions}>
                      {r.resolvedAt ? (
                        <T role="caption" tone="faint">
                          Resolved
                        </T>
                      ) : (
                        <Button size="sm" variant="ghost" label="Resolve" loading={busyId === r.id} disabled={busyId !== null} onPress={() => resolve.mutate(r.id)} />
                      )}
                    </View>
                  </Card>
                ))
              )}
            </View>
          ) : null}
        </KeyboardAwareScrollView>
      </Screen>
    </>
  )
}

function Skeletons() {
  return (
    <View style={styles.list} accessibilityLabel="Loading">
      {[0, 1, 2].map((i) => (
        <Card key={i} padding="none" style={styles.cell}>
          <SkeletonBlock width={144} height={16} />
          <SkeletonBlock width="70%" height={12} style={styles.mt2} />
        </Card>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xxxl },
  mt1: { marginTop: space.xs },
  mt2: { marginTop: space.sm },
  mt3: { marginTop: space.md },
  mt6: { marginTop: space.xl },
  mt8: { marginTop: space.xxl },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  strong: { fontFamily: fonts.sansMedium },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  list: { gap: space.md },
  // The web's `px-4 py-3` table cell.
  cell: { paddingHorizontal: space.lg, paddingVertical: space.md },
  resolved: { opacity: 0.5 },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  pill: { paddingHorizontal: 10, paddingVertical: 4 },
  tag: { paddingHorizontal: 6, paddingVertical: 2 },
  plans: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.md, paddingTop: space.md, borderTopWidth: hairline },
  invites: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  detail: { marginTop: 2 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
})
