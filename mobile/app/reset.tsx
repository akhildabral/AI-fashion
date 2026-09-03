// https://myzauq.com/reset?token=..., the password reset email.
import { useLocalSearchParams } from 'expo-router'
import { LinkRedirect } from '@/src/features/links/LinkRedirect'

export default function ResetLink() {
  const { token } = useLocalSearchParams<{ token?: string }>()
  return <LinkRedirect path="/reset" params={{ token }} />
}
