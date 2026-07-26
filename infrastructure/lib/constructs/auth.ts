import { Fn, RemovalPolicy, Stack } from 'aws-cdk-lib';
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

    // Cognito domain prefixes are globally unique per region, so they need a
    // unique component — but NOT the account ID. This prefix ends up in a
    // public login URL baked into the SPA bundle, so deriving it from the
    // account would publish the account ID to every visitor. Use the trailing
    // group of the stack's UUID instead: equally unique, reveals nothing.
    //
    // stackId looks like:
    //   arn:aws:cloudformation:us-east-1:<acct>:stack/<name>/<uuid>
    // so select the uuid, then its last hyphen-delimited group.
    const stackUuid = Fn.select(2, Fn.split('/', Stack.of(this).stackId));
    const uniqueSuffix = Fn.select(4, Fn.split('-', stackUuid));

    this.domainPrefix = `poster-walls-${uniqueSuffix}`;

    // NOTE for anyone changing this prefix later: a user pool may hold only
    // ONE Cognito-hosted domain, and CloudFormation replaces resources
    // create-before-delete. Changing the prefix in a single deploy therefore
    // fails with "Invalid request provided: AWS::Cognito::UserPoolDomain".
    // Do it in two deploys — first remove this call, then re-add it with the
    // new prefix. Users cannot log in during the gap between the two.
    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: this.domainPrefix },
    });
  }
}
