// https://myzauq.com/verify-email?token=..., the verification email.
import { useLocalSearchParams } from 'expo-router'
import { LinkRedirect } from '@/src/features/links/LinkRedirect'

export default function VerifyEmailLink() {
  const { token } = useLocalSearchParams<{ token?: string }>()
  return <LinkRedirect path="/verify-email" params={{ token }} />
}
