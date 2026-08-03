import { emailSignupSchema, googleCompleteSchema } from '@ezer/shared';
import { verifyGoogleIdToken } from '../src/utils/verifyGoogle';

async function main() {
  console.log('google schema', googleCompleteSchema.safeParse({ idToken: 'x' }).success);
  console.log(
    'signup rejects short password',
    emailSignupSchema.safeParse({ email: 'a@b.co', password: 'short', name: 'A' }).success === false
  );

  try {
    await verifyGoogleIdToken('fake');
    console.log('unexpected success');
    process.exit(1);
  } catch (error) {
    console.log('google verify expected fail:', (error as Error).message.slice(0, 120));
  }
}

main();
