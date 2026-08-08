#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { BootstrapStack } from '../lib/bootstrap-stack.js';
import { MainStack } from '../lib/main-stack.js';

const app = new App();

// The `project`/`environment` tags are not applied here. Each stack applies
// them to itself via `applyStandardTags` — see lib/tags.ts.

new MainStack(app, 'PosterWalls', {
  stackName: 'PosterWalls',
  env: {
    // `exactOptionalPropertyTypes` forbids assigning `string | undefined`
    // to an optional `string` field, so omit `account` entirely when unset
    // instead of passing it through as `undefined`.
    ...(process.env.CDK_DEFAULT_ACCOUNT ? { account: process.env.CDK_DEFAULT_ACCOUNT } : {}),
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  useCustomDomain: true,
});

new BootstrapStack(app, 'PosterWallsBootstrap', {
  stackName: 'PosterWallsBootstrap',
  env: {
    ...(process.env.CDK_DEFAULT_ACCOUNT ? { account: process.env.CDK_DEFAULT_ACCOUNT } : {}),
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  githubOwner: 'CrispyCabot',
  githubRepo: 'poster-walls-editor',
  githubOwnerId: '18431358',
  githubRepoId: '1312969424',
});
