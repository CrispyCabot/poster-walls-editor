import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BootstrapStack } from '../lib/bootstrap-stack.js';

function synth() {
  const app = new App();
  const stack = new BootstrapStack(app, 'TestBootstrap', {
    env: { account: '111111111111', region: 'us-east-1' },
    githubOwner: 'CrispyCabot',
    githubRepo: 'poster-walls-editor',
  });
  return Template.fromStack(stack);
}

describe('BootstrapStack', () => {
  it('registers the GitHub OIDC provider', () => {
    synth().resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 1);
  });

  it('scopes role assumption to this repository only', () => {
    const roles = synth().findResources('AWS::IAM::Role');
    // Don't assume the deploy role is Object.values(roles)[0]: the
    // OpenIdConnectProvider construct's backing custom-resource Lambda gets
    // its own execution role (trusting lambda.amazonaws.com) synthesized
    // first, ahead of the deploy role. Check across all roles instead of
    // relying on insertion order.
    const doc = JSON.stringify(
      Object.values(roles).map((r) => r.Properties.AssumeRolePolicyDocument),
    );
    expect(doc).toContain('repo:CrispyCabot/poster-walls-editor:*');
    expect(doc).toContain('sts.amazonaws.com');
  });

  it('publishes the role ARN', () => {
    expect(Object.keys(synth().findOutputs('*'))).toContain('DeployRoleArn');
  });
});
