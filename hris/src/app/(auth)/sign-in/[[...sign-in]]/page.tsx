import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <SignIn
      // No sign-up link — HRIS is invite-only.
      // signUpUrl is intentionally omitted; footerAction hides the "Sign up" link.
      appearance={{
        elements: {
          rootBox: { width: '100%', maxWidth: 440 },
          card: {
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-xl)',
          },
          footerAction: { display: 'none' },
        },
        variables: {
          colorPrimary: '#2C5282',
          fontFamily: "'Inter', system-ui, sans-serif',",
        },
      }}
    />
  );
}
