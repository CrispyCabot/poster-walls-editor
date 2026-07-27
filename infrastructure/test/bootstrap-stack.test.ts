import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BootstrapStack } from '../lib/bootstrap-stack.js';

let cached: Template | undefined;

/** Synthesized once for the whole file — see the note in main-stack.test.ts. */
function synth(): Template {
  if (cached === undefined) {
    const app = new App();
    const stack = new BootstrapStack(app, 'TestBootstrap', {
      env: { account: '111111111111', region: 'us-east-1' },
      githubOwner: 'CrispyCabot',
      githubRepo: 'poster-walls-editor',
      githubOwnerId: '18431358',
      githubRepoId: '1312969424',
    });
    cached = Template.fromStack(stack);
  }
  return cached;
}

describe('BootstrapStack', () => {
  it('registers the GitHub OIDC provider', () => {
    synth().resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 1);
  });

  it('scopes role assumption to this repository only', () => {
    const roles = synth().findResources('AWS::IAM::Role');
    // Don't assume the deploy role is Object.values(roles)[0]. The stack
    // synthesizes TWO roles, and the OpenIdConnectProvider construct's
    // backing custom-resource Lambda gets its execution role (trusting
    // lambda.amazonaws.com) emitted FIRST. Find the web-identity role
    // explicitly, so both conditions are asserted against the same document.
    const deployRole = Object.values(roles).find((r) =>
      JSON.stringify(r.Properties.AssumeRolePolicyDocument)
        .includes('sts:AssumeRoleWithWebIdentity'),
    );
    expect(deployRole).toBeDefined();

    const doc = JSON.stringify(deployRole?.Properties.AssumeRolePolicyDocument);
    expect(doc).toContain('repo:CrispyCabot@18431358/poster-walls-editor@1312969424:*');
    expect(doc).toContain('sts.amazonaws.com');
  });

  it('publishes the role ARN', () => {
    expect(Object.keys(synth().findOutputs('*'))).toContain('DeployRoleArn');
  });
});
