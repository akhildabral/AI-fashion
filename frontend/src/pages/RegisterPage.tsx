import { useNavigate } from 'react-router-dom'
import { AuthForm } from '../components/AuthForm'
import { useAuth } from '../context/useAuth'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(email: string, password: string) {
    await register(email, password)
    navigate('/', { replace: true })
  }

  return <AuthForm mode="register" onSubmit={handleSubmit} />
}
