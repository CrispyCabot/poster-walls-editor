import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface BootstrapStackProps extends StackProps {
  readonly githubOwner: string;
  readonly githubRepo: string;
}

/**
 * Deployed once, manually, from a local admin identity. It is what allows
 * GitHub Actions to deploy everything else, so it cannot itself be deployed
 * by GitHub Actions.
 */
export class BootstrapStack extends Stack {
  constructor(scope: Construct, id: string, props: BootstrapStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'PosterWallsGithubDeploy',
      // Restricted to this repository. Any branch may deploy; the workflow
      // itself only runs the deploy job on main.
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub':
            `repo:${props.githubOwner}/${props.githubRepo}:*`,
        },
      }),
      // CDK deploys assume the CDK bootstrap roles, which requires admin-level
      // reach. Narrowing this is tracked as future work.
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
