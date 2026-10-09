import { Field } from '@/components/ui';

// The two boxes for creating a sign-in. Starting or joining a circle needs an email on the account (so a
// lost phone can be recovered and a removed person cannot just reappear as someone new).
export default function EmailFields({ email, password, setEmail, setPassword }: { email: string; password: string; setEmail: (v: string) => void; setPassword: (v: string) => void }) {
  return (
    <>
      <Field label="Your email" hint="This is how you sign back in on a new phone. Other parents never see it." value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" autoCorrect={false} placeholder="you@example.com" />
      <Field label="Choose a password" hint="At least 6 characters." value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" autoCorrect={false} />
    </>
  );
}
