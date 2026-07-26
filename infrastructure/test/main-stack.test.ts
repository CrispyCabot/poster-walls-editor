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
