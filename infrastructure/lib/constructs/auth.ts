import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthConstructProps {
  /** Callback/logout origins. CloudFront URL now; custom domain in Plan 4. */
  readonly webOrigins: string[];
}

export class AuthConstruct extends Construct {
  readonly userPool: cognito.UserPool;
  readonly client: cognito.UserPoolClient;
  readonly domainPrefix: string;

  constructor(scope: Construct, id: string, props: AuthConstructProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 12, requireDigits: true, requireLowercase: true, requireUppercase: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.client = this.userPool.addClient('WebClient', {
      // Public SPA client: no secret, authorization code + PKCE.
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: props.webOrigins.map((o) => `${o}/callback`),
        logoutUrls: props.webOrigins,
      },
      preventUserExistenceErrors: true,
    });

    this.domainPrefix = `poster-walls-${Stack.of(this).account}`;
    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: this.domainPrefix },
    });
  }
}
