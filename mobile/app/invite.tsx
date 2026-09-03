// https://myzauq.com/invite?token=..., the emailed invite.
import { useLocalSearchParams } from 'expo-router'
import { LinkRedirect } from '@/src/features/links/LinkRedirect'

export default function InviteLink() {
  const { token } = useLocalSearchParams<{ token?: string }>()
  return <LinkRedirect path="/invite" params={{ token }} />
}
