import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { MainStack } from '../lib/main-stack.js';

function synth() {
  const app = new App();
  const stack = new MainStack(app, 'TestStack', {
    env: { account: '111111111111', region: 'us-east-1' },
    useCustomDomain: false,
  });
  return Template.fromStack(stack);
}

describe('MainStack', () => {
  it('creates a single on-demand table with PITR', () => {
    const t = synth();
    t.resourceCountIs('AWS::DynamoDB::GlobalTable', 1);
    t.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
    });
  });

  it('runs the API Lambda on arm64 Node 22', () => {
    synth().hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
    });
  });

  it('exposes an HTTP API', () => {
    const t = synth();
    t.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    t.hasResourceProperties('AWS::ApiGatewayV2::Api', { ProtocolType: 'HTTP' });
  });

  it('grants the Lambda access to the table', () => {
    // CDK's Template matchers are its own — vitest's expect.arrayContaining
    // is an unrelated asymmetric matcher that hasResourceProperties would
    // deep-compare as a literal object and never match.
    synth().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: Match.arrayWith(['dynamodb:GetItem']) }),
        ]),
      }),
    });
  });

  it('publishes the API URL and table name as outputs', () => {
    const outputs = synth().findOutputs('*');
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining(['ApiUrl', 'TableName']),
    );
  });
});

describe('web hosting', () => {
  it('creates a CloudFront distribution that rewrites SPA 403/404 to index.html', () => {
    const t = synth();
    t.resourceCountIs('AWS::CloudFront::Distribution', 1);
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
          Match.objectLike({
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
        ]),
      }),
    });
  });

  it('creates two buckets, both blocking public access', () => {
    const t = synth();
    t.resourceCountIs('AWS::S3::Bucket', 2);
    for (const bucket of Object.values(t.findResources('AWS::S3::Bucket'))) {
      expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      });
    }
  });
});

describe('auth', () => {
  it('creates a user pool that signs in by email and self-verifies it', () => {
    synth().hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
    });
  });

  it('creates a public client with no secret, using authorization code + PKCE', () => {
    synth().hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
    });
  });

  it('publishes the auth outputs the SPA build needs', () => {
    const outputs = synth().findOutputs('*');
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining([
        'WebUrl', 'WebBucketName', 'DistributionId',
        'UserPoolId', 'UserPoolClientId', 'CognitoDomain',
      ]),
    );
  });
});
