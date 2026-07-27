import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiConstruct } from './constructs/api.js';
import { AuthConstruct } from './constructs/auth.js';
import { DataConstruct } from './constructs/data.js';
import { WebConstruct } from './constructs/web.js';

export interface MainStackProps extends StackProps {
  /** Custom domain stays off until Namecheap NS delegation lands (Plan 4). */
  readonly useCustomDomain: boolean;
}

export class MainStack extends Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    const data = new DataConstruct(this, 'Data');
    const web = new WebConstruct(this, 'Web');

    const webUrl = `https://${web.distribution.distributionDomainName}`;
    const auth = new AuthConstruct(this, 'Auth', {
      webOrigins: [webUrl, 'http://localhost:5173'],
    });

    const api = new ApiConstruct(this, 'Api', { table: data.table });
    api.fn.addEnvironment('USER_POOL_ID', auth.userPool.userPoolId);
    api.fn.addEnvironment('USER_POOL_CLIENT_ID', auth.client.userPoolClientId);
    api.fn.addEnvironment('WEB_ORIGIN', webUrl);
    api.fn.addEnvironment('IMAGES_BUCKET', web.imagesBucket.bucketName);
    // The API mints presigned PUT URLs, which requires it to hold the
    // permission it is delegating.
    web.imagesBucket.grantPut(api.fn);

    new CfnOutput(this, 'ApiUrl', { value: api.httpApi.apiEndpoint });
    new CfnOutput(this, 'TableName', { value: data.table.tableName });
    new CfnOutput(this, 'WebUrl', { value: webUrl });
    new CfnOutput(this, 'WebBucketName', { value: web.webBucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: web.distribution.distributionId });
    new CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: auth.client.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', {
      value: `https://${auth.domainPrefix}.auth.${this.region}.amazoncognito.com`,
    });
  }
}
