import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BootstrapStack } from '../lib/bootstrap-stack.js';
import { MainStack } from '../lib/main-stack.js';
import { ENVIRONMENT_TAG, PROJECT_TAG } from '../lib/tags.js';

interface SynthResource {
  Type: string;
  Properties?: Record<string, unknown>;
}

let cachedMain: Template | undefined;
let cachedBootstrap: Template | undefined;

/** Synthesized once for the whole file — see the note in main-stack.test.ts. */
function synthMain(): Template {
  if (cachedMain === undefined) {
    const app = new App();
    // Custom domain ON, unlike the other suites. The hosted zone and the
    // certificate only exist in that phase, and they are two of the three
    // resource types whose tags live under a non-standard property name.
    const stack = new MainStack(app, 'TestStack', {
      env: { account: '111111111111', region: 'us-east-1' },
      useCustomDomain: true,
    });
    cachedMain = Template.fromStack(stack);
  }
  return cachedMain;
}

function synthBootstrap(): Template {
  if (cachedBootstrap === undefined) {
    const app = new App();
    const stack = new BootstrapStack(app, 'TestBootstrap', {
      env: { account: '111111111111', region: 'us-east-1' },
      githubOwner: 'CrispyCabot',
      githubRepo: 'poster-walls-editor',
      githubOwnerId: '18431358',
      githubRepoId: '1312969424',
    });
    cachedBootstrap = Template.fromStack(stack);
  }
  return cachedBootstrap;
}

/**
 * Reads a resource's tags as a flat map, whatever shape CloudFormation gave
 * them. There are four in play here and no assertion helper covers them all:
 *
 *   `Tags` as a [{Key, Value}] list   S3, CloudFront, Lambda, IAM, ACM, Logs
 *   `Tags` as a {key: value} map      API Gateway v2 (api, stage, domain name)
 *   `UserPoolTags` as a map           Cognito
 *   `HostedZoneTags` as a list        Route 53
 *
 * Returns undefined when a resource carries no tags at all, which is how the
 * sweep below tells "not taggable" apart from "taggable but missed".
 */
function tagsOf(resource: SynthResource): Record<string, string> | undefined {
  const props = resource.Properties ?? {};

  // TableV2 is the odd one out: it synthesizes to AWS::DynamoDB::GlobalTable,
  // which has no top-level Tags — they sit on each regional replica.
  if (resource.Type === 'AWS::DynamoDB::GlobalTable') {
    const replicas = props.Replicas as { Tags?: { Key: string; Value: string }[] }[] | undefined;
    const tags = replicas?.[0]?.Tags;
    return tags && Object.fromEntries(tags.map((t) => [t.Key, t.Value]));
  }

  const raw = props.Tags ?? props.UserPoolTags ?? props.HostedZoneTags;
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    return Object.fromEntries((raw as { Key: string; Value: string }[]).map((t) => [t.Key, t.Value]));
  }
  return raw as Record<string, string>;
}

function taggedResources(template: Template): [string, SynthResource, Record<string, string>][] {
  const resources = (template.toJSON() as { Resources: Record<string, SynthResource> }).Resources;
  return Object.entries(resources).flatMap(([id, resource]) => {
    const tags = tagsOf(resource);
    return tags === undefined ? [] : [[id, resource, tags] as [string, SynthResource, Record<string, string>]];
  });
}

/** The one resource of a given type, when the stack is meant to have exactly one. */
function only(template: Template, type: string): Record<string, string> {
  const matches = taggedResources(template).filter(([, r]) => r.Type === type);
  expect(matches, `expected exactly one tagged ${type}`).toHaveLength(1);
  return matches[0]![2];
}

describe.each([
  ['MainStack', synthMain],
  ['BootstrapStack', synthBootstrap],
])('%s tagging', (_name, synth) => {
  it('puts project and environment on every taggable resource', () => {
    const resources = taggedResources(synth());
    // Guards the sweep itself: if tagsOf ever stops recognizing a shape, this
    // would otherwise pass vacuously over an empty list.
    expect(resources.length).toBeGreaterThan(0);

    for (const [id, resource, tags] of resources) {
      expect(tags.project, `${resource.Type} ${id}`).toBe(PROJECT_TAG);
      expect(tags.environment, `${resource.Type} ${id}`).toBe(ENVIRONMENT_TAG);
    }
  });

  it('marks the environment as production', () => {
    // Spelled out rather than compared to the constant — this is the value the
    // billing filters are written against, so changing it should fail here.
    for (const [, , tags] of taggedResources(synth())) {
      expect(tags.environment).toBe('prd');
    }
  });

  it('gives every taggable resource a component', () => {
    for (const [id, resource, tags] of taggedResources(synth())) {
      expect(tags.component, `${resource.Type} ${id} has no component tag`).toBeDefined();
    }
  });
});

describe('component tags', () => {
  it('names the project so it can be told apart from the sibling site', () => {
    // Both projects deploy into the same AWS account, so `project` is the only
    // thing separating this app's resources from wedding-website's.
    expect(PROJECT_TAG).toBe('poster-walls-editor');
  });

  it('separates data, api, web and dns within the main stack', () => {
    // No 'auth' component here anymore: the pool moved to CoreInfra
    // (household-manager spec §2), so this stack no longer owns any
    // Cognito resource to tag.
    const t = synthMain();
    expect(only(t, 'AWS::DynamoDB::GlobalTable').component).toBe('data');
    expect(only(t, 'AWS::Lambda::Function').component).toBe('api');
    expect(only(t, 'AWS::ApiGatewayV2::Api').component).toBe('api');
    expect(only(t, 'AWS::CloudFront::Distribution').component).toBe('web');
    expect(only(t, 'AWS::Route53::HostedZone').component).toBe('dns');
    expect(only(t, 'AWS::CertificateManager::Certificate').component).toBe('dns');
  });

  it('splits the two buckets, so user uploads are not filed under the build output', () => {
    // The images bucket is RETAINed and grows with usage; the web bucket is
    // rebuilt from a `git push` and is safe to destroy. A single `web` tag
    // covering both would hide exactly that distinction.
    const buckets = taggedResources(synthMain())
      .filter(([, r]) => r.Type === 'AWS::S3::Bucket')
      .map(([, , tags]) => tags.component);

    expect(buckets.toSorted()).toEqual(['media', 'web']);
  });

  it('files the deploy role under ci-cd, not under the application', () => {
    expect(only(synthBootstrap(), 'AWS::IAM::Role').component).toBe('ci-cd');
  });
});
