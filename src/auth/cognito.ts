import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
let _pool: CognitoUserPool | null = null;
const pool = () =>
  (_pool ??= new CognitoUserPool({
    UserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID ?? '',
    ClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? '',
  }));
const userFor = (email: string) => new CognitoUser({ Username: email, Pool: pool() });
export const signUp = (email: string, password: string) =>
  new Promise<boolean>((resolve, reject) =>
    pool().signUp(
      email,
      password,
      [new CognitoUserAttribute({ Name: 'email', Value: email })],
      [],
      (err, result) => (err || !result ? reject(err) : resolve(result.userConfirmed)),
    ),
  );
export const confirmSignUp = (email: string, code: string) =>
  new Promise<void>((resolve, reject) =>
    userFor(email).confirmRegistration(code, true, err => (err ? reject(err) : resolve())),
  );
export const resendConfirmationCode = (email: string) =>
  new Promise<void>((resolve, reject) =>
    userFor(email).resendConfirmationCode(err => (err ? reject(err) : resolve())),
  );
export const signIn = (email: string, password: string) =>
  new Promise<string>((resolve, reject) =>
    userFor(email).authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: s => resolve(s.getIdToken().getJwtToken()),
      onFailure: reject,
    }),
  );
export const getIdToken = () =>
  new Promise<string | null>(resolve => {
    const user = pool().getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err: Error | null, s: CognitoUserSession | null) =>
      resolve(err || !s || !s.isValid() ? null : s.getIdToken().getJwtToken()),
    );
  });
export const getCurrentUsername = () => pool().getCurrentUser()?.getUsername() ?? null;
export const signOut = () => pool().getCurrentUser()?.signOut();
export const deleteAccount = () =>
  new Promise<void>((resolve, reject) => {
    const user = pool().getCurrentUser();
    if (!user) return resolve();
    user.getSession((err: Error | null) => {
      if (err) return reject(err);
      user.deleteUser(e => (e ? reject(e) : resolve()));
    });
  });
